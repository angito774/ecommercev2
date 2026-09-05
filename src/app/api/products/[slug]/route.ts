import { NextResponse } from 'next/server';

import { badRequest, toErrorResponse } from '@/lib/api-guard';
import { CATALOG_CACHE_CONTROL } from '@/lib/constants';
import { catalogSlugParamSchema } from '@/modules/products/schemas/catalog.schema';
import * as productRepository from '@/server/repositories/product.repository';

type Context = RouteContext<'/api/products/[slug]'>;

// El 404 no distingue entre "no existe", "está inactivo" y "su categoría está
// inactiva": los tres son "no publicable" y separarlos convertiría el endpoint en
// un oráculo del catálogo interno (spec 005, §6.2).
const NOT_FOUND = { message: 'Producto no encontrado' };

// Endpoint PÚBLICO, como los dos del catálogo: sin `authorize()` y sin `auth()`.
// La protección no es de acceso sino de proyección — el repositorio devuelve un DTO
// sin `sku`, `stock`, `isActive` ni `categoryId` (AC6).
export async function GET(_request: Request, context: Context) {
  try {
    // En Next 16 `params` es una promesa, por eso el await antes de validar.
    const { slug } = await context.params;

    // Zod antes de tocar la base: un slug con mayúsculas o `../` se rechaza sin
    // llegar a abrir una consulta (AC4).
    const parsed = catalogSlugParamSchema.safeParse(slug);
    if (!parsed.success) {
      return badRequest('El slug del producto no es válido', parsed.error.issues);
    }

    const product = await productRepository.findPublicBySlug(parsed.data);
    if (!product) return NextResponse.json(NOT_FOUND, { status: 404 });

    // Objeto plano, sin envoltorio `{ data }`: es un recurso único y el `{ data,
    // meta }` de la lista existe por la paginación, que aquí no aplica.
    return NextResponse.json(product, {
      headers: { 'Cache-Control': CATALOG_CACHE_CONTROL },
    });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/products/[slug]',
      fallback: 'No se pudo obtener el producto',
    });
  }
}
