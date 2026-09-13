import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { auditMetadata, readOrderId, readPaymentIntentId, readShippingAddress } from './order-fulfillment.service';

// Solo se necesitan los campos que estas funciones leen; el resto de
// `Stripe.Checkout.Session` (mode, url, expires_at, ...) es irrelevante para su
// lógica de mapeo, así que el fixture se limita a un `Pick` y se castea a través
// de `unknown`, sin recurrir a `any`.
type SessionFixture = Pick<Stripe.Checkout.Session, 'id' | 'metadata' | 'payment_intent' | 'collected_information'>;

function buildSession(overrides: Partial<SessionFixture> = {}): Stripe.Checkout.Session {
  const base: SessionFixture = {
    id: 'cs_test_12345',
    metadata: null,
    payment_intent: null,
    collected_information: null,
  };
  return { ...base, ...overrides } as unknown as Stripe.Checkout.Session;
}

describe('readOrderId', () => {
  it('reads orderId from session metadata', () => {
    const session = buildSession({ metadata: { orderId: 'order-123' } });

    expect(readOrderId(session)).toBe('order-123');
  });

  it('returns null when metadata has no orderId', () => {
    const session = buildSession({ metadata: { other: 'value' } });

    expect(readOrderId(session)).toBeNull();
  });

  it('returns null when metadata is null', () => {
    const session = buildSession({ metadata: null });

    expect(readOrderId(session)).toBeNull();
  });
});

describe('readPaymentIntentId', () => {
  it('returns null when there is no payment intent', () => {
    const session = buildSession({ payment_intent: null });

    expect(readPaymentIntentId(session)).toBeNull();
  });

  it('returns the id directly when payment_intent is a string', () => {
    const session = buildSession({ payment_intent: 'pi_123' });

    expect(readPaymentIntentId(session)).toBe('pi_123');
  });

  it('reads the id from an expanded PaymentIntent object', () => {
    const expandedPaymentIntent = { id: 'pi_456' } as unknown as Stripe.PaymentIntent;
    const session = buildSession({ payment_intent: expandedPaymentIntent });

    expect(readPaymentIntentId(session)).toBe('pi_456');
  });
});

describe('readShippingAddress', () => {
  it('returns null when Stripe collected no shipping information', () => {
    const session = buildSession({ collected_information: null });

    expect(readShippingAddress(session)).toBeNull();
  });

  it('remaps the collected shipping details into name and address', () => {
    const session = buildSession({
      collected_information: {
        business_name: null,
        individual_name: null,
        shipping_details: {
          name: 'Ada Lovelace',
          address: {
            city: 'Lima',
            country: 'PE',
            line1: 'Av. Siempre Viva 123',
            line2: null,
            postal_code: '15001',
            state: 'Lima',
          },
        },
      },
    });

    expect(readShippingAddress(session)).toEqual({
      name: 'Ada Lovelace',
      address: {
        city: 'Lima',
        country: 'PE',
        line1: 'Av. Siempre Viva 123',
        line2: null,
        postal_code: '15001',
        state: 'Lima',
      },
    });
  });
});

describe('auditMetadata', () => {
  it('includes only the source, the Stripe event id and the Stripe session id', () => {
    const session = buildSession({ id: 'cs_test_abc' });

    expect(auditMetadata(session, 'evt_789')).toEqual({
      source: 'stripe.webhook',
      stripeEventId: 'evt_789',
      stripeSessionId: 'cs_test_abc',
    });
  });

  it('never includes customer PII such as name, address or email', () => {
    const session = buildSession({
      id: 'cs_test_pii',
      collected_information: {
        business_name: null,
        individual_name: 'Ada Lovelace',
        shipping_details: {
          name: 'Ada Lovelace',
          address: {
            city: 'Lima',
            country: 'PE',
            line1: 'Av. Siempre Viva 123',
            line2: null,
            postal_code: '15001',
            state: 'Lima',
          },
        },
      },
    });

    const metadata = auditMetadata(session, 'evt_789');

    expect(Object.keys(metadata)).toEqual(['source', 'stripeEventId', 'stripeSessionId']);
    expect(JSON.stringify(metadata)).not.toContain('Ada Lovelace');
    expect(JSON.stringify(metadata)).not.toContain('Av. Siempre Viva');
  });
});
