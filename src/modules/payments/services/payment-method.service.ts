import { api } from '@/lib/axios';

import type {
  CardSetupResponse,
  DeleteSavedCardResponse,
  SavedCardListResponse,
} from '../types/payment-method.types';

// Único punto donde el módulo habla con la API. Ningún componente llama a axios
// directo: se consume por sus hooks (docs/SETUP.md §4, regla 2).
export async function fetchSavedCards(): Promise<SavedCardListResponse> {
  const { data } = await api.get<SavedCardListResponse>('/payment-methods');
  return data;
}

// Sin cuerpo: el endpoint no lee nada del cliente, todo sale de la sesión.
export async function createCardSetup(): Promise<CardSetupResponse> {
  const { data } = await api.post<CardSetupResponse>('/payment-methods/setup');
  return data;
}

// El `id` es nuestro uuid, nunca un `pm_…` (D-13).
export async function deleteSavedCard(id: string): Promise<DeleteSavedCardResponse> {
  const { data } = await api.delete<DeleteSavedCardResponse>(`/payment-methods/${id}`);
  return data;
}
