import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { stripe } from '@/lib/stripe';
import {
  expireCheckoutSession,
  failCheckoutSession,
  fulfillCheckoutSession,
} from '@/server/services/order-fulfillment.service';
import { saveFromSetupSession } from '@/server/services/payment-method.service';

// Este handler no lleva `requireAuth()` ni `authorize()`: quien llama es Stripe, no
// un usuario de Clerk. La autenticación es la firma del evento, igual que
// `verifyWebhook` en `/api/webhooks/clerk` (D-13).
async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;

      // El alta de una tarjeta emite este mismo evento, distinguible solo por el
      // `mode`. Se ramifica antes de mirar `payment_status` porque una sesión
      // `setup` no cobra nada y siempre llega `unpaid`: comprobarlo primero la
      // descartaría en silencio (spec 009, D-7).
      if (session.mode === 'setup') {
        await saveFromSetupSession(session, event.id);
        return;
      }

      // Con métodos de notificación diferida el `completed` llega con la sesión aún
      // impagada: fulfillar ahí concedería el pedido a pagos que después fallan
      // (D-7). El caso pagado de esas sesiones llega por `async_payment_succeeded`.
      if (session.payment_status !== 'unpaid') {
        await fulfillCheckoutSession(session, event.id);
      }
      return;
    }
    case 'checkout.session.async_payment_succeeded':
      await fulfillCheckoutSession(event.data.object, event.id);
      return;
    case 'checkout.session.async_payment_failed':
      await failCheckoutSession(event.data.object, event.id);
      return;
    case 'checkout.session.expired':
      await expireCheckoutSession(event.data.object, event.id);
      return;
    default:
      // El resto se acepta sin hacer nada para que Stripe no reintente.
      return;
  }
}

export async function POST(request: Request) {
  const signingSecret = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error('POST /api/webhooks/stripe: STRIPE_WEBHOOK_SIGNING_SECRET no está definida');
    return NextResponse.json({ message: 'Webhook no configurado' }, { status: 500 });
  }

  // `request.text()` y no `request.json()`: la verificación de firma necesita el
  // string crudo; con el objeto ya parseado la firma nunca cuadra (D-14).
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    // Verifica antes de tocar ningún dato: sin esto, cualquiera que adivine la URL
    // podría marcar pedidos como pagados (AC7). Lanza también si falta la cabecera.
    event = stripe.webhooks.constructEvent(payload, signature ?? '', signingSecret);
  } catch (error) {
    console.error('POST /api/webhooks/stripe: verificación de firma fallida', error);
    return NextResponse.json({ message: 'Firma inválida' }, { status: 400 });
  }

  try {
    await dispatch(event);
  } catch (error) {
    console.error(`POST /api/webhooks/stripe: fallo al procesar ${event.type}`, error);
    // 500 para que Stripe reintente: la transacción ya revirtió entera y la
    // idempotencia del UPDATE condicional absorbe la reentrega (D-5).
    return NextResponse.json({ message: 'Error al procesar el evento' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
