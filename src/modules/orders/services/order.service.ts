import { api } from '@/lib/axios';

import type {
  OrderHistoryRange,
  OrderHistoryResponse,
  OrderReceiptResponse,
} from '../types/order.types';

// Único punto donde el historial habla con la API. Ningún componente llama a
// axios directo: se consume por sus hooks (docs/SETUP.md §4, regla 2).
export async function fetchOrderHistory(
  range: OrderHistoryRange,
): Promise<OrderHistoryResponse> {
  const { data } = await api.get<OrderHistoryResponse>('/orders', { params: range });
  return data;
}

export async function fetchOrderReceipt(orderId: string): Promise<OrderReceiptResponse> {
  const { data } = await api.get<OrderReceiptResponse>(`/orders/${orderId}/receipt`);
  return data;
}
