import { boolean, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// Los anchos se exportan porque quien escribe la fila (webhook de Clerk, upsert JIT)
// tiene que acotar los valores antes del INSERT: Drizzle no expone el `length` de la
// columna en el tipo, y duplicar el número a mano crea dos verdades sobre el mismo
// límite.
export const USER_TEXT_LENGTHS = {
  clerkId: 64,
  email: 255,
  firstName: 120,
  lastName: 120,
  imageUrl: 500,
} as const;

// `email` no es unique a propósito: si alguien borra su cuenta de Clerk y vuelve a
// registrarse con el mismo correo obtiene un clerk_id nuevo, y el webhook debe poder
// insertar la fila sin colisionar con la histórica, que se conserva porque
// audit_logs.actor_id la referencia. `clerk_id` es la clave de identidad.
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkId: varchar('clerk_id', { length: USER_TEXT_LENGTHS.clerkId }).notNull().unique(),
    email: varchar('email', { length: USER_TEXT_LENGTHS.email }).notNull(),
    firstName: varchar('first_name', { length: USER_TEXT_LENGTHS.firstName }),
    lastName: varchar('last_name', { length: USER_TEXT_LENGTHS.lastName }),
    imageUrl: varchar('image_url', { length: USER_TEXT_LENGTHS.imageUrl }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('users_email_idx').on(t.email),
    index('users_is_active_idx').on(t.isActive),
    index('users_created_at_idx').on(t.createdAt.desc()),
  ],
);
