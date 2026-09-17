import { toReportingDayKey } from '@/lib/reporting';

import type { RevenuePoint } from '../types/dashboard.types';

import type { PeriodRange } from './period-range';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Relleno de los días sin ventas. En TypeScript y no con `generate_series` en SQL:
// son quince líneas que `npm test` prueba sin base de datos, que es lo que este
// proyecto hace con el resto de funciones de dominio (D-19).
//
// El recorrido lo manda el rango, no las filas: si la consulta devuelve tres días
// de un mes, la serie sigue teniendo treinta puntos (AC11). Las filas solo aportan
// el importe, así que llegar desordenadas da igual — el orden es el del rango.
export function fillRevenueSeries(
  rows: readonly RevenuePoint[],
  range: PeriodRange,
): RevenuePoint[] {
  const revenueByDay = new Map(rows.map((row) => [row.day, row.revenueCents]));
  const series: RevenuePoint[] = [];

  // Suma de días enteros sobre un desfase fijo: Perú no tiene horario de verano, así
  // que ningún día del rango mide 23 o 25 horas (D-6).
  for (let instant = range.from.getTime(); instant < range.to.getTime(); instant += MS_PER_DAY) {
    const day = toReportingDayKey(new Date(instant));
    series.push({ day, revenueCents: revenueByDay.get(day) ?? 0 });
  }

  return series;
}
