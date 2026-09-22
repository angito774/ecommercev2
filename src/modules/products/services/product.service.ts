import { api } from '@/lib/axios';

import type {
  CreateProductValues,
  ProductQueryParams,
  UpdateProductInput,
} from '../schemas/product.schema';
import type { AdminProduct, ProductListResponse } from '../types/product.types';

const BASE_URL = '/admin/products';

// `AdminProduct` y no `Product`: los tres verbos responden la fila **sin**
// `averageCostCents`, porque el handler la pasa por `toAuditableProduct()` (spec 021,
// AC17). Declarar `Product` haría que el tipo del cliente prometiera un campo que el
// JSON no trae.

export async function fetchProducts(params: ProductQueryParams): Promise<ProductListResponse> {
  const { data } = await api.get<ProductListResponse>(BASE_URL, { params });
  return data;
}

export async function createProduct(input: CreateProductValues): Promise<AdminProduct> {
  const { data } = await api.post<AdminProduct>(BASE_URL, input);
  return data;
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<AdminProduct> {
  const { data } = await api.patch<AdminProduct>(`${BASE_URL}/${id}`, input);
  return data;
}

export async function deleteProduct(id: string): Promise<AdminProduct> {
  const { data } = await api.delete<AdminProduct>(`${BASE_URL}/${id}`);
  return data;
}
