import { describe, expect, it } from 'vitest';

import { resolveStockStatus } from './stock-status';

const THRESHOLD = 10;

describe('resolveStockStatus', () => {
  it('maps zero stock to "out" (AC7)', () => {
    expect(resolveStockStatus(0, THRESHOLD)).toBe('out');
  });

  it('maps a single remaining unit to "low", not "out"', () => {
    expect(resolveStockStatus(1, THRESHOLD)).toBe('low');
  });

  it('maps one unit below the threshold to "low" (AC7)', () => {
    expect(resolveStockStatus(THRESHOLD - 1, THRESHOLD)).toBe('low');
  });

  it('maps exactly the threshold to "in": the filter is strict "<" (AC4)', () => {
    expect(resolveStockStatus(THRESHOLD, THRESHOLD)).toBe('in');
  });

  it('maps stock above the threshold to "in", a branch the endpoint never returns (D-6)', () => {
    expect(resolveStockStatus(THRESHOLD + 1, THRESHOLD)).toBe('in');
  });

  it('maps negative stock from an oversell to "out", so the row leads the list (§10)', () => {
    expect(resolveStockStatus(-3, THRESHOLD)).toBe('out');
  });

  it('still reports "out" for zero when the threshold is zero', () => {
    expect(resolveStockStatus(0, 0)).toBe('out');
  });

  it('reports "in" for any positive stock when the threshold is zero', () => {
    expect(resolveStockStatus(1, 0)).toBe('in');
  });
});
