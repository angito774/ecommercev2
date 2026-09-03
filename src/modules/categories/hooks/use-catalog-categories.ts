'use client';

import { useQuery } from '@tanstack/react-query';

import { CATALOG_STALE_TIME_MS } from '@/modules/products/constants';

import { catalogCategoryKeys } from '../constants';
import { fetchCatalogCategories } from '../services/catalog-category.service';
import type { CatalogCategoryListResponse } from '../types/catalog-category.types';

type UseCatalogCategoriesOptions = {
  initialData?: CatalogCategoryListResponse;
};

export function useCatalogCategories({ initialData }: UseCatalogCategoriesOptions = {}) {
  return useQuery({
    queryKey: catalogCategoryKeys.list(),
    queryFn: fetchCatalogCategories,
    initialData,
    staleTime: CATALOG_STALE_TIME_MS,
  });
}
