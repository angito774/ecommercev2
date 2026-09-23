import { describe, expect, it } from 'vitest';

import type { CostOfGoodsSold } from '../types/finance.types';

import { marginPercent } from './finance-math';
import { buildPeriodProfit, type PeriodProfitInput } from './profit';

const cogs = (amountCents: number, uncostedLineCount = 0, lineCount = 10): CostOfGoodsSold => ({
  amountCents,
  lineCount,
  uncostedLineCount,
});

// Números redondos a propósito: lo que se prueba son las tres restas y el guard del
// margen, no la aritmética de JavaScript.
const BASE: PeriodProfitInput = {
  netRevenueCents: 1_000_000,
  cogs: cogs(400_000),
  operatingExpensesCents: 200_000,
  payrollCents: 100_000,
  payrollPaymentCount: 2,
  incomeTaxCents: 15_000,
};

describe('buildPeriodProfit — la cascada', () => {
  const result = buildPeriodProfit(BASE);

  it('computes the gross profit as net revenue minus COGS (AC18)', () => {
    expect(result.gross.amountCents).toBe(600_000);
  });

  it('computes the operating profit as gross minus net expenses and payroll (AC18)', () => {
    expect(result.operating.amountCents).toBe(300_000);
  });

  it('computes the net profit as operating minus income tax (AC18)', () => {
    expect(result.net.amountCents).toBe(285_000);
  });

  it('measures the three margins against the same net revenue', () => {
    expect(result.gross.marginPercent).toBe(60);
    expect(result.operating.marginPercent).toBe(30);
    expect(result.net.marginPercent).toBe(28.5);
  });

  // Los sustraendos se publican junto a los totales: tres números sin las restas que los
  // separan no se pueden auditar a ojo.
  it('publishes the subtrahends next to the three levels', () => {
    expect(result.netRevenueCents).toBe(1_000_000);
    expect(result.operatingExpensesCents).toBe(200_000);
    expect(result.payrollCents).toBe(100_000);
    expect(result.payrollPaymentCount).toBe(2);
    expect(result.incomeTaxCents).toBe(15_000);
  });

  // D-10 y AC20: el IGV no resta en ningún nivel. `PeriodProfitInput` ya lo impide en el
  // tipo (no tiene ningún campo de IGV que pasarle); esto afirma sobre la *salida*, no
  // sobre el fixture del test: si algún día alguien colara una resta de IGV en la
  // operativa o en la neta, esta igualdad dejaría de cumplirse.
  it('the net level is exactly operating minus income tax — nothing else subtracts (D-10)', () => {
    expect(result.net.amountCents).toBe(result.operating.amountCents - result.incomeTaxCents);
  });
});

describe('buildPeriodProfit — base cero', () => {
  const result = buildPeriodProfit({
    ...BASE,
    netRevenueCents: 0,
    cogs: cogs(0),
    incomeTaxCents: 0,
  });

  // AC21: ni `0`, ni `Infinity`, ni `NaN`. `x/0` es `Infinity` y los dos se serializan
  // como `null` en JSON por accidente; decidirlo explícitamente le da copy propio en la UI.
  it('returns null for the three margins, never 0, Infinity nor NaN (AC21)', () => {
    expect(result.gross.marginPercent).toBeNull();
    expect(result.operating.marginPercent).toBeNull();
    expect(result.net.marginPercent).toBeNull();
  });

  it('still publishes the three amounts: a range with no revenue still has costs (AC21)', () => {
    expect(result.gross.amountCents).toBe(0);
    expect(result.operating.amountCents).toBe(-300_000);
    expect(result.net.amountCents).toBe(-300_000);
  });
});

