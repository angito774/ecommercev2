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

import { useDeleteProduct } from '../hooks/use-product-mutations';
import type { ProductWithCategory } from '../types/product.types';

type DeleteProductDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithCategory | null;
};

export function DeleteProductDialog({ open, onOpenChange, product }: DeleteProductDialogProps) {
  const deleteMutation = useDeleteProduct();

  async function handleConfirm() {
    if (!product) return;

    try {
      await deleteMutation.mutateAsync(product.id);
      onOpenChange(false);
    } catch {
      // El toast de error lo emite el hook; el diálogo permanece abierto para que
      // se pueda reintentar.
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desactivar “{product?.name}”</AlertDialogTitle>
          <AlertDialogDescription>
            El producto dejará de mostrarse en la tienda, pero no se elimina: conserva su SKU y su
            slug, y puedes reactivarlo desde el formulario de edición.
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
            {deleteMutation.isPending ? 'Desactivando…' : 'Desactivar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
