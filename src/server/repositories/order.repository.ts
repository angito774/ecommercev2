import { and, asc, desc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';

import { MAX_ORDER_HISTORY } from '@/modules/orders/constants';
import type {
  OrderHistoryEntry,
  OrderLineDisplay,
  OrderSummary,
} from '@/modules/orders/types/order.types';
import type { OrderHistoryQueryParams } from '@/modules/orders/schemas/order-history.schema';
import { db, type Reader, type Tx } from '@/server/db';
import { orderItems, orders } from '@/server/db/schema';

type Order = typeof orders.$inferSelect;
type NewOrder = typeof orders.$inferInsert;
type OrderItem = typeof orderItems.$inferSelect;
type NewOrderItem = typeof orderItems.$inferInsert;

// Los mutadores reciben un `Tx` y no admiten el `db` global: así es imposible
// escribir una orden sin su entrada en `audit_logs` ni sus líneas, porque todo
// comparte la transacción del servicio (docs/SETUP.md §5.2, regla dura 2).
export async function create(tx: Tx, values: NewOrder): Promise<Order> {
  const [created] = await tx.insert(orders).values(values).returning();
  return created;
}

export async function createItems(
  tx: Tx,
  values: NewOrderItem[],
): Promise<OrderItem[]> {
  if (values.length === 0) return [];
  return tx.insert(orderItems).values(values).returning();
}

// Único mutador que no exige `Tx`: el `session_id` solo existe después de que
// Stripe cree la sesión, y eso ocurre con la transacción del INSERT ya commiteada
// (T14). No hay nada que auditar en este UPDATE —la orden sigue `pending` y sin
// efecto de negocio—, así que no rompe la regla dura de docs/SETUP.md §5.2.
export async function attachStripeSession(orderId: string, sessionId: string): Promise<void> {
  await db
    .update(orders)
    .set({ stripeCheckoutSessionId: sessionId })
    .where(eq(orders.id, orderId));
}

// `productId` viaja en la proyección porque el fulfillment lo necesita para
// descontar stock y la confirmación no lo pinta: es un uuid que el catálogo ya
// publica, así que una segunda proyección solo para ocultarlo no compraría nada.
const SUMMARY_ITEM_COLUMNS = {
  id: orderItems.id,
  productId: orderItems.productId,
  nameSnapshot: orderItems.nameSnapshot,
  imageUrlSnapshot: orderItems.imageUrlSnapshot,
  priceCentsSnapshot: orderItems.priceCentsSnapshot,
  quantity: orderItems.quantity,
} as const;

async function loadItems(orderId: string, reader: Reader) {
  return reader
    .select(SUMMARY_ITEM_COLUMNS)
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    // Sin orden explícito, Postgres no garantiza el mismo listado entre dos
    // renders de la misma confirmación.
    .orderBy(asc(orderItems.nameSnapshot));
}

// Misma proyección que `SUMMARY_ITEM_COLUMNS` menos `productId` —que el contrato
// del historial no publica— y más `orderId`, que aquí no es un dato de salida sino
// la clave con la que se reparten las líneas entre sus cabeceras.
const HISTORY_ITEM_COLUMNS = {
  id: orderItems.id,
  orderId: orderItems.orderId,
  nameSnapshot: orderItems.nameSnapshot,
  imageUrlSnapshot: orderItems.imageUrlSnapshot,
  priceCentsSnapshot: orderItems.priceCentsSnapshot,
  quantity: orderItems.quantity,
} as const;

// Una sola consulta para las líneas de toda la página, no un `loadItems` por
// pedido: con el tope de 60 cabeceras, la versión ingenua serían 60 viajes al pool
// serverless (§10). El `leftJoin` con la cabecera es la alternativa, pero repite
// la cabecera por línea y obliga a deduplicarla al leer.
async function loadItemsByOrder(
  orderIds: string[],
  reader: Reader,
): Promise<Map<string, OrderLineDisplay[]>> {
  const byOrder = new Map<string, OrderLineDisplay[]>();
  if (orderIds.length === 0) return byOrder;

  const rows = await reader
    .select(HISTORY_ITEM_COLUMNS)
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    // Mismo criterio que `loadItems`: sin orden explícito, dos renders del mismo
    // pedido pueden listar sus líneas en distinto orden.
    .orderBy(asc(orderItems.nameSnapshot));

  for (const { orderId, ...line } of rows) {
    const bucket = byOrder.get(orderId);
    if (bucket) bucket.push(line);
    else byOrder.set(orderId, [line]);
  }

  return byOrder;
}

// Proyección positiva: se enumera lo que sale, no lo que se oculta. Un `select()`
// sin argumentos publicaría `user_id`, los ids de Stripe y `shipping_address`
// (AC8). `stripePaymentIntentId` entra solo para colapsarse en `receiptAvailable`
// y nunca sale de esta función (D-4).
const HISTORY_ORDER_COLUMNS = {
  id: orders.id,
  status: orders.status,
  subtotalCents: orders.subtotalCents,
  shippingCents: orders.shippingCents,
  amountTotalCents: orders.amountTotalCents,
  createdAt: orders.createdAt,
  stripePaymentIntentId: orders.stripePaymentIntentId,
} as const;

export type OrderHistoryPage = {
  data: OrderHistoryEntry[];
  truncated: boolean;
};

// El `WHERE` completo del historial. El filtro por `user_id` va dentro, no
// después de leer: es lo que hace imposible devolver el pedido de otro (AC7).
// `isNotNull(stripeCheckoutSessionId)` descarta los intentos en los que la
// creación de la sesión de Stripe falló y el cliente nunca vio la pantalla de
// pago: mostrárselos sería inventarle un pedido que no hizo (D-14, AC14).
export async function findManyByUser(
  userId: string,
  { from, to }: OrderHistoryQueryParams,
  reader: Reader = db,
): Promise<OrderHistoryPage> {
  const rows = await reader
    .select(HISTORY_ORDER_COLUMNS)
    .from(orders)
    .where(
      and(
        eq(orders.userId, userId),
        isNotNull(orders.stripeCheckoutSessionId),
        from ? gte(orders.createdAt, new Date(from)) : undefined,
        to ? lte(orders.createdAt, new Date(to)) : undefined,
      ),
    )
    // `id` como desempate: dos pedidos con el mismo `created_at` al microsegundo
    // alternarían de posición entre dos consultas idénticas.
    .orderBy(desc(orders.createdAt), desc(orders.id))
    // Una fila de más que el tope: es lo que permite distinguir «caben justos» de
    // «había más y se recortó», sin una segunda consulta de conteo (D-5).
    .limit(MAX_ORDER_HISTORY + 1);

  const truncated = rows.length > MAX_ORDER_HISTORY;
  const page = truncated ? rows.slice(0, MAX_ORDER_HISTORY) : rows;
  const itemsByOrder = await loadItemsByOrder(
    page.map((row) => row.id),
    reader,
  );

  return {
    truncated,
    data: page.map((row) => ({
      id: row.id,
      status: row.status,
      subtotalCents: row.subtotalCents,
      shippingCents: row.shippingCents,
      amountTotalCents: row.amountTotalCents,
      // ISO y no `Date`: JSON no transporta `Date` y el tipo del cliente lo
      // declara `string` para no mentir (D-15).
      createdAt: row.createdAt.toISOString(),
      receiptAvailable: row.status === 'paid' && row.stripePaymentIntentId !== null,
      items: itemsByOrder.get(row.id) ?? [],
    })),
  };
}

// Fila completa, `stripePaymentIntentId` incluido: la consume el servicio de
// boleta en el servidor y nada de esto viaja al cliente. El filtro de propiedad
// va en el `WHERE`, igual que en `findBySessionIdForUser`, así que el pedido
// ajeno ni siquiera se llega a leer (D-13).
export async function findByIdForUser(
  orderId: string,
  userId: string,
  reader: Reader = db,
): Promise<Order | null> {
  const [order] = await reader
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);

  return order ?? null;
}

