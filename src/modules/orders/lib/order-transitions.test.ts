import { describe, expect, it } from 'vitest';

import type { OrderStatus } from '../types/order.types';

import { canCancelOrder } from './order-transitions';

// Los cuatro valores escritos a mano y no derivados del enum de Drizzle: si mañana
// el enum crece, este test debe seguir afirmando lo mismo sobre estos cuatro y el
// valor nuevo tiene que decidirse a conciencia, no heredar un `false` en silencio.
describe('canCancelOrder', () => {
  it('allows cancelling an order that is still pending', () => {
    expect(canCancelOrder('pending')).toBe(true);
  });

  it('refuses a paid order: it would need a refund and a stock restock', () => {
    expect(canCancelOrder('paid')).toBe(false);
  });

  it('refuses an order whose payment already failed', () => {
    expect(canCancelOrder('payment_failed')).toBe(false);
  });

  it('refuses an order that is already canceled', () => {
    expect(canCancelOrder('canceled')).toBe(false);
  });

  it('returns true for exactly one of the four statuses', () => {
    const statuses: OrderStatus[] = ['pending', 'paid', 'payment_failed', 'canceled'];

    expect(statuses.filter(canCancelOrder)).toEqual(['pending']);
  });
});
