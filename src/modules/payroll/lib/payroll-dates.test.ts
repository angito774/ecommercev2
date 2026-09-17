import { describe, expect, it } from 'vitest';

import { currentPayrollPeriod, formatIsoDate, formatPeriodLabel } from './payroll-dates';

describe('currentPayrollPeriod', () => {
  it('returns the month of the given instant as AAAA-MM', () => {
    expect(currentPayrollPeriod(new Date(2026, 8, 17, 10, 0, 0))).toBe('2026-09');
  });

  it('pads a single digit month to two characters: the width is what keeps the order', () => {
    expect(currentPayrollPeriod(new Date(2026, 0, 5, 10, 0, 0))).toBe('2026-01');
  });

  it('returns december for the last month of the year', () => {
    expect(currentPayrollPeriod(new Date(2026, 11, 31, 10, 0, 0))).toBe('2026-12');
  });

  it('reads the local calendar, not UTC: it never rolls into another month by itself', () => {
    const now = new Date(2026, 8, 1, 0, 30, 0);

    expect(currentPayrollPeriod(now)).toBe(`${now.getFullYear()}-09`);
  });
});

describe('formatPeriodLabel', () => {
  it('labels january as january, not december of the previous year', () => {
    const label = formatPeriodLabel('2026-01');

    expect(label).toContain('2026');
    expect(label.toLowerCase()).toContain('enero');
  });

  // `es-PE` escribe «setiembre» y no «septiembre»: la aserción mira el mes correcto
  // sin casarse con la ortografía que decida el ICU del entorno.
  it('labels september with its own month and year, not with a neighbouring one', () => {
    const label = formatPeriodLabel('2026-09').toLowerCase();

    expect(label).toMatch(/se[p]?tiembre/);
    expect(label).not.toContain('agosto');
    expect(label).not.toContain('octubre');
    expect(label).toContain('2026');
  });

  it('labels december without spilling into the next year', () => {
    const label = formatPeriodLabel('2026-12');

    expect(label.toLowerCase()).toContain('diciembre');
    expect(label).toContain('2026');
  });

  it('capitalises the first letter for the table cell', () => {
    expect(formatPeriodLabel('2026-03').charAt(0)).toBe(
      formatPeriodLabel('2026-03').charAt(0).toUpperCase(),
    );
  });

  it('drops the Spanish preposition so the cell reads "Marzo 2026"', () => {
    expect(formatPeriodLabel('2026-03')).toBe('Marzo 2026');
  });
});

describe('formatIsoDate', () => {
  it('formats the first day of the month as that very day (AC18, D-12)', () => {
    expect(formatIsoDate('2026-09-01')).toBe('01 sep 2026');
  });

  it('formats the first of january as january, never as december 31st', () => {
    expect(formatIsoDate('2026-01-01')).toBe('01 ene 2026');
  });

  it('formats the last day of the year', () => {
    expect(formatIsoDate('2026-12-31')).toBe('31 dic 2026');
  });

  it('keeps the day as written, with no timezone shift in either direction', () => {
    expect(formatIsoDate('2026-06-15')).toContain('15');
  });

  it('is independent of the host clock: the same input always gives the same output', () => {
    expect(formatIsoDate('2026-09-01')).toBe(formatIsoDate('2026-09-01'));
  });
});
