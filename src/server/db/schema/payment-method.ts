import { index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './user';

// Solo lo que hace falta para que el cliente reconozca su tarjeta: marca, cuatro
// últimos dígitos y caducidad. Ningún dígito más del PAN, ningún CVC y ninguna
// dirección de facturación (spec 009, D-3): Stripe no expone el IIN en una petición
// estándar y guardar más dígitos nos metería en un alcance PCI del que hoy estamos
// fuera.
//
// Sin `updated_at`: la fila se inserta al guardar y se borra al eliminar, nunca se
// actualiza. Añadir la columna con su `$onUpdate` prometería una mutación que no
// existe (D-12).
//
// Sin `stripe_customer_id`: el Customer es del usuario, no de la tarjeta. Vive en
// `users` porque hay que poder leerlo cuando el usuario todavía no tiene ninguna
// tarjeta —justo el momento de decidir si crearlo o reutilizarlo— (D-6).
export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `restrict`, mismo criterio que `orders.user_id`: `syncUserDeleted` desactiva
    // la fila espejo, nunca la borra, así que hoy nada dispara la cláusula.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // El `unique` no es cosmético: es la idempotencia del webhook. Una reentrega del
    // mismo `checkout.session.completed` choca contra el constraint y el
    // `onConflictDoNothing` del repositorio la absorbe sin segunda fila (D-7, AC7).
    stripePaymentMethodId: varchar('stripe_payment_method_id', { length: 255 })
      .notNull()
      .unique(),
    brand: varchar('brand', { length: 32 }).notNull(),
    last4: varchar('last4', { length: 4 }).notNull(),
    expMonth: integer('exp_month').notNull(),
    expYear: integer('exp_year').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Exactamente la consulta del listado: las tarjetas de un usuario, de la más
  // reciente a la más antigua.
  (t) => [index('payment_methods_user_id_created_at_idx').on(t.userId, t.createdAt.desc())],
);
