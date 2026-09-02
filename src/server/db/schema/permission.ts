import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// Tabla semilla: los permisos nacen del código y solo se insertan desde db:seed
// (docs/SETUP.md §5.1, regla dura 4). Por eso no lleva `updated_at`.
export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 80 }).notNull().unique(),
    resource: varchar('resource', { length: 40 }).notNull(),
    action: varchar('action', { length: 40 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('permissions_resource_idx').on(t.resource)],
);
