import type { InferSelectModel } from 'drizzle-orm';

// `import type` obligatorio: un import de valor arrastraría el schema Drizzle y
// @neondatabase/serverless al bundle del cliente.
import type { orderItems } from '@/server/db/schema/order-item';
import type { orders, orderStatus } from '@/server/db/schema/order';

import type { ElectronicDocumentRow } from '@/modules/invoicing/types/electronic-document.types';

import type { ShippingAddress } from '../schemas/admin-order.schema';

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
  /**
   * Comprobantes SUNAT del pedido, ordenados por `created_at` (spec 022). Array vacío
   * —nunca `undefined`— para que la vista no tenga que distinguir «no tiene» de «no vino»:
   * un pedido sin pagar y uno anterior a la migración `0010` se pintan igual.
   *
   * Misma forma que la del panel (D-12): no hay ningún campo del comprobante que el
   * administrador pueda ver y el comprador no, porque es su propio comprobante.
   */
  documents: ElectronicDocumentRow[];
};

export type OrderHistoryResponse = {
  data: OrderHistoryEntry[];
  /** `truncated` avisa de que el tope de `MAX_ORDER_HISTORY` recortó el rango. */
  meta: { truncated: boolean };
};

export type OrderReceiptResponse = { url: string };

// ---------------------------------------------------------------------------
// Panel de administración (spec 014). Misma regla que arriba: se enumera lo que
// sale, derivándolo por `Pick`/`Omit` de los tipos inferidos.
// ---------------------------------------------------------------------------

// Fila del listado. Sin líneas: la tabla solo pinta el total y un contador, y
// cargarlas por fila sería el N+1 que el §10 evita con una subconsulta agregada.
export type AdminOrderRow = Pick<
  Order,
  'id' | 'status' | 'subtotalCents' | 'shippingCents' | 'amountTotalCents' | 'currency'
> & {
  /** ISO: JSON no transporta `Date` y el tipo del cliente no debe mentir (spec 008, D-15). */
  createdAt: string;
  customerId: string;
  /** `firstName` + `lastName`; `null` si Clerk no los dio todavía. */
  customerName: string | null;
  customerEmail: string;
  itemCount: number;
};

export type AdminOrderListResponse = {
  data: AdminOrderRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    /** Resuelto en servidor: la UI solo oculta controles, no decide permisos (D-11). */
    canUpdateStatus: boolean;
  };
};

// Los ids de Stripe salen solo aquí y solo bajo `orders.read` (D-6). Como texto,
// sin enlace al Dashboard: eso obligaría a saber si la cuenta está en test o en
// live para no mandar al administrador a un 404 (D-18).
export type AdminOrderDetail = Omit<AdminOrderRow, 'itemCount'> & {
  updatedAt: string;
  items: OrderLineDisplay[];
  shippingAddress: ShippingAddress | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  /**
   * Comprobantes SUNAT del pedido, ordenados por `created_at` (spec 022, AC21). **Ni
   * `buyerDocumentNumber` ni `buyerLegalName` entran aquí**: son PII del comprador y no
   * salen por ninguna API de este spec (AC22).
   */
  documents: ElectronicDocumentRow[];
};

export type AdminOrderDetailResponse = {
  data: AdminOrderDetail;
  // El sheet tiene su propia consulta: si dependiera del `meta` del listado
  // quedaría acoplado al orden de carga de otra query (D-11).
  meta: {
    canUpdateStatus: boolean;
    /** Resuelto en servidor: la UI solo oculta controles, no decide permisos (AC20). */
    canIssueInvoice: boolean;
  };
};

export type OrderStatusChangeResult = Pick<Order, 'id' | 'status'> & { updatedAt: string };
