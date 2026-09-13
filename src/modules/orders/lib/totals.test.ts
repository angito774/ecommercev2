import { describe, expect, it } from 'vitest';

import { FREE_SHIPPING_THRESHOLD_CENTS, SHIPPING_COST_CENTS } from '@/modules/cart/constants';

import {
  type CheckoutLineTotal,
  calculateOrderTotals,
  calculateShippingCents,
  calculateSubtotalCents,
} from './totals';

function buildLine(overrides: Partial<CheckoutLineTotal> = {}): CheckoutLineTotal {
  return { priceCents: 1_000, quantity: 1, ...overrides };
}

describe('calculateSubtotalCents', () => {
  it('returns 0 for an empty cart', () => {
    expect(calculateSubtotalCents([])).toBe(0);
  });

  it('multiplies price by quantity for a single line', () => {
    const lines = [buildLine({ priceCents: 2_500, quantity: 4 })];

    expect(calculateSubtotalCents(lines)).toBe(10_000);
  });

  it('sums price times quantity across several lines', () => {
    const lines = [
      buildLine({ priceCents: 1_000, quantity: 2 }),
      buildLine({ priceCents: 3_000, quantity: 1 }),
      buildLine({ priceCents: 500, quantity: 5 }),
    ];

    expect(calculateSubtotalCents(lines)).toBe(7_500);
  });
});

describe('calculateShippingCents', () => {
  it('charges shipping for a subtotal of 0 (empty cart)', () => {
    expect(calculateShippingCents(0)).toBe(SHIPPING_COST_CENTS);
  });

  it('charges shipping when the subtotal is below the free-shipping threshold', () => {
    expect(calculateShippingCents(FREE_SHIPPING_THRESHOLD_CENTS - 1)).toBe(SHIPPING_COST_CENTS);
  });

  it('waives shipping when the subtotal is exactly at the free-shipping threshold', () => {
    expect(calculateShippingCents(FREE_SHIPPING_THRESHOLD_CENTS)).toBe(0);
  });

  it('waives shipping when the subtotal is above the free-shipping threshold', () => {
    expect(calculateShippingCents(FREE_SHIPPING_THRESHOLD_CENTS + 1)).toBe(0);
  });
});

describe('calculateOrderTotals', () => {
  it('composes subtotal, shipping and total for an empty cart', () => {
    const totals = calculateOrderTotals([]);

    expect(totals).toEqual({
      subtotalCents: 0,
      shippingCents: SHIPPING_COST_CENTS,
      amountTotalCents: SHIPPING_COST_CENTS,
    });
  });

  it('adds shipping to the total when the subtotal is below the free-shipping threshold', () => {
    const lines = [buildLine({ priceCents: FREE_SHIPPING_THRESHOLD_CENTS - 100, quantity: 1 })];

    const totals = calculateOrderTotals(lines);

    expect(totals).toEqual({
      subtotalCents: FREE_SHIPPING_THRESHOLD_CENTS - 100,
      shippingCents: SHIPPING_COST_CENTS,
      amountTotalCents: FREE_SHIPPING_THRESHOLD_CENTS - 100 + SHIPPING_COST_CENTS,
    });
  });

  it('waives shipping in the total when the subtotal is exactly at the free-shipping threshold', () => {
    const lines = [buildLine({ priceCents: FREE_SHIPPING_THRESHOLD_CENTS, quantity: 1 })];

    const totals = calculateOrderTotals(lines);

    expect(totals).toEqual({
      subtotalCents: FREE_SHIPPING_THRESHOLD_CENTS,
      shippingCents: 0,
      amountTotalCents: FREE_SHIPPING_THRESHOLD_CENTS,
    });
  });

  it('waives shipping in the total when the subtotal is above the free-shipping threshold', () => {
    const lines = [
      buildLine({ priceCents: FREE_SHIPPING_THRESHOLD_CENTS, quantity: 2 }),
      buildLine({ priceCents: 500, quantity: 3 }),
    ];

    const totals = calculateOrderTotals(lines);
    const expectedSubtotal = FREE_SHIPPING_THRESHOLD_CENTS * 2 + 1_500;

    expect(totals).toEqual({
      subtotalCents: expectedSubtotal,
      shippingCents: 0,
      amountTotalCents: expectedSubtotal,
    });
  });
});
