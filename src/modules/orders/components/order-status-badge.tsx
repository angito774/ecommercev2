import type { ComponentProps } from 'react';

import { Badge } from '@/components/ui/badge';

import { ORDER_STATUS_LABELS } from '../constants';
import type { OrderStatus } from '../types/order.types';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

// El color lo decide el estado, no quien pinta el badge: una fila del historial y
// un futuro `/admin/orders` deben leer «Pago confirmado» del mismo verde.
const STATUS_VARIANTS: Record<OrderStatus, BadgeVariant> = {
  pending: 'secondary',
  paid: 'default',
  payment_failed: 'destructive',
  canceled: 'outline',
};

type OrderStatusBadgeProps = {
  status: OrderStatus;
  /**
   * Texto alternativo al del cliente. El panel lo usa porque «Confirmando tu pago»
   * le habla al comprador de su propia compra y ahí se está mirando la de otro; el
   * color lo sigue decidiendo el estado (D-15).
   */
  label?: string;
};

export function OrderStatusBadge({ status, label }: OrderStatusBadgeProps) {
  return <Badge variant={STATUS_VARIANTS[status]}>{label ?? ORDER_STATUS_LABELS[status]}</Badge>;
}
