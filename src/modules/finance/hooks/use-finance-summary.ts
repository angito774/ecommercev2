'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { financeKeys } from '../constants';
import { fetchFinanceSummary } from '../services/finance.service';
import type { FinanceRange } from '../types/finance.types';

// Sin `refetchInterval`, a diferencia del dashboard (D-20): los gastos los teclea la
// propia persona que mira la pantalla y las ventas del mes no cambian de minuto a
// minuto. Un refresco que mueva las cifras mientras se revisa el detalle molesta más
// de lo que informa.
export function useFinanceSummary(range: FinanceRange) {
  return useQuery({
    queryKey: financeKeys.summary(range),
    queryFn: () => fetchFinanceSummary(range),
    // Sin esto las tarjetas se vacían en cada cambio de rango y la altura salta; con
    // datos previos solo se marca como "fetching" (AC21).
    placeholderData: keepPreviousData,
  });
}
