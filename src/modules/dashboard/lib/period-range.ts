import { startOfReportingDay } from '@/lib/reporting';

import { PERIOD_DAYS } from '../constants';
import type { DashboardPeriod } from '../schemas/dashboard.schema';

const MS_PER_DAY = 24 * 60 * 60_000;

// Intervalo semiabierto `[from, to)`: el instante `to` pertenece a la ventana
// siguiente. Con extremos cerrados, un pedido de medianoche exacta caería en las
// dos ventanas y se contaría dos veces.
export type PeriodRange = { from: Date; to: Date };

export type ResolvedPeriodRange = {
  current: PeriodRange;
  // Misma duración y contigua a `current`: `previous.to === current.from` (AC6).
  previous: PeriodRange;
};

// `now` es un parámetro y no `new Date()` dentro: es lo que hace la función pura y
// probable sin congelar el reloj, y lo que permite que el handler use un mismo
// instante para el rango y para `meta.generatedAt`.
export function resolvePeriodRange(period: DashboardPeriod, now: Date): ResolvedPeriodRange {
  const days = PERIOD_DAYS[period];
  const span = days * MS_PER_DAY;

  // El día en curso entra entero aunque esté incompleto: `to` es el inicio del día
  // siguiente, así que una venta de hace un minuto ya cuenta (§10).
  const to = startOfReportingDay(now).getTime() + MS_PER_DAY;
  const from = to - span;

  return {
    current: { from: new Date(from), to: new Date(to) },
    previous: { from: new Date(from - span), to: new Date(from) },
  };
}