function toSummary(order: Order, items: OrderSummary['items']): OrderSummary {
  return {
    id: order.id,
    status: order.status,
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    amountTotalCents: order.amountTotalCents,
    createdAt: order.createdAt,
    items,
  };
}

export async function findByIdWithItems(
  id: string,
  reader: Reader = db,
): Promise<OrderSummary | null> {
  const [order] = await reader.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;

  return toSummary(order, await loadItems(order.id, reader));
}

// El filtro por `user_id` es lo que impide leer el pedido ajeno con un `session_id`
// robado o adivinado: sin él, la página de éxito filtraría el detalle de la compra
// de otra persona (D-16, AC11).
export async function findBySessionIdForUser(
  sessionId: string,
  userId: string,
  reader: Reader = db,
): Promise<OrderSummary | null> {
  const [order] = await reader
    .select()
    .from(orders)
    .where(
      and(eq(orders.stripeCheckoutSessionId, sessionId), eq(orders.userId, userId)),
    )
    .limit(1);

  if (!order) return null;

  return toSummary(order, await loadItems(order.id, reader));
}

// UPDATE condicional, no read-then-write: dos entregas concurrentes del mismo
// evento podrían pasar una comprobación en memoria las dos veces. Aquí la carrera
// la resuelve el motor — la segunda no encuentra ninguna fila `pending` y devuelve
// `null`, así que el servicio se sale sin tocar stock ni bitácora (D-5, AC6).
//
// El `WHERE ... status = 'pending'` vive en un solo sitio a propósito: es la
// invariante de idempotencia de las tres transiciones, y copiada tres veces bastaba
// con olvidarla en una para conceder un pedido dos veces.
type PendingTransition = Pick<NewOrder, 'stripePaymentIntentId' | 'shippingAddress'> & {
  // Sin `pending`: el estado de partida no es un destino válido.
  status: Exclude<Order['status'], 'pending'>;
};

async function transitionFromPending(
  tx: Tx,
  orderId: string,
  values: PendingTransition,
): Promise<Order | null> {
  const [updated] = await tx
    .update(orders)
    .set(values)
    .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
    .returning();

  return updated ?? null;
}

export async function markPaid(
  tx: Tx,
  orderId: string,
  values: { paymentIntentId: string | null; shippingAddress: Record<string, unknown> | null },
): Promise<Order | null> {
  return transitionFromPending(tx, orderId, {
    status: 'paid',
    stripePaymentIntentId: values.paymentIntentId,
    shippingAddress: values.shippingAddress,
  });
}

export async function markPaymentFailed(tx: Tx, orderId: string): Promise<Order | null> {
  return transitionFromPending(tx, orderId, { status: 'payment_failed' });
}

// Solo cancela lo que sigue `pending`: una sesión expira también después de un pago
// asíncrono ya cobrado, y ese pedido no debe volver atrás.
export async function markCanceled(tx: Tx, orderId: string): Promise<Order | null> {
  return transitionFromPending(tx, orderId, { status: 'canceled' });
}
