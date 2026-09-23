import { FileWarning } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

import {
  UNINVOICED_ORDERS_HINT,
  UNINVOICED_ORDERS_HREF,
  UNINVOICED_ORDERS_LINK_LABEL,
} from '../constants';

type UninvoicedOrdersNoticeProps = {
  /**
   * Pedidos `paid` del rango sin comprobante original `issued`. `undefined` mientras el
   * resumen carga: el indicador no tiene un estado de carga propio, porque una línea que
   * aparece y desaparece bajo las cards sería más ruido que información.
   */
  count: number | undefined;
};

// Recibe el conteo por props y no consulta nada: el dato viaja en el mismo resumen que
// las cards, así que no hay un segundo hook ni una segunda petición.
export function UninvoicedOrdersNotice({ count }: UninvoicedOrdersNoticeProps) {
  // Con cero no se pinta (D-12): una línea permanente que casi siempre dice cero se
  // convierte en ruido que se deja de leer, que es lo contrario de lo que un indicador
  // de salud tiene que conseguir. Cuando aparece, aparece porque hay algo que hacer.
  if (!count) return null;

  return (
    <div className="bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3">
      <FileWarning className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <p className="text-sm">
        <span className="font-medium">
          {count} {count === 1 ? 'pedido pagado' : 'pedidos pagados'}
        </span>{' '}
        <span className="text-muted-foreground">{UNINVOICED_ORDERS_HINT}</span>
      </p>
      {/* A `/admin/orders` **a secas** (D-11): aquella tabla guarda sus filtros en
          `useState` y no lee la URL, así que una query string no filtraría nada y el
          enlace prometería algo que no pasa. */}
      <Button variant="link" size="sm" className="px-0" asChild>
        <Link href={UNINVOICED_ORDERS_HREF}>{UNINVOICED_ORDERS_LINK_LABEL}</Link>
      </Button>
    </div>
  );
}
