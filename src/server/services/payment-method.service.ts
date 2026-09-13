import Stripe from 'stripe';

import { logAudit, type AuditContext } from '@/lib/audit';
import { NotFoundError, UpstreamError } from '@/lib/errors';
import { stripe } from '@/lib/stripe';
import {
  CARD_DELETE_UPSTREAM_MESSAGE,
  SAVED_CARD_NOT_FOUND_MESSAGE,
} from '@/modules/payments/constants';
import { db } from '@/server/db';
import type { users } from '@/server/db/schema';
import * as paymentMethodRepository from '@/server/repositories/payment-method.repository';

type User = typeof users.$inferSelect;

const AUDIT_SOURCE = 'stripe.webhook';
const AUDIT_ENTITY = 'payment_method';

// Anchos de `payment_methods`. Un valor más largo abortaría la transacción con
// `22001` y dejaría al webhook en reintento infinito por un evento que nunca vamos a
// poder procesar; recortar es preferible a atascar la cola.
const BRAND_MAX_LENGTH = 32;
const LAST4_LENGTH = 4;

export function readSetupIntentId(session: Stripe.Checkout.Session): string | null {
  const { setup_intent: setupIntent } = session;
  if (!setupIntent) return null;
  return typeof setupIntent === 'string' ? setupIntent : setupIntent.id;
}

// `display_brand` respeta la elección del cliente en tarjetas co-branded;
// `card.brand` es el respaldo cuando no viene. En minúscula porque el rótulo visible
// lo resuelve `CARD_BRAND_LABELS` en el navegador y la base guarda la clave, no el
// texto (D-11).
export function readBrand(card: Stripe.PaymentMethod.Card): string {
  return (card.display_brand ?? card.brand).toLowerCase().slice(0, BRAND_MAX_LENGTH);
}

// «Stripe products such as Checkout and Elements use this field to determine whether
// a payment method can be shown as a saved payment method in a checkout flow», y su
// valor por defecto es `unspecified`. Una tarjeta guardada con `unspecified` es una
// fila que nunca se podrá reutilizar. El consentimiento aquí es explícito —el cliente
// entró a «Agregar tarjeta» y completó un flujo cuyo único propósito es la
// reutilización—, así que normalizarlo es registrarlo donde Stripe lo lee (D-8).
async function normalizeAllowRedisplay(paymentMethod: Stripe.PaymentMethod): Promise<void> {
  if (paymentMethod.allow_redisplay === 'always') return;
  await stripe.paymentMethods.update(paymentMethod.id, { allow_redisplay: 'always' });
}

// Lo llama el webhook cuando `session.mode === 'setup'`. Es el **único** escritor de
// `payment_methods`: un segundo camino disparado desde el retorno del cliente
// duplicaría la lógica y dejaría que el navegador decidiera cuándo se guarda una
// tarjeta (D-7).
export async function saveFromSetupSession(
  session: Stripe.Checkout.Session,
  eventId: string,
): Promise<void> {
  // El `userId` viaja en `metadata` desde que creamos la sesión. Un evento sin él no
  // es nuestro: se ignora en vez de adivinar el dueño.
  const userId = session.metadata?.userId;
  if (!userId) return;

  const setupIntentId = readSetupIntentId(session);
  if (!setupIntentId) return;

  const intent = await stripe.setupIntents.retrieve(setupIntentId, {
    expand: ['payment_method'],
  });

  const paymentMethod = intent.payment_method;
  // Solo tarjeta: `brand` y `last4` no significan nada para otros medios de pago, y
  // devolver sin guardar evita que Stripe reintente para siempre un evento que nunca
  // vamos a poder procesar (D-14).
  if (!paymentMethod || typeof paymentMethod === 'string' || !paymentMethod.card) return;

  const { card } = paymentMethod;

  const saved = await db.transaction(async (tx) => {
    const inserted = await paymentMethodRepository.insertIfAbsent(tx, {
      userId,
      stripePaymentMethodId: paymentMethod.id,
      brand: readBrand(card),
      last4: card.last4.slice(0, LAST4_LENGTH),
      expMonth: card.exp_month,
      expYear: card.exp_year,
    });

    // La reentrega del mismo evento no insertó nada: salir aquí es lo que impide la
    // segunda entrada de bitácora (AC7).
    if (!inserted) return null;

    await logAudit(tx, {
      // El actor es Stripe entregando un evento firmado, no una sesión de Clerk:
      // misma convención que `order.paid`. Quién es el dueño queda en `metadata`,
      // porque la fila auditada se borra físicamente al eliminar la tarjeta (D-12).
      actorId: null,
      action: 'payment_method.saved',
      entityType: AUDIT_ENTITY,
      entityId: inserted.id,
      // Ni marca, ni `last4`, ni caducidad: docs/SETUP.md §5.2 regla dura 3 prohíbe
      // datos de tarjeta en la bitácora sin matices, y el `entity_id` ya identifica
      // la fila afectada (D-19, AC16).
      metadata: {
        source: AUDIT_SOURCE,
        stripeEventId: eventId,
        stripeSessionId: session.id,
        userId,
      },
    });

    return inserted;
  });

  // Después del commit y fuera de la transacción: es una llamada accesoria (D-8) y
  // bloquear con ella la escritura principal era el modo de fallo silencioso de §10
  // —la tarjeta adjunta en Stripe y ausente de nuestra tabla— cada vez que la clave
  // no tuviera `payment_method_write`. Solo si el INSERT devolvió fila: en la
  // reentrega ya se normalizó. El error se registra, nunca se traga, y no impide el
  // 200 al webhook porque la fila ya está commiteada y el `unique` sigue absorbiendo
  // la reentrega.
  if (!saved) return;

  try {
    await normalizeAllowRedisplay(paymentMethod);
  } catch (error) {
    console.error(
      `payment_method.saved ${saved.id}: no se pudo normalizar allow_redisplay en Stripe`,
      error,
    );
  }
}

async function detachFromStripe(paymentMethodId: string): Promise<void> {
  try {
    await stripe.paymentMethods.detach(paymentMethodId);
  } catch (error) {
    // Si Stripe ya no conoce el `pm_…` no hay nada que desprender: es el reintento de
    // una baja cuyo `detach` sí pasó y cuyo DELETE local falló. Sin esta rama la fila
    // sería imposible de eliminar desde la UI (§10).
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.code === 'resource_missing'
    ) {
      return;
    }

    // 502 antes de tocar la base: la fila no se borra si Stripe falló (AC12).
    throw new UpstreamError(CARD_DELETE_UPSTREAM_MESSAGE, { cause: error });
  }
}

export async function deleteSavedCard(
  user: User,
  id: string,
  context: AuditContext,
): Promise<string> {
  const card = await paymentMethodRepository.findByIdForUser(id, user.id);

  // 404 y no 403 tanto si la tarjeta no existe como si es de otro: un 403 confirmaría
  // que ese id existe (D-13, AC9).
  if (!card) throw new NotFoundError(SAVED_CARD_NOT_FOUND_MESSAGE);

  await detachFromStripe(card.stripePaymentMethodId);

  await db.transaction(async (tx) => {
    const deleted = await paymentMethodRepository.deleteForUser(tx, id, user.id);
    if (!deleted) return;

    await logAudit(tx, {
      // Aquí sí hay sesión: la baja la pide el propio dueño desde nuestra API, no un
      // webhook (AC11).
      actorId: user.id,
      action: 'payment_method.deleted',
      entityType: AUDIT_ENTITY,
      entityId: id,
      context,
    });
  });

  return id;
}
