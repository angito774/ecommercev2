import type Stripe from 'stripe';

import { logAudit, type AuditInput } from '@/lib/audit';
import type { Order, OrderStatus } from '@/modules/orders/types/order.types';
import { db, type Tx } from '@/server/db';
import * as orderRepository from '@/server/repositories/order.repository';
import * as productRepository from '@/server/repositories/product.repository';

import { queueOriginalDocument } from './electronic-document.service';

const AUDIT_SOURCE = 'stripe.webhook';

// Solo identificadores de la transacción: nunca el payload del evento, ni datos de
// tarjeta, ni la dirección del cliente (docs/SETUP.md §5.2, regla dura 3).
export function auditMetadata(session: Stripe.Checkout.Session, eventId: string) {
  return { source: AUDIT_SOURCE, stripeEventId: eventId, stripeSessionId: session.id };
}

// El `orderId` viaja en `metadata` desde que Stripe crea la sesión, así que existe
// aunque el UPDATE que escribe `stripe_checkout_session_id` no hubiera llegado
// todavía (D-6). Un evento sin él no es nuestro: se ignora.
export function readOrderId(session: Stripe.Checkout.Session): string | null {
  return session.metadata?.orderId ?? null;
}

export function readPaymentIntentId(session: Stripe.Checkout.Session): string | null {
  const { payment_intent: paymentIntent } = session;
  if (!paymentIntent) return null;
  return typeof paymentIntent === 'string' ? paymentIntent : paymentIntent.id;
}

// Se guarda tal cual llega, sin normalizar en columnas: inventar un esquema de
// direcciones antes de saber quién lo consulta sería adivinar (D-19).
export function readShippingAddress(
  session: Stripe.Checkout.Session,
): Record<string, unknown> | null {
  const details = session.collected_information?.shipping_details;
  if (!details) return null;

  return { name: details.name, address: { ...details.address } };
}

// El descuento no lleva clamp: si el `RETURNING` deja un negativo, alguien se llevó
// la última unidad entre la validación del checkout y el pago. El clamp borraría esa
// evidencia; la bitácora la conserva para que un administrador pueda resolverlo
// (D-10).
async function decrementStockAndAudit(
  tx: Tx,
  items: Array<{ productId: string; quantity: number }>,
  session: Stripe.Checkout.Session,
  eventId: string,
  orderId: string,
): Promise<void> {
  const updated = await productRepository.decrementStock(tx, items);
  const byId = new Map(items.map((item) => [item.productId, item.quantity]));

  for (const product of updated) {
    if (product.stock >= 0) continue;

    await logAudit(tx, {
      actorId: null,
      action: 'order.oversold',
      entityType: 'product',
      entityId: product.productId,
      changes: {
        before: { stock: product.stock + (byId.get(product.productId) ?? 0) },
        after: { stock: product.stock },
      },
      metadata: { ...auditMetadata(session, eventId), orderId },
      severity: 'warning',
    });
  }
}

// Único lugar donde una orden pasa a `paid`. La página de éxito solo lee: un cliente
// puede pagar y perder la conexión antes de que cargue, y esa lógica pierde pedidos
// en silencio (D-4, AC8).
export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
  eventId: string,
): Promise<void> {
  const orderId = readOrderId(session);
  if (!orderId) return;

  await db.transaction(async (tx) => {
    // UPDATE condicional: si devuelve null, otra entrega del mismo evento ya la
    // fulfilló y salir aquí es lo que impide el segundo descuento de stock y la
    // segunda fila de bitácora (D-5, AC6).
    const paid = await orderRepository.markPaid(tx, orderId, {
      paymentIntentId: readPaymentIntentId(session),
      shippingAddress: readShippingAddress(session),
    });

    if (!paid) return;

    const order = await orderRepository.findByIdWithItems(orderId, tx);
    if (order) await decrementStockAndAudit(tx, order.items, session, eventId, orderId);

    // Dentro de la misma transacción y **sin ninguna llamada de red** (spec 022, AC7,
    // D-7): lo único que hace es consumir un correlativo e insertar una fila `pending`
    // sobre la conexión que ya está abierta, así que no compite con el corte de ~10 s del
    // webhook. Deja el comprobante listo para que alguien lo emita desde el panel; **no lo
    // emite** (D-8).
    //
    // Si lanzara, revertiría también el `markPaid` y Stripe reintentaría el evento, que es
    // el comportamiento correcto: un pedido cobrado sin comprobante en cola es peor que un
    // reintento. Por eso `queueOriginalDocument` no traga ningún error: los casos que no
    // deben revertir —pedido sin documento del comprador, importe no positivo— se
    // resuelven antes, dejando constancia en la bitácora (AC8).
    await queueOriginalDocument(tx, paid, order?.items ?? [], {
      eventId,
      sessionId: session.id,
    });

    await logAudit(tx, {
      actorId: null,
      action: 'order.paid',
      entityType: 'order',
      entityId: orderId,
      changes: { before: { status: 'pending' }, after: { status: 'paid' } },
      metadata: auditMetadata(session, eventId),
    });
  });
}

type PendingSettlement = {
  mutate: (tx: Tx, orderId: string) => Promise<Order | null>;
  to: OrderStatus;
  action: AuditInput['action'];
  severity?: AuditInput['severity'];
};

// Cerrar una orden `pending` sin cobrarla es el mismo movimiento tanto si el banco
// rechazó el pago como si la sesión caducó: misma transacción, mismo UPDATE
// condicional y misma fila de bitácora, y lo único que cambia son el estado destino
// y la acción registrada. No se mete aquí el fulfillment: descuenta stock y audita la
// sobreventa, así que solo *parece* la misma operación.
async function settleFromPending(
  session: Stripe.Checkout.Session,
  eventId: string,
  settlement: PendingSettlement,
): Promise<void> {
  const orderId = readOrderId(session);
  if (!orderId) return;

  await db.transaction(async (tx) => {
    const settled = await settlement.mutate(tx, orderId);
    if (!settled) return;

    await logAudit(tx, {
      actorId: null,
      action: settlement.action,
      entityType: 'order',
      entityId: orderId,
      changes: { before: { status: 'pending' }, after: { status: settlement.to } },
      metadata: auditMetadata(session, eventId),
      severity: settlement.severity,
    });
  });
}

export async function failCheckoutSession(
  session: Stripe.Checkout.Session,
  eventId: string,
): Promise<void> {
  await settleFromPending(session, eventId, {
    mutate: orderRepository.markPaymentFailed,
    to: 'payment_failed',
    action: 'order.payment_failed',
    severity: 'warning',
  });
}

// `expired` evita que las órdenes `pending` se acumulen para siempre. Solo cancela
// lo que sigue `pending`: una sesión también expira después de un pago asíncrono ya
// cobrado, y ese pedido no debe volver atrás (D-7).
export async function expireCheckoutSession(
  session: Stripe.Checkout.Session,
  eventId: string,
): Promise<void> {
  await settleFromPending(session, eventId, {
    mutate: orderRepository.markCanceled,
    to: 'canceled',
    action: 'order.canceled',
  });
}
