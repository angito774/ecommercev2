import { and, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';

import { escapeLikePattern } from '@/lib/utils';
import type {
  CreatePayrollPaymentValues,
  PayrollQueryParams,
} from '@/modules/payroll/schemas/payroll.schema';
import type { PayrollPaymentRow, PayrollPaymentStatus } from '@/modules/payroll/types/payroll.types';
import { db, type Reader, type Tx } from '@/server/db';
import { employees, payrollPayments } from '@/server/db/schema';

// Proyección positiva. `createdAt` no sale —sería un `Date` bajo un JSON `string`
// (D-11)— y `voidedAt` solo viaja hasta el mapeo, que lo convierte en `status`.
const PAYMENT_COLUMNS = {
  id: payrollPayments.id,
  employeeId: payrollPayments.employeeId,
  period: payrollPayments.period,
  paidAt: payrollPayments.paidAt,
  amountCents: payrollPayments.amountCents,
  voidedAt: payrollPayments.voidedAt,
  employeeCode: employees.employeeCode,
  firstName: employees.firstName,
  lastName: employees.lastName,
} as const;

type PaymentJoinRow = {
  id: string;
  employeeId: string;
  period: string;
  paidAt: string;
  amountCents: number;
  voidedAt: Date | null;
  employeeCode: string;
  firstName: string;
  lastName: string;
};

// El estado se deriva en TypeScript y no con un `CASE` en SQL, igual que
// `resolveStockStatus` (spec 016, D-9): así la consulta no agrupa ni reutiliza
// plantillas `sql` entre cláusulas, que es la clase de bug del spec 015.
export function resolvePaymentStatus(voidedAt: Date | null): PayrollPaymentStatus {
  return voidedAt === null ? 'paid' : 'voided';
}

function toPaymentRow({
  voidedAt,
  firstName,
  lastName,
  ...row
}: PaymentJoinRow): PayrollPaymentRow {
  return {
    ...row,
    status: resolvePaymentStatus(voidedAt),
    employeeFullName: `${firstName} ${lastName}`,
  };
}

type PayrollFilterParams = Pick<PayrollQueryParams, 'period' | 'search'>;

// Exportada para poder probarla sin base de datos: es la pieza con reglas —el centinela
// `all` y el escape de comodines— y el resto es fontanería de Drizzle.
export function buildPayrollFilters(params: PayrollFilterParams): SQL | undefined {
  const conditions: SQL[] = [];

  // `all` no añade la columna: es «sin filtro», no un periodo más.
  if (params.period !== 'all') conditions.push(eq(payrollPayments.period, params.period));

  const search = params.search?.trim();
  if (search) {
    // Sin escapar, buscar `%` devolvería la tabla entera como si fuera un resultado
    // (AC9). El valor sigue viajando como parámetro.
    const pattern = `%${escapeLikePattern(search)}%`;

    // Sobre los datos del empleado unido: quien consulta la bitácora de pagos busca
    // por persona, no por importe. Misma forma `concat_ws` que el otro repositorio
    // (D-22).
    conditions.push(
      or(
        ilike(employees.employeeCode, pattern),
        ilike(employees.firstName, pattern),
        ilike(employees.lastName, pattern),
        ilike(sql`concat_ws(' ', ${employees.firstName}, ${employees.lastName})`, pattern),
      ) as SQL,
    );
  }

  return conditions.length === 0 ? undefined : and(...conditions);
}

export type PayrollListResult = { data: PayrollPaymentRow[]; total: number };

// Orden fijo: el mes más reciente primero. El ancho fijo de `period` hace que el orden
// lexicográfico sea el cronológico (D-5). El `id` cierra el desempate para que la
// paginación sea estable.
export async function findMany(
  params: PayrollQueryParams,
  reader: Reader = db,
): Promise<PayrollListResult> {
  const { page, pageSize } = params;
  const where = buildPayrollFilters(params);

  const [rows, [totals]] = await Promise.all([
    reader
      .select(PAYMENT_COLUMNS)
      .from(payrollPayments)
      // `innerJoin` y no una consulta por fila: `employee_id` es `notNull` con FK
      // `restrict`, así que la fila de `employees` existe siempre.
      .innerJoin(employees, eq(employees.id, payrollPayments.employeeId))
      .where(where)
      .orderBy(desc(payrollPayments.period), desc(payrollPayments.paidAt), desc(payrollPayments.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    // El conteo sí necesita el join: la búsqueda filtra por columnas de `employees`.
    reader
      .select({ value: count() })
      .from(payrollPayments)
      .innerJoin(employees, eq(employees.id, payrollPayments.employeeId))
      .where(where),
  ]);

  return { data: rows.map(toPaymentRow), total: totals?.value ?? 0 };
}

export async function findById(id: string, reader: Reader = db): Promise<PayrollPaymentRow | null> {
  const [row] = await reader
    .select(PAYMENT_COLUMNS)
    .from(payrollPayments)
    .innerJoin(employees, eq(employees.id, payrollPayments.employeeId))
    .where(eq(payrollPayments.id, id))
    .limit(1);

  return row ? toPaymentRow(row) : null;
}

// El `voided_at is null` va dentro del filtro y no en el llamador: un pago anulado no
// ocupa el mes, y ese es exactamente el invariante que replica el índice único parcial
// (AC12). Exportado para compilarlo con `PgDialect` en el test, igual que los otros
// constructores de WHERE del repositorio.
export function buildActivePeriodFilter(employeeId: string, period: string): SQL {
  return and(
    eq(payrollPayments.employeeId, employeeId),
    eq(payrollPayments.period, period),
    isNull(payrollPayments.voidedAt),
  ) as SQL;
}

// Pre-comprobación del invariante «un solo pago vivo por empleado y mes». Corre dentro
// de la transacción y convive con el índice único parcial (D-19): el índice es el que
// garantiza el invariante bajo concurrencia, esta lectura es la que produce un mensaje
// que nombra el periodo en vez del genérico.
export async function findActiveByPeriod(
  employeeId: string,
  period: string,
  reader: Reader = db,
): Promise<PayrollPaymentRow | null> {
  const [row] = await reader
    .select(PAYMENT_COLUMNS)
    .from(payrollPayments)
    .innerJoin(employees, eq(employees.id, payrollPayments.employeeId))
    .where(buildActivePeriodFilter(employeeId, period))
    .limit(1);

  return row ? toPaymentRow(row) : null;
}

// Los dos mutadores reciben `Tx` y no admiten el `db` global: así es imposible mover un
// pago sin su entrada en `audit_logs` (docs/SETUP.md §5.2, regla dura 2).
//
// Se relee con `findById` en vez de mapear el `returning`: la fila necesita el nombre y
// el código del empleado, que vienen del join, y una sola forma de construir
// `PayrollPaymentRow` es una menos que mantener sincronizada.
export async function insert(
  tx: Tx,
  values: CreatePayrollPaymentValues,
): Promise<PayrollPaymentRow> {
  const [inserted] = await tx
    .insert(payrollPayments)
    .values(values)
    .returning({ id: payrollPayments.id });

  const row = await findById(inserted.id, tx);
  // Imposible en la práctica —acaba de insertarse dentro de esta misma transacción—,
  // pero el tipo no lo sabe y tragarse el caso con un `as` escondería un fallo real.
  if (!row) throw new Error('El pago recién insertado no se pudo releer.');

  return row;
}

// El `voided_at is null` del WHERE es la idempotencia (AC15): anular lo ya anulado no
// afecta a ninguna fila, así que no reescribe la marca original y dos pestañas que
// anulen a la vez no se pisan.
export function buildVoidableFilter(id: string): SQL {
  return and(eq(payrollPayments.id, id), isNull(payrollPayments.voidedAt)) as SQL;
}

// Devuelve `null` cuando no cambió nada —no existe o ya estaba anulado—; distinguir los
// dos casos es cosa del service, que ya lo leyó.
export async function markVoided(tx: Tx, id: string): Promise<PayrollPaymentRow | null> {
  const [updated] = await tx
    .update(payrollPayments)
    .set({ voidedAt: new Date() })
    .where(buildVoidableFilter(id))
    .returning({ id: payrollPayments.id });

  return updated ? findById(updated.id, tx) : null;
}
