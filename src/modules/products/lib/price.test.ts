import { describe, expect, it } from 'vitest';

import { formatPrice, fromCents, toCents } from './price';

describe('toCents', () => {
  it('converts a price with two decimals to exact cents', () => {
    expect(toCents('1299.90')).toBe(129990);
  });

  it('converts a single-decimal fraction to exact cents', () => {
    expect(toCents('0.1')).toBe(10);
  });

  it('converts a value that would misround under parseFloat arithmetic', () => {
    // parseFloat('19.99') * 100 === 1998.9999999999998 (floating point drift).
    // toCents avoids that path entirely by never multiplying a float.
    expect(parseFloat('19.99') * 100).not.toBe(1999);
    expect(toCents('19.99')).toBe(1999);
  });

  it('treats an integer string without a decimal point as whole soles', () => {
    expect(toCents('100')).toBe(10000);
  });

  it('pads a single-digit decimal to two digits', () => {
    expect(toCents('10.5')).toBe(1050);
  });

  it('converts zero to zero cents', () => {
    expect(toCents('0')).toBe(0);
  });

  it('converts a value with a leading zero decimal to one cent', () => {
    expect(toCents('0.01')).toBe(1);
  });
});

describe('fromCents', () => {
  it('is the exact inverse of toCents for a two-decimal amount', () => {
    expect(fromCents(129990)).toBe('1299.90');
  });

  it('formats zero cents as "0.00"', () => {
    expect(fromCents(0)).toBe('0.00');
  });

  it('pads small cent amounts with a leading zero whole part', () => {
    expect(fromCents(10)).toBe('0.10');
    expect(fromCents(1)).toBe('0.01');
  });

  it('renders a negative amount with a leading minus sign', () => {
    expect(fromCents(-950)).toBe('-9.50');
  });

  it('round-trips every normalized amount through toCents and back', () => {
    const normalizedAmounts = ['1299.90', '0.10', '19.99', '100.00', '10.50', '0.00', '0.01'];

    for (const amount of normalizedAmounts) {
      expect(fromCents(toCents(amount))).toBe(amount);
    }
  });
});

describe('formatPrice', () => {
  const currencyFormatter = new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  });

  it('formats a typical amount as PEN currency', () => {
    expect(formatPrice(129990)).toBe(currencyFormatter.format(1299.9));
  });

  it('formats zero cents as PEN currency', () => {
    expect(formatPrice(0)).toBe(currencyFormatter.format(0));
  });

  it('formats a small amount as PEN currency', () => {
    expect(formatPrice(1999)).toBe(currencyFormatter.format(19.99));
  });

  it('formats a negative amount as PEN currency', () => {
    expect(formatPrice(-950)).toBe(currencyFormatter.format(-9.5));
  });
});
