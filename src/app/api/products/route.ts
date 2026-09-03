import { NextResponse } from 'next/server';

import { badRequest, toErrorResponse } from '@/lib/api-guard';
import { CATALOG_CACHE_CONTROL } from '@/lib/constants';
import { catalogQuerySchema } from '@/modules/products/schemas/catalog.schema';
import type { CatalogProductListResponse } from '@/modules/products/types/catalog.types';
import * as productRepository from '@/server/repositories/product.repository';

// Endpoint PÚBLICO. Sin `authorize()` y sin `auth()`: el catálogo de una tienda es
// lo que cualquiera debe poder leer sin sesión (AC2). La protección aquí no es de
// acceso sino de proyección — el repositorio devuelve un DTO que ya no contiene
// `sku`, `stock`, `specs`, `isActive` ni `categoryId` (AC6, spec 004 D-7).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Se valida antes de tocar la base: un `page=0` o un `sort` inventado se
    // rechaza con 400 sin llegar a abrir una consulta (AC5).
    const parsed = catalogQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const { data, total } = await productRepository.findPublicMany(parsed.data);
    const { page, pageSize } = parsed.data;

    const body: CatalogProductListResponse = {
      data,
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };

    // El handler lee `searchParams`, así que es dinámico por definición y el caché
    // de ruta completa no aplica: la cabecera se pone a mano y se puede comprobar
    // con `curl -I` (spec 004, D-22).
    return NextResponse.json(body, { headers: { 'Cache-Control': CATALOG_CACHE_CONTROL } });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/products',
      fallback: 'No se pudo obtener el catálogo',
    });
  }
}
