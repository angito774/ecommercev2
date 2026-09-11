import type Stripe from 'stripe';

import { APP_URL } from '@/lib/constants';
import { ConflictError, UpstreamError } from '@/lib/errors';
import { stripe } from '@/lib/stripe';
// La moneda es una sola en toda la app (spec 007, D-20). Duplicarla en `payments`
// crearía la segunda copia que se desincroniza (§10).
import { ORDER_CURRENCY } from '@/modules/orders/constants';
import {
  CARD_SETUP_INTEGRATION_IDENTIFIER,
  CARD_SETUP_UPSTREAM_MESSAGE,
  MAX_SAVED_CARDS,
  MAX_SAVED_CARDS_MESSAGE,
} from '@/modules/payments/constants';
import { db } from '@/server/db';
import type { users } from '@/server/db/schema';
import * as paymentMethodRepository from '@/server/repositories/payment-method.repository';
import * as userRepository from '@/server/repositories/user.repository';

type User = typeof users.$inferSelect;

function fullName(user: User): string | undefined {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : undefined;
}

// «To set up a payment method for future payments, you must attach it to an object
// that represents your customer.» El Customer se crea la primera vez y se reutiliza
// después: uno por usuario, no uno por tarjeta (D-6, AC5).
async function resolveCustomerId(user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  let customer: Stripe.Customer;
  try {
    customer = await stripe.customers.create({
      email: user.email,
      name: fullName(user),
      // Permite reconstruir a quién pertenece un Customer desde el Dashboard sin
      // consultar nuestra base. Es un uuid interno, no PII.
      metadata: { userId: user.id },
    });
  } catch (error) {
    throw new UpstreamError(CARD_SETUP_UPSTREAM_MESSAGE, { cause: error });
  }

  const attached = await db.transaction((tx) =>
    userRepository.attachStripeCustomer(tx, user.id, customer.id),
  );

  // Si otra pestaña ganó la carrera, manda el `cus_…` que ya está guardado y el
  // recién creado se queda vacío en el Dashboard: basura, no una tarjeta perdida
  // (D-15, §10).
  return attached ?? customer.id;
}

export async function startCardSetup(user: User): Promise<string> {
  // Antes de crear nada en Stripe: es el único momento en que se puede decir que no
  // sin haber dejado un Customer o una sesión colgando (D-18, AC15).
  const saved = await paymentMethodRepository.countByUser(user.id);
  if (saved >= MAX_SAVED_CARDS) throw new ConflictError(MAX_SAVED_CARDS_MESSAGE);

  const customerId = await resolveCustomerId(user);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'setup',
      // El SDK lo documenta en `SessionCreateParams.currency`: «Required in `setup`
      // mode when `payment_method_types` is not set.» Y no se fija
      // `payment_method_types` a propósito, igual que en el checkout de pago (spec
      // 007, D-3), así que la moneda es obligatoria aquí.
      currency: ORDER_CURRENCY,
      // `customer` y `customer_email` son excluyentes: en esta sesión va `customer`,
      // que es lo que da a Stripe dónde adjuntar el PaymentMethod. Por eso el webhook
      // no necesita `paymentMethods.attach()`.
      customer: customerId,
      metadata: { userId: user.id },
      setup_intent_data: { metadata: { userId: user.id } },
      integration_identifier: CARD_SETUP_INTEGRATION_IDENTIFIER,
      // `APP_URL`, no la variable de entorno en crudo: sin su fallback, un entorno
      // sin `NEXT_PUBLIC_APP_URL` mandaría a Stripe un `undefined/account?...` que la
      // API rechaza (spec 007, M-1).
      success_url: `${APP_URL}/account?card=added#tarjetas`,
      cancel_url: `${APP_URL}/account#tarjetas`,
    });
  } catch (error) {
    throw new UpstreamError(CARD_SETUP_UPSTREAM_MESSAGE, { cause: error });
  }

  // 502 y no 500: Stripe respondió, pero sin la URL no hay nada a donde mandar al
  // cliente, y la UI necesita poder decir «no fue culpa tuya, reintenta» (AC12).
  if (!session.url) throw new UpstreamError(CARD_SETUP_UPSTREAM_MESSAGE);

  return session.url;
}
