import { api } from '@/lib/axios';

import type {
  CreateProductValues,
  ProductQueryParams,
  UpdateProductInput,
} from '../schemas/product.schema';
import type { Product, ProductListResponse } from '../types/product.types';

const BASE_URL = '/admin/products';

export async function fetchProducts(params: ProductQueryParams): Promise<ProductListResponse> {
  const { data } = await api.get<ProductListResponse>(BASE_URL, { params });
  return data;
}

export async function createProduct(input: CreateProductValues): Promise<Product> {
  const { data } = await api.post<Product>(BASE_URL, input);
  return data;
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const { data } = await api.patch<Product>(`${BASE_URL}/${id}`, input);
  return data;
}

export async function deleteProduct(id: string): Promise<Product> {
  const { data } = await api.delete<Product>(`${BASE_URL}/${id}`);
  return data;
}
