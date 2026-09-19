import { api } from '@/lib/axios';

import type {
  CreateInventoryDocumentInput,
  InventoryDocumentQueryParams,
} from '../schemas/inventory-document.schema';
import type {
  InventoryDocumentDetail,
  InventoryDocumentListResponse,
} from '../types/inventory-document.types';

const BASE_URL = '/admin/inventory/documents';

// Único punto del módulo que habla con la API de documentos. Los componentes lo consumen
// a través de sus hooks, nunca directamente (docs/SETUP.md §4, regla dura 2).
export async function fetchInventoryDocuments(
  params: InventoryDocumentQueryParams,
): Promise<InventoryDocumentListResponse> {
  const { data } = await api.get<InventoryDocumentListResponse>(BASE_URL, { params });
  return data;
}

export async function fetchInventoryDocument(id: string): Promise<InventoryDocumentDetail> {
  const { data } = await api.get<InventoryDocumentDetail>(`${BASE_URL}/${id}`);
  return data;
}

export async function createInventoryDocument(
  input: CreateInventoryDocumentInput,
): Promise<InventoryDocumentDetail> {
  const { data } = await api.post<InventoryDocumentDetail>(BASE_URL, input);
  return data;
}
