import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { TAX_CREDIT_RECEIPT_TYPES } from '@/lib/purchase-receipts';
import type { ExpenseQueryParams } from '@/modules/finance/schemas/finance.schema';
import type {
  DeclarableSalesByKind,
  ExpenseCategoryTotal,
  ExpenseReceipt,
  ExpenseRow,
} from '@/modules/finance/types/finance.types';
import { db, type Reader, type Tx } from '@/server/db';
import { electronicDocuments, expenses, orders, users } from '@/server/db/schema';

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

// ---------------------------------------------------------------------------
// Ventas declarables (spec 025)
// ---------------------------------------------------------------------------

// El padre del auto-join. Se declara una vez a nivel de módulo y no dentro de la
// función: el alias es parte de la forma de la consulta, y `buildDeclarableFilter()`
// tiene que referirse exactamente al mismo para que el `WHERE` y el `JOIN` hablen de la
// misma tabla.
const parentDocuments = alias(electronicDocuments, 'parent_document');

export type ParentAlias = typeof parentDocuments;

/**
 * La regla de «venta declarable» (§5.2), exportada para compilarla con `PgDialect` y
 * probarla sin base de datos: es la pieza que decide qué se declara ante SUNAT, y
 * equivocarse aquí es declarar ventas que no existen.
 *
 * Un documento cuenta cuando **(a)** está `issued`, **(b)** su `issued_at` cae en el
 * rango y **(c)** la venta que documenta sigue contando: o no tiene padre —es un
 * original— o su padre sigue `issued`.
 *
 * La condición (c) es la que se aparta de la fórmula del diseño, que restaba **toda**
 * nota de crédito emitida. No vale: `voidsParent()` deja `voided` al original cuando la
 * nota lleva motivo 01, 06, 02 o 03, y en la misma transacción en que la emite
 * (`voidParentAndReissue()`). Con la fórmula del diseño, una anulación total fuera de
 * ventana declararía ventas **negativas** y una corrección de comprador declararía cero.
 * Preguntar por el estado real del padre da el número correcto en los cinco caminos de
 * ajuste, absorbe la `comunicacion_baja` sin tratarla como caso especial —su padre
 * siempre queda `voided`— y no depende de la lista de motivos (D-1).
 */
export function buildDeclarableFilter({ from, to }: InstantRange, parent: ParentAlias): SQL {
  return and(
    eq(electronicDocuments.status, 'issued'),
    // Misma ventana semiabierta que los pedidos, derivada del mismo par de días: es lo
    // que hace imposible que una cifra cuente un día que la otra no (§5.3, AC4).
    gte(electronicDocuments.issuedAt, from),
    lt(electronicDocuments.issuedAt, to),
    or(isNull(electronicDocuments.relatedDocumentId), eq(parent.status, 'issued')),
  ) as SQL;
}

// La familia del padre cuando lo hay: la nota de crédito de una factura descuenta de
// facturas, no de boletas (AC12). Solo puede valer `boleta` o `factura`, porque solo esos
// dos `kind` carecen de padre —lo garantiza el `CHECK
// electronic_documents_original_has_no_parent`—, y el parentesco se lee de la columna y
// no de la letra de la serie (D-2).
const DECLARABLE_FAMILY = sql<DeclarableSalesByKind['kind']>`coalesce(${parentDocuments.kind}, ${electronicDocuments.kind})`;

// El signo lo da el `kind`: original `+`, nota de crédito `−`, nota de débito `+`. El
// `::bigint` con `Number()` de vuelta es el de siempre (017, D-11), y aquí importa por
// los dos extremos: la suma lleva signo, así que un `int4` desborda tanto por arriba como
// por abajo.
const DECLARABLE_AMOUNT = sql<string>`coalesce(sum(case when ${electronicDocuments.kind} = 'nota_credito' then -${electronicDocuments.amountCents} else ${electronicDocuments.amountCents} end), 0)::bigint`;

export type DeclarableSalesTotals = DeclarableSalesByKind[];

