import { describe, expect, it } from 'vitest';

import { averageTicketCents, percentChange } from './metrics-math';

describe('percentChange', () => {
  it('reports a rise as a positive percentage', () => {
    expect(percentChange(1284900, 990000)).toBe(29.8);
  });

  it('reports a drop as a negative percentage', () => {
    expect(percentChange(990000, 1284900)).toBe(-23);
  });

  it('reports no change as zero, not as null', () => {
    expect(percentChange(500000, 500000)).toBe(0);
  });

  it('returns null when the previous period sold nothing and this one did (AC9)', () => {
    expect(percentChange(349900, 0)).toBeNull();
  });

  it('returns null when both periods are zero: without a base there is no percentage', () => {
    expect(percentChange(0, 0)).toBeNull();
  });

  it('returns -100 when sales dropped to zero from a real base', () => {
    expect(percentChange(0, 250000)).toBe(-100);
  });

  it('rounds to a single decimal', () => {
    expect(percentChange(14, 11)).toBe(27.3);
  });

  it('never yields Infinity or NaN across the awkward combinations (AC9)', () => {
    const combinations: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1000000, 0],
    ];

    for (const [value, previous] of combinations) {
      const result = percentChange(value, previous);
      expect(result === null || Number.isFinite(result)).toBe(true);
    }
  });

  it('handles a one-unit base without blowing up the scale', () => {
    expect(percentChange(3, 1)).toBe(200);
  });
});

describe('averageTicketCents', () => {
  it('returns zero when there were no orders, not NaN (AC10)', () => {
    expect(averageTicketCents(0, 0)).toBe(0);
  });

  it('returns zero when there is no revenue to split either', () => {
    expect(averageTicketCents(0, 4)).toBe(0);
  });

  it('divides revenue by order count', () => {
    expect(averageTicketCents(900000, 9)).toBe(100000);
  });

  it('rounds to the nearest cent instead of leaking a decimal (AC18)', () => {
    expect(averageTicketCents(1284900, 14)).toBe(91779);
  });

  it('rounds a half cent up', () => {
    expect(averageTicketCents(5, 2)).toBe(3);
  });

  it('always returns an integer', () => {
    expect(Number.isInteger(averageTicketCents(100, 3))).toBe(true);
  });

  it('collapses to the amount itself when there is a single order', () => {
    expect(averageTicketCents(349900, 1)).toBe(349900);
  });
});
