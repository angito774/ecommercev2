import { and, count, desc, eq } from 'drizzle-orm';

import type {
  NewPaymentMethod,
  PaymentMethodRow,
  SavedCard,
} from '@/modules/payments/types/payment-method.types';
import { db, type Reader, type Tx } from '@/server/db';
import { paymentMethods } from '@/server/db/schema';

// INSERT idempotente: la reentrega del mismo `checkout.session.completed` choca
// contra el `unique` de `stripe_payment_method_id` y `onConflictDoNothing` la
// absorbe. Devuelve `null` cuando no insertó nada, que es la señal con la que el
// servicio se salta la segunda entrada de bitácora (D-7, AC7).
export async function insertIfAbsent(
  tx: Tx,
  values: NewPaymentMethod,
): Promise<PaymentMethodRow | null> {
  const [inserted] = await tx
    .insert(paymentMethods)
    .values(values)
    .onConflictDoNothing({ target: paymentMethods.stripePaymentMethodId })
    .returning();

  return inserted ?? null;
}

// Proyección positiva: se enumera lo que sale. Un `select()` sin argumentos
// publicaría `user_id` y el `pm_…` (§10, AC8).
const SAVED_CARD_COLUMNS = {
  id: paymentMethods.id,
  brand: paymentMethods.brand,
  last4: paymentMethods.last4,
  expMonth: paymentMethods.expMonth,
  expYear: paymentMethods.expYear,
  createdAt: paymentMethods.createdAt,
} as const;

// El filtro por `user_id` va dentro del `WHERE`, no después de leer: es lo que hace
// imposible devolver la tarjeta de otro.
export async function findManyByUser(
  userId: string,
  reader: Reader = db,
): Promise<SavedCard[]> {
  const rows = await reader
    .select(SAVED_CARD_COLUMNS)
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, userId))
    // `id` como desempate: dos tarjetas con el mismo `created_at` al microsegundo
    // alternarían de posición entre dos consultas idénticas.
    .orderBy(desc(paymentMethods.createdAt), desc(paymentMethods.id));

  return rows.map((row) => ({
    ...row,
    // ISO y no `Date`: JSON no transporta `Date` y el tipo del cliente lo declara
    // `string` para no mentir (spec 008, D-15).
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function countByUser(userId: string, reader: Reader = db): Promise<number> {
  const [totals] = await reader
    .select({ value: count() })
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, userId));

  return totals?.value ?? 0;
}

// Fila completa, `stripePaymentMethodId` incluido: la consume el servicio de baja en
// el servidor para el `detach` y nada de esto viaja al cliente. La propiedad se
// resuelve dentro del `WHERE`, así que la tarjeta ajena ni se llega a leer (AC9).
export async function findByIdForUser(
  id: string,
  userId: string,
  reader: Reader = db,
): Promise<PaymentMethodRow | null> {
  const [row] = await reader
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId)))
    .limit(1);

  return row ?? null;
}

// Borrado físico, no soft delete: el `detach` de Stripe es permanente e
// irreversible, y una fila marcada como borrada apuntaría a un objeto irrecuperable.
// El histórico lo conserva `audit_logs`, que es append-only (D-12).
//
// El `user_id` sigue en el `WHERE` aunque el servicio ya haya comprobado la
// propiedad: es la misma invariante en el único sitio donde puede fallar de verdad.
export async function deleteForUser(
  tx: Tx,
  id: string,
  userId: string,
): Promise<PaymentMethodRow | null> {
  const [deleted] = await tx
    .delete(paymentMethods)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId)))
    .returning();

  return deleted ?? null;
}
