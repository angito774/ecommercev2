import { and, asc, count, desc, eq, gte, inArray, lt, lte, sql, type SQL } from 'drizzle-orm';

import { TAX_CREDIT_RECEIPT_TYPES } from '@/lib/purchase-receipts';
import type { ExpenseQueryParams } from '@/modules/finance/schemas/finance.schema';
import type {
  ExpenseCategoryTotal,
  ExpenseReceipt,
  ExpenseRow,
} from '@/modules/finance/types/finance.types';
import { db, type Reader, type Tx } from '@/server/db';
import { expenses, orders, users } from '@/server/db/schema';

type Expense = typeof expenses.$inferSelect;
type NewExpense = typeof expenses.$inferInsert;

// Repositorio propio y no una ampliación de `metrics.repository.ts` (D-1):
// `findKpiTotals()` recibe dos ventanas contiguas para comparar período contra
// período, mientras que aquí hace falta un único rango arbitrario combinado con la
// tabla `expenses`, que aquel repositorio no conoce.
//
// La regla `status = 'paid'` está duplicada a propósito en los dos repositorios —es
// la única línea compartida y se extrae a la tercera repetición, no antes
// (CLAUDE.md §6)—. Si cambia el criterio de «venta cobrada», hay que tocar los dos:
// `metrics.repository.ts` tiene su propia constante `PAID` con el mismo comentario.
const PAID = eq(orders.status, 'paid');

// `sum(int4)` ya devuelve `bigint` en Postgres; el casteo explícito deja escrito que
// el desbordamiento del `int4` está considerado y no es un accidente del motor
// (D-11): `sum(amount_total_cents)` desborda a partir de ~21,5 M PEN acumulados. El
// driver entrega los bigint como texto, así que el `Number()` de vuelta es
// obligatorio: sin él, dos importes se concatenarían como cadenas.
const toCents = (value: string | null): number => Number(value ?? 0);

/** Semiabierto `[from, to)`: el instante `to` pertenece a la ventana siguiente. */
export type InstantRange = { from: Date; to: Date };

/** Días `'YYYY-MM-DD'`, inclusivo en ambos extremos, tal y como se leen (AC8). */
export type DayRange = { fromDay: string; toDay: string };

export type SalesTotals = { revenueCents: number; orderCount: number };

