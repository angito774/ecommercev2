import type Stripe from 'stripe';

import { ConflictError, NotFoundError, UpstreamError } from '@/lib/errors';
import { stripe } from '@/lib/stripe';
import {
  ORDER_NOT_FOUND_MESSAGE,
  RECEIPT_NOT_READY_MESSAGE,
  RECEIPT_UPSTREAM_MESSAGE,
} from '@/modules/orders/constants';
import type { users } from '@/server/db/schema';
import * as orderRepository from '@/server/repositories/order.repository';

type User = typeof users.$inferSelect;

// La boleta estándar de un pago en Stripe es `receipt_url` del objeto `Charge`, y
// al `Charge` se llega expandiendo `latest_charge` del PaymentIntent que el
// webhook ya guardó. `hosted_invoice_url` / `invoice_pdf` no existen en este
// flujo: pertenecen a un `Invoice`, y en `mode: 'payment'` solo se crea uno con
// `invoice_creation.enabled`, que el spec 007 no activó (D-8).
//
// La URL se resuelve en cada apertura y no se persiste nunca: Stripe invalida los
// enlaces a los 30 días, así que una columna guardaría un enlace que se pudre
// (D-3).
export async function getReceiptUrl(user: User, orderId: string): Promise<string> {
  const order = await orderRepository.findByIdForUser(orderId, user.id);

  // 404 y no 403 tanto si el pedido no existe como si es de otro: un 403
  // confirmaría que ese id existe (D-13).
  if (!order) throw new NotFoundError(ORDER_NOT_FOUND_MESSAGE);

  if (order.status !== 'paid' || !order.stripePaymentIntentId) {
    throw new ConflictError(RECEIPT_NOT_READY_MESSAGE);
  }

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId, {
      expand: ['latest_charge'],
    });
  } catch (error) {
    // 502 y no 500: el fallo es del proveedor, y la UI necesita poder decir «no
    // fue culpa tuya, reintenta» (AC12).
    throw new UpstreamError(RECEIPT_UPSTREAM_MESSAGE, { cause: error });
  }

  const charge = intent.latest_charge;
  const url = charge && typeof charge !== 'string' ? charge.receipt_url : null;

  // Stripe responde bien pero todavía no expone la boleta: es un conflicto de
  // estado, no un fallo de red. Mismo 409 que un pedido sin cobrar.
  if (!url) throw new ConflictError(RECEIPT_NOT_READY_MESSAGE);

  return url;
}
