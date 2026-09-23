import { describe, expect, it } from 'vitest';

import { estimateRerIncomeTax, RER_RATE_BASIS_POINTS } from './rer';

describe('RER_RATE_BASIS_POINTS', () => {
  // El valor normativo está pendiente de confirmar (§5.1.1) y vive en un solo sitio: esta
  // prueba es la otra mitad de «corregirlo es editar un número y su test».
  it('is 1.5 % expressed in integer basis points', () => {
    expect(RER_RATE_BASIS_POINTS).toBe(150);
  });

  it('is an integer: the arithmetic of the module never leaves the integers (D-7)', () => {
    expect(Number.isInteger(RER_RATE_BASIS_POINTS)).toBe(true);
  });
});

describe('estimateRerIncomeTax', () => {
  it('takes 1.5 % of a round amount', () => {
    // S/ 10 000,00 de ingresos netos → S/ 150,00 de Renta estimada.
    expect(estimateRerIncomeTax(1_000_000)).toBe(15_000);
  });

  it('rounds up an amount that lands exactly on half a cent', () => {
    // 100 × 150 / 10 000 = 1.5 exacto. Truncar daría 1 y se alejaría del 1,5 %.
    expect(estimateRerIncomeTax(100)).toBe(2);
    expect(estimateRerIncomeTax(300)).toBe(5);
  });

  it('returns 0 for a base of 0: no income, no tax (AC18)', () => {
    expect(estimateRerIncomeTax(0)).toBe(0);
  });

  // D-6: un rango cuyas notas de crédito superan lo emitido no genera «Renta a favor».
  // Nunca un impuesto negativo, por mucho que la base lo sea.
  it('returns 0 for a negative base instead of a negative tax (AC18, D-6)', () => {
    expect(estimateRerIncomeTax(-1)).toBe(0);
    expect(estimateRerIncomeTax(-1_000_000)).toBe(0);
  });

  it('always returns an integer number of cents', () => {
    // Barrido contiguo en vez de tres casos elegidos: el invariante tiene que ser cierto
    // por construcción, igual que en `igv.test.ts`.
    for (let base = 0; base <= 5_000; base += 1) {
      expect(Number.isInteger(estimateRerIncomeTax(base))).toBe(true);
    }
  });

  it('never returns a negative amount, whatever the base', () => {
    for (let base = -5_000; base <= 5_000; base += 1) {
      expect(estimateRerIncomeTax(base)).toBeGreaterThanOrEqual(0);
    }
  });

  it('stays within a cent of the nominal 1.5 % across the sweep', () => {
    for (let base = 1; base <= 5_000; base += 1) {
      const nominal = (base * RER_RATE_BASIS_POINTS) / 10_000;
      expect(Math.abs(estimateRerIncomeTax(base) - nominal)).toBeLessThanOrEqual(0.5);
    }
  });

  it('handles an amount large enough to matter, with no float drift', () => {
    // S/ 999 999,99 de base: el producto intermedio es 14 999 999 850, muy por debajo de
    // `Number.MAX_SAFE_INTEGER`, así que la multiplicación entera es exacta.
    expect(estimateRerIncomeTax(99_999_999)).toBe(1_500_000);
  });
});
