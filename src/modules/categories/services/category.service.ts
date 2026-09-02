import { api } from '@/lib/axios';

import type {
  CategoryQueryParams,
  CreateCategoryValues,
  UpdateCategoryInput,
} from '../schemas/category.schema';
import type { Category, CategoryListResponse } from '../types/category.types';

const BASE_URL = '/admin/categories';

export async function fetchCategories(
  params: CategoryQueryParams,
): Promise<CategoryListResponse> {
  const { data } = await api.get<CategoryListResponse>(BASE_URL, { params });
  return data;
}

export async function createCategory(input: CreateCategoryValues): Promise<Category> {
  const { data } = await api.post<Category>(BASE_URL, input);
  return data;
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const { data } = await api.patch<Category>(`${BASE_URL}/${id}`, input);
  return data;
}

export async function deleteCategory(id: string): Promise<Category> {
  const { data } = await api.delete<Category>(`${BASE_URL}/${id}`);
  return data;
}
