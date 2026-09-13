import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

// `payment-method.service.ts` importa `stripe` de `@/lib/stripe` de forma
// incondicional (lo usa `saveFromSetupSession` y `detachFromStripe`), y ese módulo
// trae `server-only`, que revienta fuera del bundler de Next. Ninguna de las
// funciones bajo prueba toca el cliente de Stripe, así que se sustituye por un
// doble vacío en vez de cargar la clave real (mismo patrón que
// `checkout.service.test.ts`).
vi.mock('@/lib/stripe', () => ({ stripe: {} }));

import { readBrand, readSetupIntentId } from './payment-method.service';

// Solo los campos que `readSetupIntentId` lee; el resto de
// `Stripe.Checkout.Session` es irrelevante para su lógica de mapeo.
type SessionFixture = Pick<Stripe.Checkout.Session, 'setup_intent'>;

function buildSession(overrides: Partial<SessionFixture> = {}): Stripe.Checkout.Session {
  const base: SessionFixture = { setup_intent: null };
  return { ...base, ...overrides } as unknown as Stripe.Checkout.Session;
}

function buildCard(overrides: Partial<Stripe.PaymentMethod.Card> = {}): Stripe.PaymentMethod.Card {
  return { display_brand: null, brand: 'visa', ...overrides } as unknown as Stripe.PaymentMethod.Card;
}

describe('readSetupIntentId', () => {
  it('returns null when there is no setup intent', () => {
    const session = buildSession({ setup_intent: null });

    expect(readSetupIntentId(session)).toBeNull();
  });

  it('returns the id directly when setup_intent is a string', () => {
    const session = buildSession({ setup_intent: 'seti_123' });

    expect(readSetupIntentId(session)).toBe('seti_123');
  });

  it('reads the id from an expanded SetupIntent object', () => {
    const expandedSetupIntent = { id: 'seti_456' } as unknown as Stripe.SetupIntent;
    const session = buildSession({ setup_intent: expandedSetupIntent });

    expect(readSetupIntentId(session)).toBe('seti_456');
  });
});

describe('readBrand', () => {
  it('prefers display_brand over brand when both are present', () => {
    const card = buildCard({ display_brand: 'cartes_bancaires', brand: 'visa' });

    expect(readBrand(card)).toBe('cartes_bancaires');
  });

  it('falls back to brand when display_brand is absent', () => {
    const card = buildCard({ display_brand: null, brand: 'mastercard' });

    expect(readBrand(card)).toBe('mastercard');
  });

  it('normalizes the resolved brand to lowercase', () => {
    const card = buildCard({ display_brand: 'VISA', brand: 'visa' });

    expect(readBrand(card)).toBe('visa');
  });
});
