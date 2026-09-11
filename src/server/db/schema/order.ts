import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './user';

// Los cuatro estados que el flujo puede producir hoy. `payment_failed` y `canceled`
// existen porque el webhook los recibe (`async_payment_failed`, `expired`): sin
// ellos esos eventos no tendrían dónde aterrizar y la orden se quedaría `pending`
// para siempre (spec 007, D-7).
export const orderStatus = pgEnum('order_status', [
  'pending',
  'paid',
  'payment_failed',
  'canceled',
]);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `restrict`: `syncUserDeleted` desactiva la fila espejo, nunca la borra, así
    // que hoy nada dispara la cláusula. Deja escrito que un pedido no puede quedar
    // huérfano de comprador.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: orderStatus('status').notNull().default('pending'),
    // Los tres importes son snapshots en céntimos del momento de la compra: un
    // cambio posterior de precio o de umbral de envío no debe reescribir lo que se
    // cobró.
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull(),
    amountTotalCents: integer('amount_total_cents').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('pen'),
    // Nullable porque la fila se inserta antes de que exista la sesión de Stripe.
    // `unique` es la red de seguridad de la idempotencia y la clave con la que la
    // página de éxito localiza el pedido (D-6).
    stripeCheckoutSessionId: varchar('stripe_checkout_session_id', { length: 255 }).unique(),
    stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
    // Sin normalizar: inventar un esquema de direcciones antes de saber quién lo
    // consulta sería adivinar. El spec de /admin/orders decidirá si merece columnas.
    shippingAddress: jsonb('shipping_address').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('orders_user_id_created_at_idx').on(t.userId, t.createdAt.desc()),
    index('orders_status_idx').on(t.status),
  ],
);
