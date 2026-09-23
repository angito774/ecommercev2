'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { OrderDocuments } from '@/modules/invoicing/components/order-documents';
import {
  CUSTOMER_DOCUMENT_ISSUING,
  CUSTOMER_DOCUMENT_NONE,
  CUSTOMER_DOCUMENT_TITLE,
} from '@/modules/invoicing/constants';
import { formatPrice } from '@/modules/products/lib/price';

import { RECEIPT_UNAVAILABLE_HINT } from '../constants';
import type { OrderHistoryEntry } from '../types/order.types';
import { formatOrderNumber } from './order-confirmation';
import { OrderLines } from './order-lines';
import { OrderReceiptLink } from './order-receipt-link';
import { OrderStatusBadge } from './order-status-badge';

type OrderDetailDialogProps = {
  order: OrderHistoryEntry;
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'long',
  timeStyle: 'short',
});

/**
 * Tres situaciones distintas y tres textos distintos, porque decir «no hay comprobante» en
 * las tres sería mentir en dos:
 *
 * - Pedido sin pagar (`pending`, `payment_failed`, `canceled`): no hay comprobante ni lo
 *   habrá, y la vista lo explica igual que hace con el recibo (AC25).
 * - Pagado y con el comprobante todavía en cola o fallido: «se está emitiendo», conservando
 *   el recibo de Stripe como respaldo. Nunca un enlace roto ni un error (AC24).
 * - Emitido: la lista con su enlace real al PDF (AC23).
 *
 * El caso «pagado, sin ninguna fila» existe de verdad: es el pedido anterior a la migración
 * `0010`, que no tiene documento del comprador y no se puede facturar (AC8). Cae en el
 * estado vacío de `OrderDocuments`, que lo nombra.
 */
function CustomerDocuments({ order }: { order: OrderHistoryEntry }) {
  if (order.status !== 'paid') {
    return (
      <p className="text-muted-foreground text-sm leading-relaxed">{CUSTOMER_DOCUMENT_NONE}</p>
    );
  }

  const issuing = order.documents.some((document) => document.status !== 'issued');

  return (
    <div className="space-y-2">
      {/* Sin `renderAction`: el cliente no emite nada, la acción es del panel (D-8). */}
      <OrderDocuments documents={order.documents} />
      {issuing ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {CUSTOMER_DOCUMENT_ISSUING}
        </p>
      ) : null}
    </div>
  );
}

// El pedido llega entero desde la lista, líneas incluidas: abrir el diálogo no
// lanza ninguna petición para pintar el detalle (D-2, AC9). La única llamada que
// puede salir de aquí es la de la boleta, y solo si el pedido está pagado.
export function OrderDetailDialog({ order }: OrderDetailDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 rounded-full px-5">
          Ver detalle
        </Button>
      </DialogTrigger>

      {/* `max-h` con scroll propio: a 390 px el detalle de un pedido de varias
          líneas no cabe, y sin esto el diálogo se sale de la pantalla (AC16). */}
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-nx-display text-lg tabular-nums">
            Pedido {formatOrderNumber(order.id)}
          </DialogTitle>
          <DialogDescription>
            {DATE_TIME_FORMATTER.format(new Date(order.createdAt))}
          </DialogDescription>
        </DialogHeader>

        <div>
          <OrderStatusBadge status={order.status} />
        </div>

        <OrderLines items={order.items} />

        <dl className="border-border bg-card text-muted-foreground space-y-2.5 rounded-[22px] border p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatPrice(order.subtotalCents)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt>Envío</dt>
            <dd className="tabular-nums">
              {order.shippingCents === 0 ? 'Gratis' : formatPrice(order.shippingCents)}
            </dd>
          </div>
          <div className="border-border text-foreground font-nx-display flex items-center justify-between gap-3 border-t pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPrice(order.amountTotalCents)}</dd>
          </div>
        </dl>

        {/* El comprobante SUNAT y el recibo de Stripe **conviven**, no se sustituyen (spec
            022, D-14): el primero es el documento fiscal; el segundo es la constancia del
            cargo, con el medio de pago y los últimos cuatro dígitos, que es lo que el
            cliente busca cuando reclama al banco. Y cubre la ventana en la que el
            comprobante sigue `pending`, que con emisión manual puede durar (AC24). */}
        <section className="space-y-2">
          <h3 className="text-sm font-medium">{CUSTOMER_DOCUMENT_TITLE}</h3>
          <CustomerDocuments order={order} />
        </section>

        {order.receiptAvailable ? (
          <OrderReceiptLink orderId={order.id} open={open} />
        ) : (
          // No hay nada que reintentar: sin cobro confirmado Stripe no emite
          // boleta, y callarlo dejaría al cliente buscando un botón que no existe
          // (AC11).
          <p className="text-muted-foreground text-sm leading-relaxed">
            {RECEIPT_UNAVAILABLE_HINT}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
