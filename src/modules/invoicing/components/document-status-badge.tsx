import { Ban, CircleCheck, Clock, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { Badge } from '@/components/ui/badge';

import { ELECTRONIC_DOCUMENT_STATUS_LABELS } from '../constants';
import type { ElectronicDocumentStatus } from '../types/electronic-document.types';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

// Mapa total sobre `ElectronicDocumentStatus`: `voided` no lo escribe ningún camino de este
// spec —lo estrena el 023—, pero el tipo lo declara y un caso sin entrada obligaría a un
// fallback que nadie puede probar (mismo criterio que `StockStatusBadge`).
//
// `badge.tsx` no tiene variante `warning` —verificado—, así que el ámbar de «pendiente» se
// compone con `outline` más clases de color, igual que hace el badge de stock.
const STATUS_STYLES: Record<
  ElectronicDocumentStatus,
  { variant: BadgeVariant; className: string; icon: LucideIcon }
> = {
  pending: {
    variant: 'outline',
    className: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
    icon: Clock,
  },
  issued: { variant: 'default', className: '', icon: CircleCheck },
  failed: { variant: 'destructive', className: '', icon: TriangleAlert },
  voided: { variant: 'secondary', className: '', icon: Ban },
};

// El icono es decorativo y el texto siempre visible: solo color es inaccesible para
// daltonismo y en impresión, así que «Pendiente de emisión» y «Emitido» se distinguen
// leyendo la etiqueta aunque el matiz no llegue.
export function DocumentStatusBadge({ status }: { status: ElectronicDocumentStatus }) {
  const { variant, className, icon: Icon } = STATUS_STYLES[status];

  return (
    <Badge variant={variant} className={className}>
      <Icon aria-hidden />
      {ELECTRONIC_DOCUMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
