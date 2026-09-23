'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { accountingKeys } from '../constants';
import type { AccountingQueryParams } from '../schemas/accounting.schema';
import { fetchPurchaseRegistry } from '../services/accounting.service';

// Hook propio y no uno parametrizado por registro: son dos respuestas con dos formas de
// fila distintas, y un genérico obligaría a cada consumidor a estrechar el tipo (SOLID, I).
export function usePurchaseRegistry(params: AccountingQueryParams) {
  return useQuery({
    queryKey: accountingKeys.purchases(params),
    queryFn: () => fetchPurchaseRegistry(params),
    placeholderData: keepPreviousData,
  });
}
