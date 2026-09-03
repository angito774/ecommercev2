import { api } from '@/lib/axios';

import type { CatalogCategoryListResponse } from '../types/catalog-category.types';

const BASE_URL = '/categories';

export async function fetchCatalogCategories(): Promise<CatalogCategoryListResponse> {
  const { data } = await api.get<CatalogCategoryListResponse>(BASE_URL);
  return data;
}
