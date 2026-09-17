'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { expenseKeys } from '../constants';
import type { ExpenseQueryParams } from '../schemas/finance.schema';
import { fetchExpenses } from '../services/finance.service';

export function useExpenses(params: ExpenseQueryParams) {
  return useQuery({
    queryKey: expenseKeys.list(params),
    queryFn: () => fetchExpenses(params),
    // Sin esto la tabla se vacía en cada cambio de página o de filtro y la altura
    // salta; con datos previos solo se marca como "fetching".
    placeholderData: keepPreviousData,
  });
}
