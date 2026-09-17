'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { inventoryKeys } from '../constants';
import type { InventoryQueryParams } from '../schemas/inventory.schema';
import { fetchInventory } from '../services/inventory.service';

// Sin `refetchInterval`, a diferencia del dashboard: aquí quien mira está trabajando
// la lista, y una recarga automática que hace saltar filas mientras se decide cuál
// editar molesta más de lo que informa (§10).
export function useInventory(params: InventoryQueryParams) {
  return useQuery({
    queryKey: inventoryKeys.list(params),
    queryFn: () => fetchInventory(params),
    // Sin esto la tabla se vacía en cada cambio de página o de filtro y la altura
    // salta; con datos previos solo se marca como "fetching".
    placeholderData: keepPreviousData,
  });
}
