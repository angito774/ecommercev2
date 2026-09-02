'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { categoryKeys } from '../constants';
import type { CategoryQueryParams } from '../schemas/category.schema';
import { fetchCategories } from '../services/category.service';

export function useCategories(params: CategoryQueryParams) {
  return useQuery({
    queryKey: categoryKeys.list(params),
    queryFn: () => fetchCategories(params),
    // Sin esto la tabla se vacía en cada cambio de página o de filtro y la altura
    // salta; con datos previos solo se marca como "fetching".
    placeholderData: keepPreviousData,
  });
}
