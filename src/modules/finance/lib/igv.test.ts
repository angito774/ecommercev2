import { describe, expect, it } from 'vitest';

import { IGV_RATE, splitIgv } from './igv';

describe('splitIgv', () => {
  it('splits a round amount into its textbook base and IGV', () => {
    expect(splitIgv(11_800)).toEqual({ baseCents: 10_000, igvCents: 1_800 });
  });

  it('keeps base + igv exactly equal to the total, which is what AC26 asserts', () => {
    // Se barre un rango contiguo en vez de fijar tres casos: el invariante tiene que ser
    // cierto por construcción, y un barrido es lo que distingue «cuadra» de «cuadra en los
    // tres importes que elegí».
    for (let total = 1; total <= 5_000; total += 1) {
      const { baseCents, igvCents } = splitIgv(total);
      expect(baseCents + igvCents).toBe(total);
    }
  });

  it('never produces a base of zero, which the CHECK of the table forbids', () => {
    for (let total = 1; total <= 5_000; total += 1) {
      expect(splitIgv(total).baseCents).toBeGreaterThan(0);
    }
  });

  it('never produces a negative IGV', () => {
    for (let total = 1; total <= 5_000; total += 1) {
      expect(splitIgv(total).igvCents).toBeGreaterThanOrEqual(0);
    }
  });

  it('rounds the base to the nearest cent instead of truncating', () => {
    // 100 / 1.18 = 84.745…: truncar daría 84 y un IGV de 16, que se aleja más del 18 %.
    expect(splitIgv(100)).toEqual({ baseCents: 85, igvCents: 15 });
  });

  it('gives the smallest possible amount a base of 1 and no IGV', () => {
    // 1 / 1.18 = 0.847 → 1. El céntimo entero es base: un IGV de 1 sobre una base de 0
    // violaría el CHECK, y repartirlo al revés sería inventar una base que no existe.
    expect(splitIgv(1)).toEqual({ baseCents: 1, igvCents: 0 });
  });

  it('splits a real catalogue price without drifting from the 18 %', () => {
    // S/ 2 199,00, el precio de la laptop del seed.
    const { baseCents, igvCents } = splitIgv(219_900);

    expect(baseCents).toBe(186_356);
    expect(igvCents).toBe(33_544);
    // El IGV resultante no se separa del tipo nominal más de un céntimo de redondeo.
    expect(Math.abs(igvCents - Math.round(baseCents * IGV_RATE))).toBeLessThanOrEqual(1);
  });

  it('handles an amount large enough to overflow a naive float calculation', () => {
    const total = 99_999_999;
    const { baseCents, igvCents } = splitIgv(total);

    expect(baseCents + igvCents).toBe(total);
    expect(baseCents).toBe(84_745_762);
  });

  it('throws on zero instead of returning a breakdown the table would reject', () => {
    expect(() => splitIgv(0)).toThrow(RangeError);
  });

  it('throws on a negative amount: a comprobante is never for less than nothing', () => {
    expect(() => splitIgv(-11_800)).toThrow(RangeError);
  });

  it('throws on a non-integer amount, which is a sign someone passed soles', () => {
    expect(() => splitIgv(118.5)).toThrow(RangeError);
    // 118 soles pasados como 118 en vez de 11 800 céntimos no se puede detectar, pero
    // 118.5 sí, y es la forma en la que el error se cuela de verdad.
    expect(() => splitIgv(Number.NaN)).toThrow(RangeError);
  });
});
