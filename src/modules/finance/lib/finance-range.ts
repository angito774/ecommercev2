import { addReportingDays, reportingDayStart, toReportingDayKey } from '@/lib/reporting';

// El rango que elige una persona: dos días `'YYYY-MM-DD'`, ambos inclusive, tal y
// como se leen en el `<input type="date">`. Se declara aquí, donde se produce, y
// `types/finance.types.ts` lo reexporta para el contrato de la API: así no hay
// ciclo entre el schema Zod (que consume `isFutureReportingDay`) y los tipos.
export type FinanceRange = { from: string; to: string };

// El mismo rango ya traducido a los dos tipos de columna que hay que consultar:
// `date` para `expenses.incurred_on` y `timestamptz` para `orders.created_at`. Los
// cuatro campos derivan del mismo par de días, así que es imposible que el resumen
// cuente un día de ventas distinto del de gastos (AC6, AC8).
export type ResolvedFinanceRange = {
  fromDay: string;
  toDay: string;
  /** Instante en que abre `fromDay` en Lima. */
  from: Date;
  /**
   * Instante en que abre el día **siguiente** a `toDay`: la ventana sobre
   * `created_at` es semiabierta `[from, to)`. Con un extremo cerrado, un pedido de
   * medianoche exacta caería también en la ventana siguiente.
   */
  to: Date;
};

const pad = (value: number): string => String(value).padStart(2, '0');

// Mes en curso **en Lima**, no en UTC: a las 22:00 del 30 de septiembre en Lima ya
// es 1 de octubre en UTC, y sin esto la pantalla saltaría sola al mes siguiente tres
// horas antes de tiempo.
export function currentMonthRange(now: Date): FinanceRange {
  const [year, month] = toReportingDayKey(now).split('-').map(Number);

  // Día 0 del mes siguiente es el último del actual, con los bisiestos incluidos sin
  // tabla de longitudes. Aritmética de calendario sobre un día ya resuelto en Lima:
  // ningún huso interviene aquí.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

// Parámetros mínimos y no `FinanceRangeParams` completo: lo consumen el resumen y el
// listado, y el segundo trae además categoría y paginación que aquí no pintan nada.
type FinanceRangeInput = { from?: string; to?: string };

// `now` es un parámetro y no `new Date()` dentro: es lo que hace la función pura y
// probable sin congelar el reloj, y lo que permite que el handler use un mismo
// instante para el rango y para `meta.generatedAt`.
export function resolveFinanceRange(
  params: FinanceRangeInput,
  now: Date,
): ResolvedFinanceRange {
  const fallback = currentMonthRange(now);
  const fromDay = params.from ?? fallback.from;
  const toDay = params.to ?? fallback.to;

  return {
    fromDay,
    toDay,
    from: reportingDayStart(fromDay),
    to: reportingDayStart(addReportingDays(toDay, 1)),
  };
}

// Comparación lexicográfica sobre dos `'YYYY-MM-DD'`: el formato es de ancho fijo,
// así que el orden de cadena coincide con el cronológico. Se compara contra el día de
// hoy **en Lima**, no contra el del servidor en UTC: entre las 19:00 y medianoche de
// Lima, UTC ya va por el día siguiente y un gasto de hoy se rechazaría por futuro.
export function isFutureReportingDay(dayKey: string, now: Date): boolean {
  return dayKey > toReportingDayKey(now);
}
