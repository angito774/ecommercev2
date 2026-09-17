import { sql } from 'drizzle-orm';
import { date, index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { employees } from './employee';

export const payrollPayments = pgTable(
  'payroll_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `restrict`: los empleados se dan de baja, nunca se borran, así que hoy nada
    // dispara la cláusula. Deja escrito que un pago no puede quedar huérfano.
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    // 'AAAA-MM'. Ancho fijo: el orden lexicográfico coincide con el cronológico,
    // igual que la comparación de ISO 8601 de `adminOrderQuerySchema` (D-5).
    period: varchar('period', { length: 7 }).notNull(),
    paidAt: date('paid_at', { mode: 'string' }).notNull(),
    // Snapshot del importe pagado, independiente de `employees.base_salary_cents`:
    // una subida de sueldo posterior no debe reescribir lo que ya se pagó. Mismo
    // criterio que `order_items` congelando el precio (spec 007).
    amountCents: integer('amount_cents').notNull(),
    // Anulación lógica. `null` = pago vivo. No hay `updated_at`: la única mutación
    // posible es esta y su propia marca es la fecha (D-7).
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Un solo pago vivo por empleado y mes (AC11). Parcial: las filas anuladas no
    // cuentan, así que corregir un pago es anular y volver a registrar (AC12). Sin
    // el `where`, anular y rehacer el pago de un mes sería imposible.
    uniqueIndex('payroll_payments_employee_period_active_idx')
      .on(t.employeeId, t.period)
      .where(sql`${t.voidedAt} is null`),
    index('payroll_payments_period_idx').on(t.period),
    index('payroll_payments_employee_id_idx').on(t.employeeId),
  ],
);