export async function findSalesTotals(
  { from, to }: InstantRange,
  reader: Reader = db,
): Promise<SalesTotals> {
  const [row] = await reader
    .select({
      revenueCents: sql<string>`coalesce(sum(${orders.amountTotalCents}), 0)::bigint`,
      orderCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    // `gte`/`lt`: la ventana es semiabierta. Con `lte` en `to`, un pedido de medianoche
    // exacta caería también en el rango siguiente.
    .where(and(PAID, gte(orders.createdAt, from), lt(orders.createdAt, to)));

  return {
    revenueCents: toCents(row?.revenueCents ?? null),
    orderCount: row?.orderCount ?? 0,
  };
}

export type ExpenseFilters = DayRange & { category?: ExpenseQueryParams['category'] };

// Exportada para poder probarla sin base de datos: es la pieza con reglas —los dos
// extremos inclusivos y el `all` que no filtra— y el resto es fontanería de Drizzle.
//
// Devuelve `SQL` y no `SQL | undefined`: el rango está siempre, así que este WHERE
// nunca es vacío. Un agregado de gastos sin rango sumaría la tabla entera.
export function buildExpenseFilters({ fromDay, toDay, category }: ExpenseFilters): SQL {
  const conditions: SQL[] = [
    // `gte`/`lte` y no la ventana semiabierta de los pedidos: `incurred_on` es una
    // columna `date` sin hora, así que el último día se incluye tal cual (AC8).
    gte(expenses.incurredOn, fromDay),
    lte(expenses.incurredOn, toDay),
  ];

  if (category && category !== 'all') conditions.push(eq(expenses.category, category));

  return and(...conditions) as SQL;
}

export type ExpenseTotals = {
  expensesCents: number;
  expenseCount: number;
  igvCreditableCents: number;
  igvCreditableCount: number;
  igvTotalCents: number;
  igvCount: number;
};

// El `in (…)` se construye con `inArray` sobre la tupla **derivada** del catálogo: el
// SQL del agregado y la vista leen la misma regla, así que no pueden discrepar sobre qué
// cuenta como crédito fiscal (AC16, D-4).
const CREDITABLE = inArray(expenses.receiptType, TAX_CREDIT_RECEIPT_TYPES);

// Sin el filtro de categoría: el resumen es el resultado del período completo y la
// categoría filtra el detalle, no el resultado (D-17, AC20, AC17). La firma es lo que
// hace imposible colárselo.
//
// Los cuatro agregados de IGV salen de **esta misma pasada** y no de una quinta función
// (D-9): misma tabla, mismo rango y mismo `WHERE`, así que una segunda consulta sería un
// segundo escaneo para números que por definición no pueden divergir del primero. Sin
// `GROUP BY`, así que no entra en la clase de bug del 42803 del spec 015.
export async function findExpenseTotals(
  range: DayRange,
  reader: Reader = db,
): Promise<ExpenseTotals> {
  const [row] = await reader
    .select({
      expensesCents: sql<string>`coalesce(sum(${expenses.amountCents}), 0)::bigint`,
      expenseCount: sql<number>`count(*)::int`,
      // `::bigint` + `Number()` como el resto de las sumas del módulo (017, D-11): el
      // driver entrega los bigint como texto y sin la conversión dos importes se
      // concatenarían como cadenas.
      igvCreditableCents: sql<string>`coalesce(sum(${expenses.igvCents}) filter (where ${CREDITABLE}), 0)::bigint`,
      // Cuenta comprobantes con IGV calculado, no filas: un tipo elegible sin IGV no es
      // un comprobante del que se tome crédito.
      igvCreditableCount: sql<number>`count(*) filter (where ${expenses.igvCents} is not null and ${CREDITABLE})::int`,
      igvTotalCents: sql<string>`coalesce(sum(${expenses.igvCents}), 0)::bigint`,
      igvCount: sql<number>`count(*) filter (where ${expenses.igvCents} is not null)::int`,
    })
    .from(expenses)
    .where(buildExpenseFilters(range));

  return {
    expensesCents: toCents(row?.expensesCents ?? null),
    expenseCount: row?.expenseCount ?? 0,
    igvCreditableCents: toCents(row?.igvCreditableCents ?? null),
    igvCreditableCount: row?.igvCreditableCount ?? 0,
    igvTotalCents: toCents(row?.igvTotalCents ?? null),
    igvCount: row?.igvCount ?? 0,
  };
}

const CATEGORY_TOTAL = sql<string>`coalesce(sum(${expenses.amountCents}), 0)::bigint`;

// Solo las categorías con al menos una fila: `group by` no inventa grupos vacíos, y
// pintar las ocho con 0 diría que el dinero se reparte donde no se ha gastado nada.
//
// Se agrupa por la columna real y no por una plantilla `sql` reutilizada entre
// cláusulas, que es la condición exacta que provocó el 42803 del spec 015. Si algún
// día entra un `CASE` o un `to_char` en este SELECT, hay que agrupar por ordinal
// (§10).
export async function findExpenseTotalsByCategory(
  range: DayRange,
  reader: Reader = db,
): Promise<ExpenseCategoryTotal[]> {
  const rows = await reader
    .select({
      category: expenses.category,
      amountCents: CATEGORY_TOTAL,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(buildExpenseFilters(range))
    .groupBy(expenses.category)
    // La categoría desempata a las que comparten importe: sin ella el orden entre
    // iguales lo decide Postgres y la lista puede reordenarse sola entre dos cargas.
    .orderBy(desc(CATEGORY_TOTAL), asc(expenses.category));

  return rows.map((row) => ({
    category: row.category,
    amountCents: toCents(row.amountCents),
    count: row.count,
  }));
}

export type ExpenseListResult = { data: ExpenseRow[]; total: number };

type ReceiptColumns = Pick<
  Expense,
  'receiptType' | 'supplierRuc' | 'supplierName' | 'receiptSeries' | 'receiptNumber' | 'igvCents'
>;

// `null` cuando el gasto no declaró comprobante, que es todo lo anterior a la migración
// `0012` (AC21).
//
// La comprobación mira las tres columnas y no solo `receipt_type` porque es lo que
// estrecha el tipo sin un `as`: el `CHECK expenses_receipt_all_or_nothing` ya garantiza
// que las tres viajan juntas, pero TypeScript no lee constraints de Postgres.
function toExpenseReceipt(columns: ReceiptColumns): ExpenseReceipt | null {
  const { receiptType, supplierRuc, supplierName } = columns;

  if (receiptType === null || supplierRuc === null || supplierName === null) return null;

  return {
    type: receiptType,
    supplierRuc,
    supplierName,
    series: columns.receiptSeries,
    number: columns.receiptNumber,
    igvCents: columns.igvCents,
  };
}

// Orden fijo, sin `sortBy` en la query: un registro de gastos se lee por fecha, de lo
// más reciente a lo más antiguo. `created_at` desempata los del mismo día y el `id`
// cierra el desempate para que la paginación sea estable: sin él, dos gastos idénticos
// pueden repetirse entre páginas (AC19).
export async function findManyExpenses(
  params: ExpenseQueryParams,
  range: DayRange,
  reader: Reader = db,
): Promise<ExpenseListResult> {
  const { page, pageSize, category } = params;
  const where = buildExpenseFilters({ ...range, category });

  const [rows, [totals]] = await Promise.all([
    reader
      .select({
        id: expenses.id,
        concept: expenses.concept,
        amountCents: expenses.amountCents,
        category: expenses.category,
        incurredOn: expenses.incurredOn,
        createdById: expenses.createdById,
        createdAt: expenses.createdAt,
        // Las seis columnas del comprobante salen del mismo SELECT: ni una consulta más
        // ni un N+1 (spec 024, §10).
        receiptType: expenses.receiptType,
        supplierRuc: expenses.supplierRuc,
        supplierName: expenses.supplierName,
        receiptSeries: expenses.receiptSeries,
        receiptNumber: expenses.receiptNumber,
        igvCents: expenses.igvCents,
        firstName: users.firstName,
        lastName: users.lastName,
        createdByEmail: users.email,
      })
      .from(expenses)
      // `innerJoin` y no una consulta por fila: `created_by_id` es `notNull` con FK
      // `restrict`, así que la fila de `users` existe siempre (§10, sin N+1).
      .innerJoin(users, eq(users.id, expenses.createdById))
      .where(where)
      .orderBy(desc(expenses.incurredOn), desc(expenses.createdAt), desc(expenses.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    // El conteo no necesita el join: los tres filtros viven en `expenses`.
    reader.select({ value: count() }).from(expenses).where(where),
  ]);

  return {
    total: totals?.value ?? 0,
    data: rows.map(
      ({
        firstName,
        lastName,
        createdAt,
        receiptType,
        supplierRuc,
        supplierName,
        receiptSeries,
        receiptNumber,
        igvCents,
        ...row
      }) => ({
        ...row,
        // ISO y no `Date`: JSON no transporta fechas y el tipo del cliente no debe
        // mentir sobre lo que recibe.
        createdAt: createdAt.toISOString(),
        // `null` cuando Clerk no dio ni nombre ni apellido: la celda cae al correo en
        // vez de pintar una cadena vacía.
        createdByName: [firstName, lastName].filter(Boolean).join(' ') || null,
        // El objeto entero o `null`, no seis campos sueltos: el componente hace una
        // comprobación en vez de seis.
        receipt: toExpenseReceipt({
          receiptType,
          supplierRuc,
          supplierName,
          receiptSeries,
          receiptNumber,
          igvCents,
        }),
      }),
    ),
  };
}

// Con `reader` para que el `before` de la bitácora se lea dentro de la transacción del
// UPDATE y registre exactamente el estado sobre el que corre, igual que en productos.
export async function findExpenseById(id: string, reader: Reader = db): Promise<Expense | null> {
  const [expense] = await reader.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  return expense ?? null;
}

// Los tres mutadores reciben `Tx` y no admiten el `db` global: así es imposible
// escribir un gasto sin su entrada en `audit_logs` (docs/SETUP.md §5.2, regla 2).
export async function createExpense(tx: Tx, values: NewExpense): Promise<Expense> {
  const [expense] = await tx.insert(expenses).values(values).returning();
  return expense;
}

export async function updateExpense(
  tx: Tx,
  id: string,
  values: Partial<NewExpense>,
): Promise<Expense | null> {
  const [expense] = await tx
    .update(expenses)
    .set(values)
    .where(eq(expenses.id, id))
    .returning();

  return expense ?? null;
}

// Borrado físico (D-7): `expenses` no tiene dependientes, y un `is_active` obligaría a
// que las tres consultas de agregado recordaran el filtro —olvidarlo en una sumaría
// gastos borrados al resultado—. La traza no se pierde: `expense.deleted` guarda la
// fila completa y `audit_logs` es append-only.
export async function deleteExpense(tx: Tx, id: string): Promise<Expense | null> {
  const [expense] = await tx.delete(expenses).where(eq(expenses.id, id)).returning();
  return expense ?? null;
}
