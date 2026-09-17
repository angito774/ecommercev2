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

import { useDeleteExpense } from '../hooks/use-expense-mutations';
import type { ExpenseRow } from '../types/finance.types';

type DeleteExpenseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseRow | null;
};

export function DeleteExpenseDialog({ open, onOpenChange, expense }: DeleteExpenseDialogProps) {
  const deleteMutation = useDeleteExpense();

  async function handleConfirm() {
    if (!expense) return;

    try {
      await deleteMutation.mutateAsync(expense.id);
      onOpenChange(false);
    } catch {
      // El toast de error lo emite el hook; el diálogo permanece abierto para que se
      // pueda reintentar.
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar “{expense?.concept}”</AlertDialogTitle>
          <AlertDialogDescription>
            {/* El importe se nombra además del concepto: dos facturas del mismo
                proveedor el mismo día son un caso legítimo y el concepto solo no basta
                para saber cuál se está borrando (§5.1). */}
            Se eliminará definitivamente el gasto de{' '}
            {expense ? formatPrice(expense.amountCents) : ''} y el resultado del período se
            recalculará sin él. No se puede deshacer; solo quedará la constancia en la
            bitácora.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Eliminando…' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
