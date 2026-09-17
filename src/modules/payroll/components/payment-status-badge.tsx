import { BanknoteX, CircleCheck, type LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { Badge } from '@/components/ui/badge';

import { PAYMENT_STATUS_LABELS } from '../constants';
import type { PayrollPaymentStatus } from '../types/payroll.types';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

// Mapa total sobre `PayrollPaymentStatus`: un estado nuevo rompe el typecheck aquí en
// vez de caer en un fallback que nadie puede probar.
const STATUS_STYLES: Record<PayrollPaymentStatus, { variant: BadgeVariant; icon: LucideIcon }> = {
  paid: { variant: 'secondary', icon: CircleCheck },
  voided: { variant: 'destructive', icon: BanknoteX },
};

// El icono es decorativo y el texto siempre visible: solo color es inaccesible para
// daltonismo y en impresión, así que «Pagado» y «Anulado» se distinguen leyendo la
// etiqueta aunque el matiz no llegue.
export function PaymentStatusBadge({ status }: { status: PayrollPaymentStatus }) {
  const { variant, icon: Icon } = STATUS_STYLES[status];

  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
