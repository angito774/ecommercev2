import { boolean, date, index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// Tabla independiente de `users` y sin ninguna FK hacia ella (spec 018, D-1):
// `users` responde «esta cuenta de Clerk existe» y `roles`/`permissions` responden
// «qué puede tocar en el panel». Ninguno de los dos dice nada sobre una relación
// laboral, y el rol `employee` del catálogo —con su matriz de permisos vacía— es la
// prueba de que el nombre ya está sobrecargado. Un empleado aquí es un registro
// puramente administrativo; si además entra al panel, eso se resuelve por invitación
// y roles (spec 002) y las dos filas no se conocen.
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Identificador de planilla que teclea quien administra, igual que el SKU de un
    // producto. Es lo que impide dar de alta dos veces a la misma persona sin
    // necesidad de guardar su DNI (D-2).
    employeeCode: varchar('employee_code', { length: 30 }).notNull().unique(),
    firstName: varchar('first_name', { length: 120 }).notNull(),
    lastName: varchar('last_name', { length: 120 }).notNull(),
    // `job_title` y no `position`: `position` es una función de SQL estándar y aunque
    // Drizzle cita el identificador, el nombre invita a un bug de lectura.
    jobTitle: varchar('job_title', { length: 120 }).notNull(),
    // `date` y no `timestamptz`: una fecha de ingreso es un día del calendario, no un
    // instante. Con `mode: 'string'` entra y sale como 'YYYY-MM-DD' y nunca se
    // convierte en `Date` (D-11).
    hiredAt: date('hired_at', { mode: 'string' }).notNull(),
    // Céntimos enteros, como `price_cents` (CLAUDE.md §6). El punto decimal solo
    // existe en el `<input>` y en el formateo de la celda.
    baseSalaryCents: integer('base_salary_cents').notNull(),
    // Baja lógica. La fila nunca se borra: `payroll_payments` la referencia.
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // El listado filtra por defecto los activos (D-14) y ordena por apellido.
    index('employees_is_active_idx').on(t.isActive),
    index('employees_last_name_idx').on(t.lastName),
  ],
);
