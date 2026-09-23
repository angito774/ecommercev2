import { sql } from 'drizzle-orm';
import {
  check,
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

// Determina boleta (`dni`) vs factura (`ruc`). El dato se captura en **nuestro** checkout,
// antes de crear la sesión de Stripe (spec 022, D-2).
export const buyerDocumentType = pgEnum('buyer_document_type', ['dni', 'ruc']);

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
    // Datos fiscales del comprador (spec 022, §5.1). `buyer_document_type` es **nullable
    // a propósito** y no «notNull con default»: un default inventaría un DNI para los
    // pedidos anteriores a la migración `0010`. `null` significa literalmente «este pedido
    // no se puede facturar» y es lo que dispara el `invoice.skipped` del fulfillment (AC8).
    buyerDocumentType: buyerDocumentType('buyer_document_type'),
    buyerDocumentNumber: varchar('buyer_document_number', { length: 11 }),
    // Razón social. Solo con `ruc`.
    buyerLegalName: varchar('buyer_legal_name', { length: 160 }),
    // Suma acumulada de reembolsos. **La escribe el spec 023**; aquí solo nace, para que
    // 023 no necesite migración (§0).
    refundedAmountCents: integer('refunded_amount_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('orders_user_id_created_at_idx').on(t.userId, t.createdAt.desc()),
    index('orders_status_idx').on(t.status),
    // Sin índice sobre el documento del comprador: ninguna consulta filtra por él.
    // Buscar un pedido por RUC es una funcionalidad que nadie ha pedido (§11).
    //
    // Los tres datos fiscales viajan juntos o no viajan: un tipo sin número sería un
    // pedido a medio identificar y no hay ningún camino que lo produzca.
    check(
      'orders_buyer_document_pair',
      sql`(${t.buyerDocumentType} is null) = (${t.buyerDocumentNumber} is null)`,
    ),
    // La longitud por tipo sí cabe en un `CHECK` de fila, a diferencia del invariante
    // cruzado de `stock_movements` (spec 021, D-3): los dos valores están en la misma
    // fila. El dígito verificador del RUC no: es aritmética que vive en Zod (§6.2).
    check(
      'orders_buyer_document_length',
      sql`${t.buyerDocumentNumber} is null
          or (${t.buyerDocumentType} = 'dni' and char_length(${t.buyerDocumentNumber}) = 8)
          or (${t.buyerDocumentType} = 'ruc' and char_length(${t.buyerDocumentNumber}) = 11)`,
    ),
    // Razón social solo en factura. Es lo que impide que una boleta arrastre el nombre de
    // una empresa que nadie validó.
    check(
      'orders_buyer_legal_name_requires_ruc',
      sql`${t.buyerLegalName} is null or ${t.buyerDocumentType} = 'ruc'`,
    ),
    // Nunca se devuelve más de lo cobrado. Lo escribe 023, pero la barrera nace aquí:
    // añadirla después obligaría a validar los datos ya existentes.
    check(
      'orders_refunded_amount_within_total',
      sql`${t.refundedAmountCents} >= 0
          and ${t.refundedAmountCents} <= ${t.amountTotalCents}`,
    ),
  ],
);
