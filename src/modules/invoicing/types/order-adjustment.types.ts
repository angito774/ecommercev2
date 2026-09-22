import type { ElectronicDocumentRow } from './electronic-document.types';

/**
 * Lo que devuelve `POST /api/admin/orders/[id]/adjust`. **`stripe_refund_id` no sale por
 * aquí**, igual que `provider_response`: es una referencia interna del proveedor de pago y
 * el panel ya muestra los ids de Stripe del pedido bajo `orders.read` (spec 014, D-6).
 * Publicarlo por segunda vez en otra proyección solo añadiría un sitio donde revisar qué se
 * expone.
 *
 * Tampoco salen los datos fiscales del comprador que una `correccion_comprador` acaba de
 * escribir: son PII y no los publica ninguna API de este módulo (§10).
 */
export type OrderAdjustmentResult = {
  orderId: string;
  refundedAmountCents: number;
  /** Saldo aún devolvible: `amountTotalCents − refundedAmountCents`. */
  refundableCents: number;
  /** Árbol completo tras el ajuste, con la misma fila que publica el spec 022. */
  documents: ElectronicDocumentRow[];
};
