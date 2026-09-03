'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { productKeys } from '../constants';
import type { ProductQueryParams } from '../schemas/product.schema';
import { fetchProducts } from '../services/product.service';

export function useProducts(params: ProductQueryParams) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => fetchProducts(params),
    // Sin esto la tabla se vacía en cada cambio de página o de filtro y la altura
    // salta; con datos previos solo se marca como "fetching".
    placeholderData: keepPreviousData,
  });
}
