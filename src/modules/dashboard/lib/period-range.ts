import { PERIOD_DAYS, REPORTING_UTC_OFFSET_MINUTES } from '../constants';
import type { DashboardPeriod } from '../schemas/dashboard.schema';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const OFFSET_MS = REPORTING_UTC_OFFSET_MINUTES * MS_PER_MINUTE;

// Intervalo semiabierto `[from, to)`: el instante `to` pertenece a la ventana
// siguiente. Con extremos cerrados, un pedido de medianoche exacta caería en las
// dos ventanas y se contaría dos veces.
export type PeriodRange = { from: Date; to: Date };

export type ResolvedPeriodRange = {
  current: PeriodRange;
  // Misma duración y contigua a `current`: `previous.to === current.from` (AC6).
  previous: PeriodRange;
};

// Instante UTC en el que empieza, en Lima, el día al que pertenece `instant`.
// Aritmética de enteros sobre el desfase fijo de −05:00 (D-6): desplazar al huso,
// truncar al día y volver. Sin `Intl` en el camino caliente.
function startOfReportingDay(instant: Date): number {
  const shifted = instant.getTime() + OFFSET_MS;
  return Math.floor(shifted / MS_PER_DAY) * MS_PER_DAY - OFFSET_MS;
}

// `now` es un parámetro y no `new Date()` dentro: es lo que hace la función pura y
// probable sin congelar el reloj, y lo que permite que el handler use un mismo
// instante para el rango y para `meta.generatedAt`.
export function resolvePeriodRange(period: DashboardPeriod, now: Date): ResolvedPeriodRange {
  const days = PERIOD_DAYS[period];
  const span = days * MS_PER_DAY;

  // El día en curso entra entero aunque esté incompleto: `to` es el inicio del día
  // siguiente, así que una venta de hace un minuto ya cuenta (§10).
  const to = startOfReportingDay(now) + MS_PER_DAY;
  const from = to - span;

  return {
    current: { from: new Date(from), to: new Date(to) },
    previous: { from: new Date(from - span), to: new Date(from) },
  };
}

// Clave del eje X y del bucket diario: el mismo `'YYYY-MM-DD'` que `to_char()`
// produce en SQL sobre `created_at at time zone 'America/Lima'`. Se construye con
// los getters UTC sobre el instante ya desplazado, nunca con `toISOString()` a
// secas, que devolvería el día de UTC.
export function toReportingDayKey(instant: Date): string {
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');

  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}
