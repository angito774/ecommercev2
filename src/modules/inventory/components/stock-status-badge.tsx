import { AlertTriangle, PackageCheck, PackageX, type LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { Badge } from '@/components/ui/badge';

import { STOCK_STATUS_LABELS } from '../constants';
import type { StockStatus } from '../types/inventory.types';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

// Mapa total sobre `StockStatus`: `'in'` no llega por este endpoint, pero el tipo lo
// declara y un caso sin entrada obligaría a un fallback que nadie puede probar
// (D-6). `badge.tsx` no tiene variante `warning` —verificado—, así que el ámbar se
// compone con `outline` más clases de color, igual que `kpi-card.tsx` compone su
// verde (D-13).
const STATUS_STYLES: Record<StockStatus, { variant: BadgeVariant; className: string; icon: LucideIcon }> =
  {
    out: { variant: 'destructive', className: '', icon: PackageX },
    low: {
      variant: 'outline',
      className: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
      icon: AlertTriangle,
    },
    in: { variant: 'secondary', className: '', icon: PackageCheck },
  };

// El icono es decorativo y el texto siempre visible: solo color es inaccesible para
// daltonismo y en impresión, así que «Agotado» y «Stock bajo» se distinguen leyendo
// la etiqueta aunque el matiz no llegue (AC7, D-13).
export function StockStatusBadge({ status }: { status: StockStatus }) {
  const { variant, className, icon: Icon } = STATUS_STYLES[status];

  return (
    <Badge variant={variant} className={className}>
      <Icon aria-hidden />
      {STOCK_STATUS_LABELS[status]}
    </Badge>
  );
}
