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

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}
