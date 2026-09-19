import { describe, expect, it } from 'vitest';

import { currentPayrollPeriod, formatPeriodLabel } from './payroll-dates';

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
