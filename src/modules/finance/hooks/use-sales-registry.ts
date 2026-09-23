'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { accountingKeys } from '../constants';
import type { AccountingQueryParams } from '../schemas/accounting.schema';
import { fetchSalesRegistry } from '../services/accounting.service';

// Sin `refetchInterval`, igual que el resto del módulo financiero: un comprobante se emite
// cuando alguien lo emite, no de minuto a minuto. El refresco es el de TanStack Query al
// volver a la pestaña.
export function useSalesRegistry(params: AccountingQueryParams) {
  return useQuery({
    queryKey: accountingKeys.sales(params),
    queryFn: () => fetchSalesRegistry(params),
    // Sin esto la tabla se vacía en cada cambio de página o de rango y la altura salta;
    // con datos previos solo se marca como "fetching" (AC24).
    placeholderData: keepPreviousData,
  });
}
