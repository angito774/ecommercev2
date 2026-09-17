import type { EmployeeRow } from '../types/employee.types';

// La frontera que impide que un salario llegue a `audit_logs` (D-8).
//
// El riesgo tiene nombre: `audit_logs.read` lo tienen `audit` y `manager`, que por D-4
// **no** tienen `payroll.read`, y `audit-log-columns.tsx` renderiza `changes` y
// `metadata` íntegros. Escribir el salario en el log convertiría `/admin/audit-logs` en
// el listado de sueldos de la empresa para justo los roles a los que se les acaba de
// negar. Lo que la bitácora conserva es quién, cuándo, sobre qué empleado y qué campo
// cambió; la cifra vive en la tabla del dominio, protegida por su permiso.
//
// Es una función pura y probada, no un `delete` suelto en el handler: nada en el tipo
// de `AuditInput` lo impediría, porque `changes` es `unknown`. Toda acción de nómina
// que se audite en el futuro tiene que pasar por aquí.

/** El proyectado que sí puede entrar en la bitácora. Sin `baseSalaryCents` y sin `id`. */
export type AuditableEmployee = Omit<EmployeeRow, 'baseSalaryCents' | 'id'>;

export function toAuditableEmployee(row: EmployeeRow): AuditableEmployee {
  // Proyección positiva y no `delete`/rest: se enumera lo que sale, así que una columna
  // nueva y sensible en `employees` no se cuela sola en el log por haberla añadido al
  // schema. El `id` tampoco entra porque ya viaja como `entityId`.
  return {
    employeeCode: row.employeeCode,
    firstName: row.firstName,
    lastName: row.lastName,
    jobTitle: row.jobTitle,
    hiredAt: row.hiredAt,
    isActive: row.isActive,
  };
}

/**
 * Lo único que la bitácora dice del salario: que cambió. Ni el antes ni el después.
 * Devuelve `false` cuando el PATCH no traía el campo, porque entonces `before` y
 * `after` llevan el mismo importe (AC17).
 */
export function hasSalaryChange(before: EmployeeRow, after: EmployeeRow): boolean {
  return before.baseSalaryCents !== after.baseSalaryCents;
}
