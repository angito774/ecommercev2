'use client';

import { formatPrice } from '@/modules/products/lib/price';

import type { OrderHistoryEntry } from '../types/order.types';
import { formatOrderNumber } from './order-confirmation';
import { OrderDetailDialog } from './order-detail-dialog';
import { OrderStatusBadge } from './order-status-badge';

type OrderHistoryRowProps = {
  order: OrderHistoryEntry;
};

const TIME_FORMATTER = new Intl.DateTimeFormat('es-PE', { timeStyle: 'short' });

// La fecha completa la pone el encabezado del grupo, así que la fila solo repite
// la hora: volver a escribir el día en cada pedido sería ruido bajo su propio
// título (AC4).
export function OrderHistoryRow({ order }: OrderHistoryRowProps) {
  const units = order.items.reduce((total, item) => total + item.quantity, 0);

  return (
    <li className="border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[22px] border p-4">
      <div className="min-w-0 flex-1">
        <p className="font-nx-display text-[15.5px] font-semibold tracking-[-0.025em] tabular-nums">
          {formatOrderNumber(order.id)}
        </p>
        <p className="text-nx-faint mt-1.5 text-xs">
          {TIME_FORMATTER.format(new Date(order.createdAt))} · {order.items.length}{' '}
          {order.items.length === 1 ? 'producto' : 'productos'} · {units} ud.
        </p>
      </div>

      <OrderStatusBadge status={order.status} />

      <span className="font-nx-display text-[15.5px] font-semibold tracking-[-0.025em] tabular-nums">
        {formatPrice(order.amountTotalCents)}
      </span>

      <OrderDetailDialog order={order} />
    </li>
  );
}
