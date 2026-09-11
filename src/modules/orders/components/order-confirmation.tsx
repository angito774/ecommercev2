import { CircleAlert, CircleCheck, Loader2, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { formatPrice } from '@/modules/products/lib/price';

import { ORDER_STATUS_LABELS } from '../constants';
import type { OrderStatus, OrderSummary } from '../types/order.types';
import { OrderLines } from './order-lines';
import { OrderReceiptLink } from './order-receipt-link';

type OrderConfirmationProps = {
  order: OrderSummary;
};

// El número que el cliente lee y dicta por teléfono. El uuid completo es ruido: los
// 8 primeros caracteres identifican el pedido de sobra a este volumen y siguen
// siendo suficientes para localizarlo con un `like` en el panel.
export function formatOrderNumber(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

const STATUS_ICONS: Record<OrderStatus, LucideIcon> = {
  pending: Loader2,
  paid: CircleCheck,
  payment_failed: XCircle,
  canceled: CircleAlert,
};

const STATUS_BODY: Record<OrderStatus, string> = {
  pending:
    'Estamos confirmando el cobro con Stripe. Esto suele tardar unos segundos y esta página se actualizará sola.',
  paid: 'Hemos recibido tu pago. Te avisaremos cuando el pedido salga de nuestro almacén.',
  payment_failed:
    'El banco no completó el cobro y el pedido no se ha tramitado. No se te ha cargado nada.',
  canceled: 'La sesión de pago caducó sin completarse, así que el pedido no se ha tramitado.',
};

// Presentacional puro: recibe la orden ya resuelta y no sabe de dónde salió. Por eso
// sirve igual para el retorno de Stripe y para el futuro `/orders/[id]`.
export function OrderConfirmation({ order }: OrderConfirmationProps) {
  const Icon = STATUS_ICONS[order.status];
  const isPending = order.status === 'pending';

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <header className="mb-[clamp(1.75rem,4vw,2.5rem)] text-center">
        <span
          className={`mb-5 grid size-14 place-items-center rounded-full ${
            order.status === 'paid'
              ? 'bg-nx-accent-soft text-nx-ok'
              : 'bg-secondary text-nx-faint'
          } mx-auto`}
        >
          <Icon className={`size-6 ${isPending ? 'animate-spin' : ''}`} aria-hidden />
        </span>

        <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.1] font-semibold tracking-[-0.035em]">
          {ORDER_STATUS_LABELS[order.status]}
        </h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-[52ch] text-[15px] leading-relaxed">
          {STATUS_BODY[order.status]}
        </p>
        <p className="text-nx-faint mt-4 text-sm">
          Pedido{' '}
          <span className="text-foreground font-nx-display font-semibold tabular-nums">
            {formatOrderNumber(order.id)}
          </span>
        </p>
      </header>

      <OrderLines items={order.items} />

      <dl className="border-border bg-card text-muted-foreground mt-4 space-y-2.5 rounded-[22px] border p-[clamp(1.25rem,3vw,1.75rem)] text-sm">
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
        <div className="border-border text-foreground font-nx-display flex items-center justify-between gap-3 border-t pt-3 text-lg font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatPrice(order.amountTotalCents)}</dd>
        </div>
      </dl>

      {/* Solo con el cobro confirmado: sin pago, Stripe no tiene boleta que emitir
          (mismo criterio que `receiptAvailable` en el historial, D-8 spec 008). */}
      {order.status === 'paid' && (
        <div className="mt-4">
          <OrderReceiptLink orderId={order.id} open />
        </div>
      )}

      <div className="mt-7 flex justify-center">
        <Button asChild variant="outline" className="h-11 rounded-full px-6">
          <Link href="/#catalogo">Seguir comprando</Link>
        </Button>
      </div>
    </div>
  );
}
