import { ArrowDownToLine, ArrowUpFromLine, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { TransactionDirection } from '@/lib/inventory-transactions';

import { DIRECTION_LABELS } from '../constants';

// Mapa total sobre `TransactionDirection`: un sentido sin entrada no compilaría, en vez
// de caer a un fallback que nadie puede probar. `badge.tsx` no tiene variante `warning`
// —verificado—, así que las dos se componen con `outline` más clases de color, igual que
// `StockStatusBadge` compone su ámbar.
const DIRECTION_STYLES: Record<
  TransactionDirection,
  { className: string; icon: LucideIcon }
> = {
  ingreso: {
    className: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
    icon: ArrowDownToLine,
  },
  salida: {
    className: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
    icon: ArrowUpFromLine,
  },
};

// El icono es decorativo y el texto siempre visible: solo color es inaccesible para
// daltonismo y en impresión, así que «Ingreso» y «Salida» se distinguen leyendo la
// etiqueta aunque el matiz no llegue.
export function TransactionDirectionBadge({ direction }: { direction: TransactionDirection }) {
  const { className, icon: Icon } = DIRECTION_STYLES[direction];

  return (
    <Badge variant="outline" className={className}>
      <Icon aria-hidden />
      {DIRECTION_LABELS[direction]}
    </Badge>
  );
}
