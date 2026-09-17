import { and, asc, count, eq, ilike, or, sql, type SQL } from 'drizzle-orm';

import { escapeLikePattern } from '@/lib/utils';
import type {
  CreateEmployeeValues,
  EmployeeQueryParams,
  UpdateEmployeeValues,
} from '@/modules/payroll/schemas/employee.schema';
import type { EmployeeRow } from '@/modules/payroll/types/employee.types';
import { db, type Reader, type Tx } from '@/server/db';
import { employees } from '@/server/db/schema';

// Proyección positiva: se enumera lo que sale. `createdAt` y `updatedAt` quedan fuera
// porque son `Date` en el tipo y `string` en el JSON, y el módulo no hereda esa deuda
// (D-11). Una columna nueva en `employees` no se publica sola por añadirla al schema.
const EMPLOYEE_COLUMNS = {
  id: employees.id,
  employeeCode: employees.employeeCode,
  firstName: employees.firstName,
  lastName: employees.lastName,
  jobTitle: employees.jobTitle,
  hiredAt: employees.hiredAt,
  baseSalaryCents: employees.baseSalaryCents,
  isActive: employees.isActive,
} as const;

type EmployeeFilterParams = Pick<EmployeeQueryParams, 'search' | 'status'>;

// Exportada para poder probarla sin base de datos: es la pieza con reglas —las tres
// ramas de `status` y el escape de comodines— y el resto es fontanería de Drizzle.
export function buildEmployeeFilters(params: EmployeeFilterParams): SQL | undefined {
  const conditions: SQL[] = [];

  // `all` no añade la columna; las otras dos ramas la fijan. El default del schema es
  // `active`, así que el listado sin parámetros ya excluye a los ex empleados (D-14).
  if (params.status === 'active') conditions.push(eq(employees.isActive, true));
  if (params.status === 'inactive') conditions.push(eq(employees.isActive, false));

  const search = params.search?.trim();
  if (search) {
    // Sin escapar, buscar `%` devolvería la tabla entera como si fuera un resultado
    // (AC9). El valor sigue viajando como parámetro: esto no es inyección, es un
    // resultado incorrecto que quien consulta puede provocar.
    const pattern = `%${escapeLikePattern(search)}%`;

    // `concat_ws` y no `first_name || ' ' || last_name`: aquí ambas columnas son
    // `NOT NULL` y el `||` sería seguro, pero `buildOrderFilters` ya resolvió esta
    // misma búsqueda con `concat_ws` por el motivo contrario. Una sola forma en el
    // repositorio es una menos que verificar (D-22). La plantilla `sql` aparece solo
    // en el WHERE y no se reutiliza en `select`/`groupBy`/`orderBy`, así que no entra
    // en la clase de bug del spec 015.
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

export type EmployeeListResult = { data: EmployeeRow[]; total: number };

// Orden fijo, sin `sortBy` en la query: una planilla se lee alfabéticamente. El `id`
// cierra el desempate para que la paginación sea estable: sin él, dos homónimos pueden
// repetirse entre páginas.
export async function findMany(
  params: EmployeeQueryParams,
  reader: Reader = db,
): Promise<EmployeeListResult> {
  const { page, pageSize } = params;
  const where = buildEmployeeFilters(params);

  const [data, [totals]] = await Promise.all([
    reader
      .select(EMPLOYEE_COLUMNS)
      .from(employees)
      .where(where)
      .orderBy(asc(employees.lastName), asc(employees.firstName), asc(employees.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    reader.select({ value: count() }).from(employees).where(where),
  ]);

  return { data, total: totals?.value ?? 0 };
}

// Con `reader` para que el `before` de la bitácora y la comprobación del pago se lean
// dentro de la transacción de la mutación y vean el mismo estado que el UPDATE.
export async function findById(id: string, reader: Reader = db): Promise<EmployeeRow | null> {
  const [employee] = await reader
    .select(EMPLOYEE_COLUMNS)
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);

  return employee ?? null;
}

// Los tres mutadores reciben `Tx` y no admiten el `db` global: así es imposible mover
// la planilla sin su entrada en `audit_logs` (docs/SETUP.md §5.2, regla dura 2).
export async function create(tx: Tx, values: CreateEmployeeValues): Promise<EmployeeRow> {
  const [employee] = await tx.insert(employees).values(values).returning(EMPLOYEE_COLUMNS);
  return employee;
}

export async function update(
  tx: Tx,
  id: string,
  values: UpdateEmployeeValues,
): Promise<EmployeeRow | null> {
  const [employee] = await tx
    .update(employees)
    .set(values)
    .where(eq(employees.id, id))
    .returning(EMPLOYEE_COLUMNS);

  return employee ?? null;
}

// Baja lógica y nunca borrado: `payroll_payments` referencia la fila con `restrict`, y
// los pagos anteriores tienen que seguir siendo consultables (AC7).
export async function setActive(
  tx: Tx,
  id: string,
  isActive: boolean,
): Promise<EmployeeRow | null> {
  const [employee] = await tx
    .update(employees)
    .set({ isActive })
    .where(eq(employees.id, id))
    .returning(EMPLOYEE_COLUMNS);

  return employee ?? null;
}
