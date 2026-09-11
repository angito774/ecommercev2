'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { ORDER_HISTORY_STALE_TIME_MS, orderKeys } from '../constants';
import { fetchOrderHistory } from '../services/order.service';
import type { OrderHistoryRange } from '../types/order.types';

export function useOrderHistory(range: OrderHistoryRange) {
  return useQuery({
    queryKey: orderKeys.history(range),
    queryFn: () => fetchOrderHistory(range),
    staleTime: ORDER_HISTORY_STALE_TIME_MS,
    // Sin esto la lista se vacía en cada cambio de filtro y la sección colapsa de
    // golpe; con los datos previos solo se marca como `isFetching` (AC15).
    placeholderData: keepPreviousData,
  });
}
