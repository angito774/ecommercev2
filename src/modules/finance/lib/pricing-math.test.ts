import { describe, expect, it } from 'vitest';

import { unitMargin } from './pricing-math';

describe('unitMargin', () => {
  it('returns both fields null when there is no cost registered (AC5)', () => {
    expect(unitMargin(249_900, null)).toEqual({ marginCents: null, marginPercent: null });
  });

  it('never returns 0 for a missing cost: "I do not know" is not "it leaves me nothing"', () => {
    const { marginCents, marginPercent } = unitMargin(0, null);

    expect(marginCents).toBeNull();
    expect(marginPercent).toBeNull();
  });

  it('computes a positive margin over the selling price, not a markup over the cost', () => {
    // 100.00 de precio, 60.00 de costo: 40.00 de margen, que es el 40 % del precio.
    // Sobre el costo serían 66,7 %, y esa es la cifra que este cálculo NO da.
    expect(unitMargin(10_000, 6_000)).toEqual({ marginCents: 4_000, marginPercent: 40 });
  });

  it('returns exactly 0 when the cost equals the price: that is a real zero, not a null', () => {
    expect(unitMargin(10_000, 10_000)).toEqual({ marginCents: 0, marginPercent: 0 });
  });

  it('returns a negative margin when the product is sold below cost (AC23)', () => {
    expect(unitMargin(10_000, 12_000)).toEqual({ marginCents: -2_000, marginPercent: -20 });
  });

  it('keeps the cents of a negative margin exact, without any clamp', () => {
    expect(unitMargin(1, 99_999_999).marginCents).toBe(-99_999_998);
  });

  // `createProductSchema` admite `priceCents = 0` (`.min(0)`, verificado), así que el
  // caso es real y no teórico: sin base no hay porcentaje (D-7).
  it('returns a negative marginCents and a null marginPercent when the price is 0', () => {
    expect(unitMargin(0, 5_000)).toEqual({ marginCents: -5_000, marginPercent: null });
  });

  it('returns a null marginPercent with price 0 and cost 0, instead of NaN', () => {
    expect(unitMargin(0, 0)).toEqual({ marginCents: 0, marginPercent: null });
  });

  it('rounds the percentage to one decimal', () => {
    // 29 999 / 99 999 = 29,99929… %
    expect(unitMargin(99_999, 70_000).marginPercent).toBe(30);
    // 1 / 3 = 33,333… %
    expect(unitMargin(3_000, 2_000).marginPercent).toBe(33.3);
    // 2 / 3 = 66,666… %
    expect(unitMargin(3_000, 1_000).marginPercent).toBe(66.7);
  });

  it('rounds a negative percentage to one decimal too', () => {
    expect(unitMargin(3_000, 4_000).marginPercent).toBe(-33.3);
  });

  it('never returns NaN or Infinity, whatever the combination', () => {
    const cases: ReadonlyArray<[number, number | null]> = [
      [0, null],
      [0, 0],
      [0, 1],
      [0, 99_999_999],
      [1, 0],
      [1, 1],
      [1, 99_999_999],
      [99_999_999, 0],
      [99_999_999, 99_999_999],
      [249_900, null],
    ];

    for (const [priceCents, averageCostCents] of cases) {
      const { marginCents, marginPercent } = unitMargin(priceCents, averageCostCents);

      expect(marginCents === null || Number.isFinite(marginCents)).toBe(true);
      expect(marginPercent === null || Number.isFinite(marginPercent)).toBe(true);
    }
  });

  it('keeps marginCents an integer: cents never become decimals', () => {
    expect(Number.isInteger(unitMargin(249_900, 180_000).marginCents)).toBe(true);
  });

  it('treats a cost of 1 cent as a cost, not as an absence', () => {
    expect(unitMargin(10_000, 1).marginCents).toBe(9_999);
  });
});
