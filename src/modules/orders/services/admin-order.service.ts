import { api } from '@/lib/axios';

import type { AdminOrderQueryParams } from '../schemas/admin-order.schema';
import type {
  AdminOrderDetailResponse,
  AdminOrderListResponse,
  OrderStatusChangeResult,
} from '../types/order.types';

const BASE_URL = '/admin/orders';

export async function fetchAdminOrders(
  params: AdminOrderQueryParams,
): Promise<AdminOrderListResponse> {
  const { data } = await api.get<AdminOrderListResponse>(BASE_URL, { params });
  return data;
}

export async function fetchAdminOrder(id: string): Promise<AdminOrderDetailResponse> {
  const { data } = await api.get<AdminOrderDetailResponse>(`${BASE_URL}/${id}`);
  return data;
}

// El cuerpo es fijo porque la única transición que el panel define es la
// cancelación: el endpoint lo valida con un `literal` y aceptar un parámetro aquí
// sugeriría que hay más destinos posibles (D-2).
export async function cancelOrder(id: string): Promise<OrderStatusChangeResult> {
  const { data } = await api.patch<OrderStatusChangeResult>(`${BASE_URL}/${id}`, {
    status: 'canceled',
  });
  return data;
}
