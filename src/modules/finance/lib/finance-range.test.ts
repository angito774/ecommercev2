import { describe, expect, it } from 'vitest';

import { currentMonthRange, isFutureReportingDay, resolveFinanceRange } from './finance-range';

const MS_PER_HOUR = 60 * 60 * 1000;

// Mediodía de Lima: lejos de cualquier frontera de día, para que los casos que no
// prueban el huso no dependan de en qué lado del corte cae el instante.
const NOON_IN_LIMA = new Date('2026-09-16T17:00:00.000Z');

describe('currentMonthRange', () => {
  it('spans a 30-day month from the 1st to the 30th', () => {
    expect(currentMonthRange(NOON_IN_LIMA)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('spans a 31-day month from the 1st to the 31st', () => {
    expect(currentMonthRange(new Date('2026-08-16T17:00:00.000Z'))).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('ends a non-leap February on the 28th', () => {
    expect(currentMonthRange(new Date('2026-02-16T17:00:00.000Z'))).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('ends a leap February on the 29th', () => {
    expect(currentMonthRange(new Date('2028-02-16T17:00:00.000Z'))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });

  it('pads single-digit months to two digits', () => {
    expect(currentMonthRange(new Date('2026-01-05T17:00:00.000Z'))).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('stays in September at 03:00 UTC of the 1st of October, which is still the 30th in Lima', () => {
    expect(currentMonthRange(new Date('2026-10-01T03:00:00.000Z'))).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });

  it('flips to October at 05:00 UTC of the 1st', () => {
    expect(currentMonthRange(new Date('2026-10-01T05:00:00.000Z'))).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
  });

  it('keeps the year of the Lima day when UTC has already rolled over', () => {
    expect(currentMonthRange(new Date('2027-01-01T04:00:00.000Z'))).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });
});

describe('resolveFinanceRange', () => {
  it('falls back to the current month when neither bound is given (AC4)', () => {
    const range = resolveFinanceRange({}, NOON_IN_LIMA);

    expect(range.fromDay).toBe('2026-09-01');
    expect(range.toDay).toBe('2026-09-30');
  });

  it('respects both bounds when they are given', () => {
    const range = resolveFinanceRange({ from: '2026-03-05', to: '2026-04-10' }, NOON_IN_LIMA);

    expect(range.fromDay).toBe('2026-03-05');
    expect(range.toDay).toBe('2026-04-10');
  });

  it('falls back only on the missing bound', () => {
    const range = resolveFinanceRange({ from: '2026-09-10' }, NOON_IN_LIMA);

    expect(range.fromDay).toBe('2026-09-10');
    expect(range.toDay).toBe('2026-09-30');
  });

  it('opens the instant window at the start of fromDay in Lima', () => {
    const range = resolveFinanceRange({ from: '2026-09-01', to: '2026-09-30' }, NOON_IN_LIMA);

    expect(range.from.toISOString()).toBe('2026-09-01T05:00:00.000Z');
  });

  it('closes the instant window at the start of the day after toDay, not at toDay (AC6)', () => {
    const range = resolveFinanceRange({ from: '2026-09-01', to: '2026-09-30' }, NOON_IN_LIMA);

    expect(range.to.toISOString()).toBe('2026-10-01T05:00:00.000Z');
  });

  it('keeps a sale made at 23:00 Lima on the last day inside the window (AC6)', () => {
    const range = resolveFinanceRange({ from: '2026-09-01', to: '2026-09-30' }, NOON_IN_LIMA);
    // 2026-09-30 23:00 en Lima es 2026-10-01T04:00Z.
    const lateSale = new Date('2026-10-01T04:00:00.000Z');

    expect(lateSale.getTime()).toBeGreaterThanOrEqual(range.from.getTime());
    expect(lateSale.getTime()).toBeLessThan(range.to.getTime());
  });

  it('spans exactly 24 hours when from and to are the same day', () => {
    const range = resolveFinanceRange({ from: '2026-09-16', to: '2026-09-16' }, NOON_IN_LIMA);

    expect((range.to.getTime() - range.from.getTime()) / MS_PER_HOUR).toBe(24);
  });

  it('crosses the end of the year in the instant window', () => {
    const range = resolveFinanceRange({ from: '2026-12-01', to: '2026-12-31' }, NOON_IN_LIMA);

    expect(range.to.toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });

  it('resolves the same range for any instant of the same Lima day', () => {
    const early = resolveFinanceRange({}, new Date('2026-09-16T05:00:00.000Z'));
    const late = resolveFinanceRange({}, new Date('2026-09-17T04:59:59.999Z'));

    expect(early).toEqual(late);
  });
});

describe('isFutureReportingDay', () => {
  it('rejects tomorrow (AC13)', () => {
    expect(isFutureReportingDay('2026-09-17', NOON_IN_LIMA)).toBe(true);
  });

  it('accepts today', () => {
    expect(isFutureReportingDay('2026-09-16', NOON_IN_LIMA)).toBe(false);
  });

  it('accepts yesterday', () => {
    expect(isFutureReportingDay('2026-09-15', NOON_IN_LIMA)).toBe(false);
  });

  it('accepts today in Lima even when UTC has already rolled to the next day', () => {
    // 2026-09-16 21:00 en Lima es 2026-09-17T02:00Z: en UTC ya es el 17.
    expect(isFutureReportingDay('2026-09-16', new Date('2026-09-17T02:00:00.000Z'))).toBe(false);
  });

  it('compares across years without special-casing', () => {
    expect(isFutureReportingDay('2027-01-01', new Date('2026-12-31T17:00:00.000Z'))).toBe(true);
  });
});
