'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { financeKeys } from '../constants';
import { fetchFinanceTaxes } from '../services/finance.service';
import type { FinanceRange } from '../types/finance.types';

// Sin `refetchInterval`, igual que `useFinanceSummary`: los gastos los teclea la propia
// persona que mira la pantalla y los comprobantes del mes no cambian de minuto a minuto.
// Un refresco que mueva las cifras mientras se prepara una declaración molesta más de lo
// que informa.
export function useFinanceTaxes(range: FinanceRange) {
  return useQuery({
    queryKey: financeKeys.taxes(range),
    queryFn: () => fetchFinanceTaxes(range),
    // Sin esto los bloques se vacían en cada cambio de rango y la altura salta; con datos
    // previos solo se marca como "fetching" (AC23).
    placeholderData: keepPreviousData,
  });
}