describe('buildPeriodProfit — base negativa', () => {
  // Las correcciones del rango superan lo emitido: un porcentaje sobre base negativa
  // invierte el signo y afirmaría lo contrario de lo que pasó (AC22).
  const result = buildPeriodProfit({ ...BASE, netRevenueCents: -500_000, cogs: cogs(0) });

  it('returns null for the three margins with a non-positive base (AC22)', () => {
    expect(result.gross.marginPercent).toBeNull();
    expect(result.operating.marginPercent).toBeNull();
    expect(result.net.marginPercent).toBeNull();
  });

  // El guard es justo lo que corrige esto: `marginPercent()` a secas divide dos negativos
  // y devuelve un porcentaje **positivo** que diría «160 % de margen» sobre un rango en el
  // que no hubo ingresos (D-9).
  it('discards the sign-inverted percentage that the raw division would give (AC22, D-9)', () => {
    expect(marginPercent(-500_000, result.gross.amountCents)).toBeGreaterThan(0);
    expect(result.gross.marginPercent).toBeNull();
  });

  it('keeps the amounts arithmetically true despite the null margins', () => {
    expect(result.gross.amountCents).toBe(-500_000);
    expect(result.operating.amountCents).toBe(-800_000);
    expect(result.net.amountCents).toBe(-815_000);
  });

  it('publishes the base with its real sign', () => {
    expect(result.netRevenueCents).toBe(-500_000);
  });
});

describe('buildPeriodProfit — COGS parcial', () => {
  // D-3 y AC12: el importe es el de lo que sí tiene costo, y el recuento de líneas sin
  // costo viaja al lado para que la vista lo rotule como parcial. Nunca se resuelve
  // asumiendo `0`.
  const partial = cogs(400_000, 3, 10);
  const result = buildPeriodProfit({ ...BASE, cogs: partial });

  it('does not change the amount because some lines have no cost (D-3)', () => {
    expect(result.cogs.amountCents).toBe(400_000);
    expect(result.gross.amountCents).toBe(600_000);
  });

  it('carries uncostedLineCount through untouched (AC12)', () => {
    expect(result.cogs.uncostedLineCount).toBe(3);
    expect(result.cogs.lineCount).toBe(10);
  });

  it('keeps the cost and its confidence level together, never apart', () => {
    expect(result.cogs).toEqual(partial);
  });
});

describe('buildPeriodProfit — pérdida', () => {
  const result = buildPeriodProfit({
    ...BASE,
    netRevenueCents: 100_000,
    cogs: cogs(300_000),
    incomeTaxCents: 1_500,
  });

  it('lets every level go negative: a loss is a result, not an error (AC23)', () => {
    expect(result.gross.amountCents).toBe(-200_000);
    expect(result.operating.amountCents).toBe(-500_000);
    expect(result.net.amountCents).toBe(-501_500);
  });

  // La base sigue siendo positiva, así que el margen existe y es negativo: es el caso
  // distinto del AC22, donde la que no es positiva es la base.
  it('reports negative margins when the base is positive but the result is not', () => {
    expect(result.gross.marginPercent).toBe(-200);
    expect(result.net.marginPercent).toBe(-501.5);
  });
});

describe('buildPeriodProfit — renta cero', () => {
  // La base no positiva deja la Renta en `0` (026, D-6), y entonces la utilidad neta es la
  // operativa: la última resta no inventa una diferencia.
  const result = buildPeriodProfit({ ...BASE, incomeTaxCents: 0 });

  it('makes the net profit equal the operating one when there is no income tax', () => {
    expect(result.net.amountCents).toBe(result.operating.amountCents);
    expect(result.net.marginPercent).toBe(result.operating.marginPercent);
  });
});

describe('buildPeriodProfit — aritmética entera', () => {
  // AC26: todo importe del JSON es un entero en céntimos; la división por 100 solo ocurre
  // al formatear en la vista.
  const result = buildPeriodProfit({
    ...BASE,
    netRevenueCents: 333_333,
    cogs: cogs(111_111),
    operatingExpensesCents: 77_777,
    payrollCents: 55_555,
    incomeTaxCents: 5_000,
  });

  it('keeps the three amounts integer (AC26)', () => {
    for (const level of [result.gross, result.operating, result.net]) {
      expect(Number.isInteger(level.amountCents)).toBe(true);
    }
  });

  it('keeps every published amount integer, subtrahends included (AC26)', () => {
    for (const amount of [
      result.netRevenueCents,
      result.cogs.amountCents,
      result.operatingExpensesCents,
      result.payrollCents,
      result.incomeTaxCents,
    ]) {
      expect(Number.isInteger(amount)).toBe(true);
    }
  });

  // Un decimal, igual que el resto del módulo: `29.799999999999997` en la respuesta invita
  // a que la UI lo recorte por su cuenta.
  it('rounds the margins to a single decimal', () => {
    for (const level of [result.gross, result.operating, result.net]) {
      expect(level.marginPercent).toBe(Math.round((level.marginPercent ?? 0) * 10) / 10);
    }
  });
});
