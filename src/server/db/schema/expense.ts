import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { users } from './user';

// Enum de Postgres y no tabla de categorías (spec 017, D-4): una lista que cambia
// una vez al año no justifica su propio CRUD, sus permisos y su seed. A cambio da un
// `Record<ExpenseCategory, string>` exhaustivo en TypeScript y un desglose type-safe.
// Coste aceptado: añadir un valor exige `ALTER TYPE … ADD VALUE`.
//
// Sin valor de nómina: los salarios son el spec 018 y no se les reserva sitio aquí.
export const expenseCategory = pgEnum('expense_category', [
  'suppliers',
  'logistics',
  'rent',
  'utilities',
  'marketing',
  'software',
  'taxes',
  'other',
]);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    concept: varchar('concept', { length: 160 }).notNull(),
    // Céntimos, como `products.price_cents` y `orders.amount_total_cents`.
    amountCents: integer('amount_cents').notNull(),
    category: expenseCategory('category').notNull(),
    // `date` y no `timestamptz`: un gasto ocurre un día, no en un instante, y la
    // columna sin hora no puede desplazarse de día al cruzar el huso (D-5).
    // `mode: 'string'` entrega 'YYYY-MM-DD' y evita el Date→UTC del driver.
    incurredOn: date('incurred_on', { mode: 'string' }).notNull(),
    // `restrict`: las personas se desactivan, no se borran. Un gasto no puede
    // quedar sin responsable, igual que `orders.user_id`.
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Sostiene tanto el filtro por rango del resumen como el orden del listado. Sin
    // índice por `category` ni por `created_by_id`: el volumen de un registro manual
    // no lo justifica y sería optimizar sin medida (§10).
    index('expenses_incurred_on_idx').on(t.incurredOn.desc()),
    // El invariante en la base y no solo en Zod: un gasto negativo invertiría el
    // signo del resultado y ningún camino de escritura —seed, migración de datos o
    // un `psql` a mano— debe poder crearlo (D-6).
    check('expenses_amount_cents_positive', sql`${t.amountCents} > 0`),
  ],
);
