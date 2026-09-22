'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ISSUE_BUTTON_LABEL } from '@/modules/invoicing/constants';
import { OrderDocuments } from '@/modules/invoicing/components/order-documents';
import { useIssueDocument } from '@/modules/invoicing/hooks/use-issue-document';
import type { ElectronicDocumentRow } from '@/modules/invoicing/types/electronic-document.types';
import { formatPrice } from '@/modules/products/lib/price';

import { ADMIN_ORDER_STATUS_LABELS } from '../constants';
import { useAdminOrder } from '../hooks/use-admin-orders';
import { canCancelOrder } from '../lib/order-transitions';
import { formatShippingAddress } from '../lib/shipping-address';
import type { AdminOrderDetail } from '../types/order.types';

import { CancelOrderDialog } from './cancel-order-dialog';
import { formatOrderNumber } from './order-confirmation';
import { OrderLines } from './order-lines';
import { OrderStatusBadge } from './order-status-badge';

type AdminOrderDetailSheetProps = {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'long',
  timeStyle: 'short',
});

function ShippingAddress({ order }: { order: AdminOrderDetail }) {
  const lines = order.shippingAddress ? formatShippingAddress(order.shippingAddress) : [];

  // Un pedido que nunca llegó a `paid` no tiene dirección, y una forma de jsonb que
  // no encaja cae aquí también: en los dos casos se dice, en vez de dejar el hueco
  // en blanco que parece un fallo de carga (AC11, D-12).
  if (lines.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Sin dirección registrada. Stripe solo la entrega cuando el pago se confirma.
      </p>
    );
  }

  return (
    <address className="text-sm not-italic">
      {lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </address>
  );
}

function StripeReference({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      {/* Texto seleccionable, sin enlace al Dashboard: el enlace obligaría a saber si
          la cuenta está en test o en live para no mandar a un 404 (D-18). */}
      <dd className="font-mono text-xs break-all select-all">{value ?? '—'}</dd>
    </div>
  );
}

// La acción vive aquí y no dentro de `OrderDocuments` porque `OrderDocuments` es
// presentacional y lo comparte «Mis compras», donde no hay ninguna emisión que disparar
// (D-11). Se inyecta como `renderAction`.
function IssueDocumentButton({
  document,
  orderId,
}: {
  document: ElectronicDocumentRow;
  orderId: string;
}) {
  const mutation = useIssueDocument();

  // Un documento `issued` no se reemite y uno `voided` lo anuló el spec 023 a propósito: el
  // estado lo decide el mismo conjunto que el `WHERE` del reclamo en el servidor, así que
  // la UI no ofrece algo que la API vaya a rechazar con un 409 (AC19).
  if (document.status !== 'pending' && document.status !== 'failed') return null;

  return (
    <Button
      size="sm"
      variant={document.status === 'failed' ? 'outline' : 'default'}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate({ documentId: document.id, orderId })}
    >
      {mutation.isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Emitiendo…
        </>
      ) : (
        // Mismo rótulo para el primer intento y para el décimo: sin automatismo detrás son
        // literalmente la misma acción sobre la misma fila (D-10).
        ISSUE_BUTTON_LABEL
      )}
    </Button>
  );
}

function OrderDetailBody({
  order,
  canUpdateStatus,
  canIssueInvoice,
}: {
  order: AdminOrderDetail;
  canUpdateStatus: boolean;
  canIssueInvoice: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Las dos condiciones: el estado lo decide la misma función que produce el 409 en
  // el servidor (D-10), y el permiso viaja resuelto en el `meta` (D-11). Ocultar el
  // botón no es la frontera —el PATCH la vuelve a poner (AC14)—, solo evita ofrecer
  // algo que la API va a rechazar.
  const showCancel = canUpdateStatus && canCancelOrder(order.status);

  return (
    <>
      <div className="space-y-6 px-4 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge
            status={order.status}
            label={ADMIN_ORDER_STATUS_LABELS[order.status]}
          />
          <span className="text-muted-foreground text-sm">
            Actualizado el {DATE_TIME_FORMATTER.format(new Date(order.updatedAt))}
          </span>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Cliente</h3>
          <div className="text-sm">
            {order.customerName ? <p>{order.customerName}</p> : null}
            <p className="text-muted-foreground break-all">{order.customerEmail}</p>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Líneas</h3>
          <OrderLines items={order.items} />
        </section>

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
          <div className="border-border text-foreground flex items-center justify-between gap-3 border-t pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPrice(order.amountTotalCents)}</dd>
          </div>
        </dl>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Comprobantes electrónicos</h3>
          {/* `renderAction` solo se pasa con el permiso resuelto en servidor (AC20). Ocultar
              el botón no es la frontera —el `POST` la vuelve a poner con su propio
              `authorize('invoicing.issue')` (AC18)—, solo evita ofrecer algo que la API va a
              rechazar. */}
          <OrderDocuments
            documents={order.documents}
            renderAction={
              canIssueInvoice
                ? (document) => <IssueDocumentButton document={document} orderId={order.id} />
                : undefined
            }
          />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Dirección de envío</h3>
          <ShippingAddress order={order} />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Referencias de Stripe</h3>
          <dl className="space-y-3">
            <StripeReference label="Checkout Session" value={order.stripeCheckoutSessionId} />
            <StripeReference label="Payment Intent" value={order.stripePaymentIntentId} />
          </dl>
        </section>
      </div>

      {showCancel ? (
        <SheetFooter>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Cancelar pedido
          </Button>
          <CancelOrderDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            orderId={order.id}
          />
        </SheetFooter>
      ) : null}
    </>
  );
}

export function AdminOrderDetailSheet({ orderId, onOpenChange }: AdminOrderDetailSheetProps) {
  const query = useAdminOrder(orderId);

  return (
    <Sheet open={orderId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="tabular-nums">
            Pedido {orderId ? formatOrderNumber(orderId) : ''}
          </SheetTitle>
          <SheetDescription>
            {query.data
              ? DATE_TIME_FORMATTER.format(new Date(query.data.data.createdAt))
              : 'Cargando el detalle del pedido…'}
          </SheetDescription>
        </SheetHeader>

        {query.isError ? (
          <div className="flex flex-col items-start gap-3 px-4">
            <p className="text-destructive text-sm">
              {query.error.message}
            </p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : query.data ? (
          <OrderDetailBody
            order={query.data.data}
            canUpdateStatus={query.data.meta.canUpdateStatus}
            canIssueInvoice={query.data.meta.canIssueInvoice}
          />
        ) : (
          <div className="space-y-3 px-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
