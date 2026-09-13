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

import { useDeleteSavedCard } from '../hooks/use-delete-saved-card';
import { cardBrandLabel } from '../lib/card-display';
import type { SavedCard } from '../types/payment-method.types';

type DeleteCardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: SavedCard | null;
  /** Se avisa solo de la baja confirmada; qué hacer con ella lo decide la sección. */
  onDeleted: () => void;
};

export function DeleteCardDialog({
  open,
  onOpenChange,
  card,
  onDeleted,
}: DeleteCardDialogProps) {
  const deleteMutation = useDeleteSavedCard();

  async function handleConfirm() {
    if (!card) return;

    try {
      await deleteMutation.mutateAsync(card.id);
      onDeleted();
      onOpenChange(false);
    } catch {
      // El toast de error lo emite el hook; el diálogo permanece abierto para que se
      // pueda reintentar (AC12).
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {/* Nombrada por marca y últimos cuatro dígitos: es lo único con lo que el
                cliente puede comprobar que va a borrar la que cree. */}
            Eliminar la tarjeta {card ? cardBrandLabel(card.brand) : ''} •••• {card?.last4}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Se desvincula de Stripe de forma definitiva: no se puede recuperar ni volver a
            usar, y tendrás que registrarla otra vez si la necesitas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* `h-11` es el mínimo táctil de 44 px que pide AC19: el `size` por defecto
              de shadcn deja los botones en 32 px. */}
          <AlertDialogCancel className="h-11 rounded-full px-5" disabled={deleteMutation.isPending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            className="h-11 rounded-full px-5"
            onClick={(event) => {
              // Sin esto el AlertDialog se cierra al pulsar y el error de Stripe no
              // tendría dónde mostrarse para reintentar.
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
