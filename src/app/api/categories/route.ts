import { NextResponse } from 'next/server';

import { toErrorResponse } from '@/lib/api-guard';
import { CATALOG_CACHE_CONTROL } from '@/lib/constants';
import type { CatalogCategoryListResponse } from '@/modules/categories/types/catalog-category.types';
import * as categoryRepository from '@/server/repositories/category.repository';

// Endpoint PÚBLICO, como `/api/products`. Sin query params: la lista de categorías
// navegables no admite variantes, así que no hay nada que validar con Zod y no se
// añade un schema vacío por simetría.
export async function GET() {
  try {
    const data = await categoryRepository.findPublicWithCounts();

    const body: CatalogCategoryListResponse = { data };

    return NextResponse.json(body, { headers: { 'Cache-Control': CATALOG_CACHE_CONTROL } });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/categories',
      fallback: 'No se pudieron obtener las categorías',
    });
  }
}
