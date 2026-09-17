import { api } from '@/lib/axios';

import type { InventoryQueryParams } from '../schemas/inventory.schema';
import type { InventoryListResponse } from '../types/inventory.types';

const BASE_URL = '/admin/inventory';

// Único punto del módulo que habla con la API. Los componentes lo consumen a través
// de `useInventory`, nunca directamente (docs/SETUP.md §4, regla dura 2).
export async function fetchInventory(
  params: InventoryQueryParams,
): Promise<InventoryListResponse> {
  const { data } = await api.get<InventoryListResponse>(BASE_URL, { params });
  return data;
}
