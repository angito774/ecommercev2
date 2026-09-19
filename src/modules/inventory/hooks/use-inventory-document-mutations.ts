'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { productKeys } from '@/modules/products/constants';

import { DIRECTION_NOTE_LABELS, inventoryDocumentKeys, inventoryKeys } from '../constants';
import type { CreateInventoryDocumentInput } from '../schemas/inventory-document.schema';
import { createInventoryDocument } from '../services/inventory-document.service';

// Tres invalidaciones y no una (AC16): el documento mueve stock, y ese stock lo leen las
// tres vistas —el listado de movimientos, la tabla de alertas de la otra pestaña y el
// CRUD de productos—. Refrescar solo la primera dejaría las alertas mintiendo hasta la
// siguiente recarga.
export function useCreateInventoryDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateInventoryDocumentInput) => createInventoryDocument(input),
    onSuccess: async (document) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryDocumentKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
      ]);

      toast.success(
        `${DIRECTION_NOTE_LABELS[document.direction]} n.º ${document.docNumber} registrada`,
      );
    },
  });
}
