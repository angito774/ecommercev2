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
import { formatPrice } from '@/modules/products/lib/price';

import { useVoidPayment } from '../hooks/use-payroll-mutations';
import { formatPeriodLabel } from '../lib/payroll-dates';
import type { PayrollPaymentRow } from '../types/payroll.types';

type VoidPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PayrollPaymentRow | null;
};

export function VoidPaymentDialog({ open, onOpenChange, payment }: VoidPaymentDialogProps) {
  const voidMutation = useVoidPayment();

  async function handleConfirm() {
    if (!payment) return;

    try {
      await voidMutation.mutateAsync(payment.id);
      onOpenChange(false);
    } catch {
      // El toast de error lo emite el hook; el diálogo permanece abierto para reintentar.
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Anular el pago de {payment ? formatPeriodLabel(payment.period) : ''}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {/* Un registro financiero no se borra: se anula y se vuelve a registrar, y
                las dos operaciones quedan en la bitácora (D-7). */}
            El registro de {payment ? formatPrice(payment.amountCents) : ''} a{' '}
            {payment?.employeeFullName} <strong>no se borra</strong>: queda marcado como
            anulado y sigue apareciendo en la lista. Después podrás registrar otro pago
            para ese mismo mes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={voidMutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={voidMutation.isPending}
          >
            {voidMutation.isPending ? 'Anulando…' : 'Anular pago'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
