// Las tres restas del estado de resultados. Módulo puro —sin Drizzle, sin React, sin
// Zod—, en céntimos enteros de punta a punta, igual que `rer.ts` e `igv.ts`: el cliente lo
// importa sin arrastrar nada de servidor.

import type { CostOfGoodsSold, PeriodProfit, ProfitLevel } from '../types/finance.types';

import { marginPercent } from './finance-math';

/**
 * Un nivel con su margen sobre el ingreso neto del rango.
 *
 * El guard de base **no positiva** vive aquí y no dentro de `marginPercent()` (D-9):
 * aquella la comparte `unitMargin()` del spec 021, donde la base es el precio de venta y
 * no puede ser negativa, así que meterle una regla que solo necesita esta pantalla movería
 * el comportamiento de otra que no lo ha pedido. `marginPercent()` ya devuelve `null` en
 * `0`, pero con base negativa devolvería un porcentaje de signo invertido
 * —`marginPercent(-1000, -500) === 50`— que diría «50 % de margen» sobre un rango en el
 * que no hubo ingresos (AC21, AC22).
 */
function level(amountCents: number, netRevenueCents: number): ProfitLevel {
  return {
    amountCents,
    marginPercent: netRevenueCents > 0 ? marginPercent(netRevenueCents, amountCents) : null,
  };
}

export type PeriodProfitInput = {
  netRevenueCents: number;
  cogs: CostOfGoodsSold;
  operatingExpensesCents: number;
  payrollCents: number;
  payrollPaymentCount: number;
  incomeTaxCents: number;
};

/**
 * La cascada completa, en aritmética entera de céntimos (AC18, AC26):
 *
 * ```
 * utilidadBruta     = ingresoNeto − cogs
 * utilidadOperativa = utilidadBruta − gastosNetos − nómina
 * utilidadNeta      = utilidadOperativa − renta
 * ```
 *
 * Función pura para que el handler no calcule y los casos borde tengan test. El IGV **no**
 * es un parámetro y no resta en ninguno de los tres niveles (D-10, AC20): la empresa lo
 * recauda del comprador y lo traslada a SUNAT, y por eso el ingreso base es `base_cents`,
 * sin IGV, desde la primera línea; restarlo otra vez al final sería contarlo dos veces. La
 * Renta sí es un impuesto **sobre** el resultado, y por eso separa la operativa de la neta.
 *
 * Los sustraendos se publican junto a los tres totales: tres números sin las restas que
 * los separan no se pueden auditar a ojo.
 */
export function buildPeriodProfit(input: PeriodProfitInput): PeriodProfit {
  const { netRevenueCents, cogs, operatingExpensesCents, payrollCents, incomeTaxCents } = input;

  const grossCents = netRevenueCents - cogs.amountCents;
  const operatingCents = grossCents - operatingExpensesCents - payrollCents;
  const netCents = operatingCents - incomeTaxCents;

  return {
    netRevenueCents,
    // Viaja intacto, `uncostedLineCount` incluido: el importe y su nivel de confianza no
    // se separan nunca, porque separarlos permitiría pintar el COGS sin la advertencia.
    cogs,
    gross: level(grossCents, netRevenueCents),
    operatingExpensesCents,
    payrollCents,
    payrollPaymentCount: input.payrollPaymentCount,
    operating: level(operatingCents, netRevenueCents),
    incomeTaxCents,
    net: level(netCents, netRevenueCents),
  };
}
