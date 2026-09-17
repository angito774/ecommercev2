'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { inventoryKeys } from '@/modules/inventory/constants';

import { productKeys } from '../constants';
import type { CreateProductValues, UpdateProductInput } from '../schemas/product.schema';
import { createProduct, deleteProduct, updateProduct } from '../services/product.service';

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductValues) => createProduct(input),
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      toast.success(`Producto "${product.name}" creado`);
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      updateProduct(id, input),
    onSuccess: async (product) => {
      // También el inventario: esta mutación es la única escritora de stock y es
      // quien sabe que acaba de cambiarlo. Hacerlo al cerrar el diálogo lo ataría a
      // un gesto de UI y fallaría si se cierra con Escape tras guardar (D-10, AC14).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() }),
      ]);
      toast.success(`Producto "${product.name}" actualizado`);
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      toast.success(`Producto "${product.name}" desactivado`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
