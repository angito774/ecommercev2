import type { OrderHistoryEntry } from '../types/order.types';

import { toDayInputValue } from './order-history-range';

export type OrderDayGroup = {
  /** `YYYY-MM-DD` en la zona local del navegador. Clave de React, no texto visible. */
  key: string;
  /** Etiqueta con día, mes y año: «martes, 9 de septiembre de 2026». */
  label: string;
  orders: OrderHistoryEntry[];
};

// Se instancia una vez: construir un `Intl.DateTimeFormat` es caro y hacerlo por
// fila lo repetiría hasta 60 veces por render.
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

// Agrupar es presentación, no consulta: la regla dura reserva el repositorio para
// las *consultas*, y hacerlo en SQL con `date_trunc` obligaría a fijar una zona
// horaria en el servidor que no es la del cliente (D-6).
//
// Función pura y estable: respeta el orden de entrada, que el repositorio ya
// devuelve de más reciente a más antiguo, así que grupos y pedidos dentro de cada
// grupo salen ordenados sin volver a ordenar nada (AC4).
export function groupOrdersByDay(entries: OrderHistoryEntry[]): OrderDayGroup[] {
  const groups: OrderDayGroup[] = [];
  const byKey = new Map<string, OrderDayGroup>();

  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    const key = toDayInputValue(date);

    const existing = byKey.get(key);
    if (existing) {
      existing.orders.push(entry);
      continue;
    }

    const group: OrderDayGroup = { key, label: DAY_LABEL_FORMATTER.format(date), orders: [entry] };
    byKey.set(key, group);
    groups.push(group);
  }

  return groups;
}
