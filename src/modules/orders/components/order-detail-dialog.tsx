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
