import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

// `import type` obligatorio: un import de valor arrastraría el schema Drizzle y
// @neondatabase/serverless al bundle del cliente.
import type { paymentMethods } from '@/server/db/schema/payment-method';

export type PaymentMethodRow = InferSelectModel<typeof paymentMethods>;
export type NewPaymentMethod = InferInsertModel<typeof paymentMethods>;

// Proyección que viaja al cliente. Se deriva por `Pick` del tipo inferido (CLAUDE.md
// regla 5) y deja fuera `userId` y `stripePaymentMethodId`: el `pm_…` no se publica
// para que el cliente no pueda pedir el `detach` de una tarjeta que no es suya
// (D-13, AC8).
export type SavedCard = Pick<
  PaymentMethodRow,
  'id' | 'brand' | 'last4' | 'expMonth' | 'expYear'
> & {
  /** ISO. `Date` no viaja en JSON (spec 008, D-15). */
  createdAt: string;
};

export type SavedCardListResponse = { data: SavedCard[] };
export type CardSetupResponse = { url: string };
export type DeleteSavedCardResponse = { id: string };