/**
 * Una sola consulta con auto-join al padre; devuelve el desglose por familia, del que el
 * handler deriva el total sumándolo (D-4). Sin `category`: la firma es lo que hace
 * imposible colar el filtro del detalle en el resultado del período (AC18).
 *
 * Se agrupa y se ordena **por ordinal** y no repitiendo la expresión: con un `coalesce`
 * en el `SELECT`, reutilizar la plantilla `sql` entre cláusulas es la condición exacta
 * que produjo el `42803` del spec 015 (D-5). El orden del enum de Postgres pone `boleta`
 * antes que `factura`, así que `order by 1` basta y no hace falta un `CASE` de ordenación.
 */
export async function findDeclarableSalesByKind(
  range: InstantRange,
  reader: Reader = db,
): Promise<DeclarableSalesTotals> {
  const rows = await reader
    .select({
      kind: DECLARABLE_FAMILY,
      amountCents: DECLARABLE_AMOUNT,
      documentCount: sql<number>`count(*) filter (where ${electronicDocuments.relatedDocumentId} is null)::int`,
      adjustmentCount: sql<number>`count(*) filter (where ${electronicDocuments.relatedDocumentId} is not null)::int`,
    })
    .from(electronicDocuments)
    // `leftJoin` del hijo al padre por `p.id`, así que el lado indexado es la clave
    // primaria y no hace falta un índice sobre `related_document_id` (§5.1).
    .leftJoin(parentDocuments, eq(parentDocuments.id, electronicDocuments.relatedDocumentId))
    .where(buildDeclarableFilter(range, parentDocuments))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return rows.map((row) => ({
    kind: row.kind,
    amountCents: toCents(row.amountCents),
    documentCount: row.documentCount,
    adjustmentCount: row.adjustmentCount,
  }));
}

// El `NOT EXISTS` mira «original `issued`», no «tiene alguna fila»: un pedido cuyo
// comprobante quedó `voided` y cuyo reemitido sigue `pending` cuenta como pendiente
// (AC17), que es la verdad —hoy no tiene comprobante ante SUNAT—. Se escribe como
// plantilla `sql` y no con `notExists(db.select()…)` para no construir la subconsulta con
// el `db` global cuando el llamador pasó su propio `reader`: aquí solo se genera texto.
//
// Constante de módulo porque no depende del rango. Se usa en una sola cláusula, así que
// no entra en la clase de bug del 42803 (reutilizar una plantilla entre `SELECT` y
// `GROUP BY`).
const WITHOUT_ISSUED_ORIGINAL = sql`not exists (select 1 from ${electronicDocuments} where ${and(
  eq(electronicDocuments.orderId, orders.id),
  isNull(electronicDocuments.relatedDocumentId),
  eq(electronicDocuments.status, 'issued'),
)})`;

/**
 * Pedidos `paid` del rango sin comprobante original `issued` (§5.3). Es la brecha entre
 * las dos cifras de ventas, no un error: la emisión es manual (022, D-8).
 *
 * Consulta aparte y no un `FILTER` más dentro de `findSalesTotals()` (D-6): allí haría
 * falta un join, y un join en la consulta que calcula `sum(amount_total_cents)` abre la
 * puerta a que un cambio de condición duplique filas y **falsee las ventas confirmadas**,
 * que es la cifra más mirada del panel. Como consulta aparte entra en el `Promise.all` y
 * no cuesta latencia.
 */
export async function findUninvoicedPaidOrderCount(
  { from, to }: InstantRange,
  reader: Reader = db,
): Promise<number> {
  const [row] = await reader
    .select({ value: sql<number>`count(*)::int` })
    .from(orders)
    // La misma ventana semiabierta y el mismo `status = 'paid'` que las ventas
    // confirmadas: el indicador cuenta un subconjunto exacto de los pedidos de la
    // primera card, no otro universo.
    .where(and(PAID, gte(orders.createdAt, from), lt(orders.createdAt, to), WITHOUT_ISSUED_ORIGINAL));

  return row?.value ?? 0;
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
