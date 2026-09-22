'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { pricingKeys } from '../constants';
import type { PricingQueryParams } from '../schemas/pricing.schema';
import { fetchPricing } from '../services/pricing.service';

// Sin `refetchInterval` (D-16): el costo de un producto cambia cuando llega una compra, es
// decir cuando alguien teclea una nota, no de minuto a minuto. El refresco es el de
// TanStack Query al volver a la pestaña, igual que el resto del módulo financiero.
export function usePricing(params: PricingQueryParams) {
  return useQuery({
    queryKey: pricingKeys.list(params),
    queryFn: () => fetchPricing(params),
    // Sin esto la tabla se vacía en cada cambio de página o de búsqueda y la altura
    // salta; con datos previos solo se marca como "fetching". Mismo criterio que
    // `useExpenses`.
    placeholderData: keepPreviousData,
  });
}
