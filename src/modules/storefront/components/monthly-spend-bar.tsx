import { groupOrdersByDay } from '@/modules/orders/lib/group-orders-by-day';
import type { OrderHistoryEntry } from '@/modules/orders/types/order.types';
import { formatPrice } from '@/modules/products/lib/price';

// Altura del carril de barras. En rem y no en píxeles para que acompañe al tamaño de
// fuente del usuario, como el resto de la cuenta.
const TRACK_HEIGHT = 'h-[5.5rem]';

// Suelo visual: una barra de 1 % sería una línea invisible y parecería un día sin
// compras, que es justo lo contrario de lo que pasó.
const MIN_BAR_PERCENT = 8;

// Barras en CSS puro y no Recharts: Recharts ya está instalado pero solo vive en el
// panel de administración, y arrastrarlo al storefront metería su chunk en la única
// página de cliente autenticado por una tira decorativa de barras (spec 013, §8).
//
// Sin `"use client"`: es marcado puro sobre las props. Lo renderiza
// `AccountSummaryCards`, que sí es cliente, así que acaba en su bundle igual, pero
// el componente no necesita ni estado ni efectos.
export function MonthlySpendBar({ orders }: { orders: OrderHistoryEntry[] }) {
  // Solo lo cobrado. Un pedido `pending`, `payment_failed` o `canceled` no es gasto,
  // y sumarlo inflaría la única cifra de dinero que la cuenta afirma.
  const paid = orders.filter((order) => order.status === 'paid');

  // `groupOrdersByDay()` ya existe y agrupa en la zona del navegador; reimplementar
  // el agrupado aquí daría dos criterios de «día» en la misma página (D-6).
  // Llega de más reciente a más antiguo y el eje del tiempo va al revés.
  const days = groupOrdersByDay(paid)
    .map((group) => ({
      key: group.key,
      label: group.label,
      cents: group.orders.reduce((total, order) => total + order.amountTotalCents, 0),
    }))
    .reverse();

  if (days.length === 0) return null;

  // Suelo de 1: un mes de pedidos `paid` que sumen 0 dejaría `max` en 0 y la altura
  // de cada barra en `NaN%`, colapsando el carril entero.
  const max = Math.max(1, ...days.map((day) => day.cents));
  const total = days.reduce((sum, day) => sum + day.cents, 0);

  return (
    <div className="border-border bg-card rounded-[22px] border p-[clamp(1.25rem,3vw,1.75rem)]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        {/* «Este mes» explícito: el hook trabaja por rango mensual y presentar esto
            como el gasto histórico sería mentir sobre datos reales (spec 013, §5). */}
        <h3 className="text-[15px] font-semibold tracking-[-0.02em]">Gasto de este mes</h3>
        <p className="font-nx-display text-[17px] font-semibold tabular-nums">
          {formatPrice(total)}
        </p>
      </div>

      {/* Lista y no un `<svg>` con `role="img"`: cada barra lleva su día y su importe
          como texto para el lector de pantalla, así que el dato está disponible sin
          depender del dibujo. */}
      <ul className={`flex items-end gap-1.5 ${TRACK_HEIGHT}`}>
        {days.map((day) => (
          <li key={day.key} className="flex h-full flex-1 items-end">
            <span
              className="bg-primary/70 block w-full rounded-t-md"
              style={{ height: `${Math.max(MIN_BAR_PERCENT, (day.cents / max) * 100)}%` }}
            >
              <span className="sr-only">
                {day.label}: {formatPrice(day.cents)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="text-nx-faint mt-3 text-xs">
        {days.length} {days.length === 1 ? 'día con compras' : 'días con compras'} en el mes en
        curso.
      </p>
    </div>
  );
}
