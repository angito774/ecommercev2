'use client';

import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';

import { adminOrderKeys } from '../constants';
import type { AdminOrderQueryParams } from '../schemas/admin-order.schema';
import { fetchAdminOrder, fetchAdminOrders } from '../services/admin-order.service';

export function useAdminOrders(params: AdminOrderQueryParams) {
  return useQuery({
    queryKey: adminOrderKeys.list(params),
    queryFn: () => fetchAdminOrders(params),
    // Sin esto la tabla se vacía en cada cambio de página o de filtro y la altura
    // salta; con datos previos solo se marca como "fetching".
    placeholderData: keepPreviousData,
  });
}

// `id` nulo es «no hay ningún sheet abierto», no un error: la consulta se queda
// deshabilitada hasta que se elige un pedido, y así el hook puede vivir en el
// contenedor sin montarse y desmontarse con el sheet.
//
// `skipToken` y no `enabled: id !== null`: hace lo mismo —deshabilita la consulta—
// pero además estrecha el tipo, así que la `queryFn` recibe un `string` sin que
// haga falta castear el `null` que el `enabled` descarta en tiempo de ejecución
// pero no en el de tipos.
export function useAdminOrder(id: string | null) {
  return useQuery({
    queryKey: adminOrderKeys.detail(id ?? ''),
    queryFn: id === null ? skipToken : () => fetchAdminOrder(id),
  });
}
