import { describe, expect, it } from 'vitest';

import { currentMonthRange, dayRange, toDayInputValue } from './order-history-range';

// Construye el ISO esperado a partir de componentes locales, igual que hace el
// código bajo prueba. Así la aserción no depende de la zona horaria de la
// máquina que corre el test: si cambia el huso, cambian igual el `Date`
// esperado y el real.
function localIso(year: number, month: number, date: number, h = 0, m = 0, s = 0, ms = 0): string {
  return new Date(year, month, date, h, m, s, ms).toISOString();
}

describe('currentMonthRange', () => {
  it('returns the first day at local midnight and the last day at 23:59:59.999 for a 31-day month', () => {
    const range = currentMonthRange(new Date(2026, 0, 15, 10, 30));

    expect(range.from).toBe(localIso(2026, 0, 1));
    expect(range.to).toBe(localIso(2026, 0, 31, 23, 59, 59, 999));
  });

  it('returns the correct bounds for a 30-day month', () => {
    const range = currentMonthRange(new Date(2026, 3, 10));

    expect(range.from).toBe(localIso(2026, 3, 1));
    expect(range.to).toBe(localIso(2026, 3, 30, 23, 59, 59, 999));
  });

  it('caps February at 28 days on a non-leap year', () => {
    const range = currentMonthRange(new Date(2026, 1, 5));

    expect(range.from).toBe(localIso(2026, 1, 1));
    expect(range.to).toBe(localIso(2026, 1, 28, 23, 59, 59, 999));
  });

  it('caps February at 29 days on a leap year', () => {
    const range = currentMonthRange(new Date(2028, 1, 10));

    expect(range.from).toBe(localIso(2028, 1, 1));
    expect(range.to).toBe(localIso(2028, 1, 29, 23, 59, 59, 999));
  });

  it('rolls over the year correctly when the current month is December', () => {
    const range = currentMonthRange(new Date(2026, 11, 25));

    expect(range.from).toBe(localIso(2026, 11, 1));
    expect(range.to).toBe(localIso(2026, 11, 31, 23, 59, 59, 999));
  });

  it('defaults to the real current date when no clock is injected', () => {
    const before = new Date();
    const range = currentMonthRange();

    expect(new Date(range.from).getFullYear()).toBe(before.getFullYear());
    expect(new Date(range.from).getMonth()).toBe(before.getMonth());
    expect(new Date(range.from).getDate()).toBe(1);
  });
});

describe('dayRange', () => {
  it('returns the start and end of the same local day when from equals to', () => {
    const range = dayRange('2026-09-09', '2026-09-09');

    expect(range.from).toBe(localIso(2026, 8, 9));
    expect(range.to).toBe(localIso(2026, 8, 9, 23, 59, 59, 999));
  });

  it('returns the start of fromDay and end of toDay for a multi-day range', () => {
    const range = dayRange('2026-09-01', '2026-09-10');

    expect(range.from).toBe(localIso(2026, 8, 1));
    expect(range.to).toBe(localIso(2026, 8, 10, 23, 59, 59, 999));
  });

  it('handles a range spanning two different months', () => {
    const range = dayRange('2026-08-25', '2026-09-05');

    expect(range.from).toBe(localIso(2026, 7, 25));
    expect(range.to).toBe(localIso(2026, 8, 5, 23, 59, 59, 999));
  });

  it('handles a range spanning two different years', () => {
    const range = dayRange('2026-12-31', '2027-01-01');

    expect(range.from).toBe(localIso(2026, 11, 31));
    expect(range.to).toBe(localIso(2027, 0, 1, 23, 59, 59, 999));
  });

  it('parses single-digit months and days correctly', () => {
    const range = dayRange('2026-01-05', '2026-02-03');

    expect(range.from).toBe(localIso(2026, 0, 5));
    expect(range.to).toBe(localIso(2026, 1, 3, 23, 59, 59, 999));
  });
});

describe('toDayInputValue', () => {
  it('formats a date with double-digit month and day', () => {
    expect(toDayInputValue(new Date(2026, 8, 15))).toBe('2026-09-15');
  });

  it('pads a single-digit month', () => {
    expect(toDayInputValue(new Date(2026, 0, 15))).toBe('2026-01-15');
  });

  it('pads a single-digit day', () => {
    expect(toDayInputValue(new Date(2026, 8, 3))).toBe('2026-09-03');
  });

  it('pads both a single-digit month and day', () => {
    expect(toDayInputValue(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('ignores the time-of-day component', () => {
    expect(toDayInputValue(new Date(2026, 8, 9, 23, 59, 59, 999))).toBe('2026-09-09');
  });
});
