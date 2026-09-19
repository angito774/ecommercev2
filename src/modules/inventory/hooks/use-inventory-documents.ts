'use client';

import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';

import { inventoryDocumentKeys } from '../constants';
import type { InventoryDocumentQueryParams } from '../schemas/inventory-document.schema';
import {
  fetchInventoryDocument,
  fetchInventoryDocuments,
} from '../services/inventory-document.service';

// Sin `refetchInterval`: es una vista de administración autenticada que se consulta, no
// un panel que vigilar. El refresco lo da la invalidación de la mutación y el retorno a
// la pestaña (§10).
export function useInventoryDocuments(params: InventoryDocumentQueryParams) {
  return useQuery({
    queryKey: inventoryDocumentKeys.list(params),
    queryFn: () => fetchInventoryDocuments(params),
    // Sin esto la tabla se vacía en cada cambio de página o de filtro y la altura salta;
    // con datos previos solo se marca como "fetching".
    placeholderData: keepPreviousData,
  });
}

// `id` nulo mientras el diálogo de detalle está cerrado. `skipToken` en vez de
// `enabled`: deja la consulta igual de inactiva y además estrecha el tipo, así el
// `queryFn` solo existe cuando hay id y no hace falta afirmarle a TypeScript que lo hay.
export function useInventoryDocument(id: string | null) {
  return useQuery({
    queryKey: inventoryDocumentKeys.detail(id ?? ''),
    queryFn: id ? () => fetchInventoryDocument(id) : skipToken,
  });
}
