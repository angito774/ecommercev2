import type { InferSelectModel } from 'drizzle-orm';

// `import type` obligatorio: un import de valor arrastraría el schema Drizzle y
// @neondatabase/serverless al bundle del cliente.
import type { orderItems } from '@/server/db/schema/order-item';
import type { orders, orderStatus } from '@/server/db/schema/order';

export type Order = InferSelectModel<typeof orders>;
export type OrderItem = InferSelectModel<typeof orderItems>;
export type OrderStatus = (typeof orderStatus.enumValues)[number];

// Proyección que consume la confirmación. Se construye por `Pick` sobre los tipos
// inferidos (CLAUDE.md regla 5) y deja fuera lo que la página no pinta: los ids de
// Stripe y la dirección de envío no tienen por qué viajar al cliente para mostrar
// «gracias por tu compra».
export type OrderLineSummary = Pick<
  OrderItem,
  'id' | 'productId' | 'nameSnapshot' | 'imageUrlSnapshot' | 'priceCentsSnapshot' | 'quantity'
>;

export type OrderSummary = Pick<
  Order,
  'id' | 'status' | 'subtotalCents' | 'shippingCents' | 'amountTotalCents' | 'createdAt'
> & {
  items: OrderLineSummary[];
};

// Lo mínimo que necesita pintar una línea de pedido. Sin `productId`: el contrato
// del historial no lo publica (§6) y la lista compartida tampoco lo usa, así que
// pedirlo en las props obligaría al historial a inventarse un valor.
export type OrderLineDisplay = Omit<OrderLineSummary, 'productId'>;

// Los dos instantes ISO que acotan el historial. Se calculan en el navegador
// (D-7) y viajan tal cual en el query string de `GET /api/orders`.
export type OrderHistoryRange = { from: string; to: string };

// `createdAt` es string y no Date a propósito: JSON no transporta Date, y heredar
// el `Date` de `OrderSummary` haría que el tipo mintiera en el cliente (D-15).
export type OrderHistoryEntry = Omit<OrderSummary, 'createdAt' | 'items'> & {
  createdAt: string;
  items: OrderLineDisplay[];
  /** `status === 'paid'` y con payment intent. Evita publicar el id de Stripe (D-4). */
  receiptAvailable: boolean;
};

export type OrderHistoryResponse = {
  data: OrderHistoryEntry[];
  /** `truncated` avisa de que el tope de `MAX_ORDER_HISTORY` recortó el rango. */
  meta: { truncated: boolean };
};

export type OrderReceiptResponse = { url: string };
