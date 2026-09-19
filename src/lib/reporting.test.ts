import { describe, expect, it } from 'vitest';

import {
  addReportingDays,
  isFutureReportingDay,
  reportingDayStart,
  startOfReportingDay,
  toReportingDayKey,
} from './reporting';

// Mediodía de Lima: lejos de cualquier frontera de día, para que los casos que no
// prueban el huso no dependan de en qué lado del corte cae el instante.
const NOON_IN_LIMA = new Date('2026-09-16T17:00:00.000Z');

describe('toReportingDayKey', () => {
  it('counts a sale made at 23:00 in Lima as that day, not the next', () => {
    expect(toReportingDayKey(new Date('2026-09-17T04:00:00.000Z'))).toBe('2026-09-16');
  });

  it('flips to the next day at 05:00 UTC', () => {
    expect(toReportingDayKey(new Date('2026-09-17T05:00:00.000Z'))).toBe('2026-09-17');
  });

  it('pads month and day to two digits', () => {
    expect(toReportingDayKey(new Date('2026-01-05T12:00:00.000Z'))).toBe('2026-01-05');
  });

  it('rolls the year back when the Lima day is still the 31st of December', () => {
    expect(toReportingDayKey(new Date('2027-01-01T04:00:00.000Z'))).toBe('2026-12-31');
  });
});

describe('startOfReportingDay', () => {
  it('opens the Lima day at 05:00 UTC', () => {
    expect(startOfReportingDay(new Date('2026-09-16T17:00:00.000Z')).toISOString()).toBe(
      '2026-09-16T05:00:00.000Z',
    );
  });

  it('keeps 04:59:59.999Z inside the previous Lima day', () => {
    expect(startOfReportingDay(new Date('2026-09-16T04:59:59.999Z')).toISOString()).toBe(
      '2026-09-15T05:00:00.000Z',
    );
  });

  it('is idempotent: the start of a day is already the start of its own day', () => {
    const start = startOfReportingDay(new Date('2026-09-16T17:00:00.000Z'));

    expect(startOfReportingDay(start).toISOString()).toBe(start.toISOString());
  });
});

describe('reportingDayStart', () => {
  it('turns a day key into the instant that opens it in Lima', () => {
    expect(reportingDayStart('2026-09-01').toISOString()).toBe('2026-09-01T05:00:00.000Z');
  });

  it('handles the first day of a year', () => {
    expect(reportingDayStart('2026-01-01').toISOString()).toBe('2026-01-01T05:00:00.000Z');
  });

  it.each(['2026-01-01', '2026-02-28', '2028-02-29', '2026-09-16', '2026-12-31'])(
    'round-trips through toReportingDayKey for %s',
    (day) => {
      expect(toReportingDayKey(reportingDayStart(day))).toBe(day);
    },
  );
});

describe('addReportingDays', () => {
  it('walks forward inside the same month', () => {
    expect(addReportingDays('2026-09-16', 3)).toBe('2026-09-19');
  });

  it('crosses the end of a 30-day month', () => {
    expect(addReportingDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('crosses the end of a 31-day month', () => {
    expect(addReportingDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('crosses the end of the year', () => {
    expect(addReportingDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('lands on the 29th of a leap February', () => {
    expect(addReportingDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('skips the 29th on a non-leap February', () => {
    expect(addReportingDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('walks backwards with a negative days argument', () => {
    expect(addReportingDays('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('walks backwards across the year boundary', () => {
    expect(addReportingDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('returns the same day for zero', () => {
    expect(addReportingDays('2026-09-16', 0)).toBe('2026-09-16');
  });
});

describe('isFutureReportingDay', () => {
  it('rejects tomorrow (spec 017 AC13, spec 020 AC9)', () => {
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
