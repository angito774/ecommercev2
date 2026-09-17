'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { useCancelOrder } from '../hooks/use-cancel-order';

import { formatOrderNumber } from './order-confirmation';

type CancelOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
};

export function CancelOrderDialog({ open, onOpenChange, orderId }: CancelOrderDialogProps) {
  const cancelMutation = useCancelOrder();

  async function handleConfirm() {
    try {
      await cancelMutation.mutateAsync(orderId);
      onOpenChange(false);
    } catch {
      // El toast de error lo emite el hook; el diálogo permanece abierto para poder
      // reintentar. Un 409 aquí significa que el estado cambió por debajo —el webhook
      // confirmó el pago, u otro administrador se adelantó—, y cerrar escondería el
      // motivo.
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar el pedido {formatOrderNumber(orderId)}</AlertDialogTitle>
          <AlertDialogDescription>
            El pedido quedará como cancelado y dejará de estar pendiente de pago. No se
            devuelve ningún importe porque este pedido nunca llegó a cobrarse, y el stock
            no cambia: un pedido pendiente no descontó inventario.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelMutation.isPending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Sin esto, Radix cierra el diálogo antes de que la mutación resuelva y
              // el error se quedaría sin dónde mostrarse.
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? 'Cancelando…' : 'Cancelar pedido'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
