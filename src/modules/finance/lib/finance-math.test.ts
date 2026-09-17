import { describe, expect, it } from 'vitest';

import { marginPercent } from './finance-math';

describe('marginPercent', () => {
  it('returns a positive margin when revenue beats expenses', () => {
    // 10 000 de ingreso, 4 000 de gasto: neto 6 000 → 60 %.
    expect(marginPercent(1_000_000, 600_000)).toBe(60);
  });

  it('returns a negative margin when expenses beat revenue (AC9)', () => {
    // 1 000 de ingreso, 1 500 de gasto: neto −500 → −50 %.
    expect(marginPercent(100_000, -50_000)).toBe(-50);
  });

  it('returns exactly 0 when expenses equal revenue', () => {
    expect(marginPercent(100_000, 0)).toBe(0);
  });

  it('returns 100 when there are no expenses at all', () => {
    expect(marginPercent(100_000, 100_000)).toBe(100);
  });

  it('returns null with no revenue and some expenses (AC10)', () => {
    expect(marginPercent(0, -50_000)).toBeNull();
  });

  it('returns null with neither revenue nor expenses (AC10, AC11)', () => {
    expect(marginPercent(0, 0)).toBeNull();
  });

  it('rounds to a single decimal', () => {
    // 29.8333…% → 29.8.
    expect(marginPercent(60_000, 17_900)).toBe(29.8);
  });

  it('rounds the half up', () => {
    // 12.25 % → 12.3.
    expect(marginPercent(10_000, 1_225)).toBe(12.3);
  });

  it('never returns NaN or Infinity for any of its edge cases', () => {
    const results = [
      marginPercent(0, 0),
      marginPercent(0, 100),
      marginPercent(0, -100),
      marginPercent(1, -1_000_000),
      marginPercent(1_000_000, 0),
    ];

    for (const result of results) {
      expect(Number.isFinite(result ?? 0)).toBe(true);
      expect(Number.isNaN(result ?? 0)).toBe(false);
    }
  });

  it('keeps working past the int4 ceiling, where revenue is already a bigint sum', () => {
    expect(marginPercent(5_000_000_000, 2_500_000_000)).toBe(50);
  });
});
