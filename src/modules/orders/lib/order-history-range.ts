import type { OrderHistoryRange } from '../types/order.types';

// Todo el módulo trabaja en la zona horaria del navegador y solo publica instantes
// absolutos. Resolver «el mes actual» en el servidor lo ataría a UTC (Vercel) y un
// pedido de las 21:00 en Lima caería en el día siguiente (D-6, D-7).

// `new Date('2026-09-09')` se interpreta como medianoche UTC, no local: con eso,
// un cliente en Lima perdería los pedidos de las primeras cinco horas del día
// `desde`. De ahí el parseo a mano de los tres números.
function parseDay(day: string): [number, number, number] {
  const [year, month, date] = day.split('-').map(Number);
  return [year, month - 1, date];
}

function startOfDay(year: number, month: number, date: number): Date {
  return new Date(year, month, date, 0, 0, 0, 0);
}

// 23:59:59.999 y no la medianoche siguiente: el `WHERE` del repositorio usa `lte`,
// así que un pedido de las 23:50 del día `hasta` entra y el primer segundo del día
// siguiente no (AC5).
function endOfDay(year: number, month: number, date: number): Date {
  return new Date(year, month, date, 23, 59, 59, 999);
}

function toRange(from: Date, to: Date): OrderHistoryRange {
  return { from: from.toISOString(), to: to.toISOString() };
}

export function currentMonthRange(now: Date = new Date()): OrderHistoryRange {
  const year = now.getFullYear();
  const month = now.getMonth();

  // Día 0 del mes siguiente es el último del actual: evita la tabla de 28/30/31 y
  // acierta en febrero bisiesto sin un solo condicional.
  const lastDate = new Date(year, month + 1, 0).getDate();

  return toRange(startOfDay(year, month, 1), endOfDay(year, month, lastDate));
}

export function dayRange(fromDay: string, toDay: string): OrderHistoryRange {
  const [fromYear, fromMonth, fromDate] = parseDay(fromDay);
  const [toYear, toMonth, toDate] = parseDay(toDay);

  return toRange(
    startOfDay(fromYear, fromMonth, fromDate),
    endOfDay(toYear, toMonth, toDate),
  );
}

// El valor que entiende `<input type="date">`: `YYYY-MM-DD` en local.
// `toISOString().slice(0, 10)` daría el día UTC y desplazaría el campo un día en
// husos negativos.
export function toDayInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
