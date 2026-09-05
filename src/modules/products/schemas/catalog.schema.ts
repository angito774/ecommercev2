import { z } from 'zod';

import { productSlugSchema } from './product.schema';

// El slug de categoría reutiliza el patrón del de producto en vez de declarar otra
// expresión regular: son la misma forma de identificador y dos copias divergen.
const categorySlugSchema = productSlugSchema.max(140);

// Contrato de `GET /api/products`. Los cuatro órdenes y el tamaño máximo de página
// son cerrados: nada que venga de la URL puede llegar al ORDER BY ni pedir una
// página de 10 000 filas.
export const catalogQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  category: z.union([z.literal('all'), categorySlugSchema]).default('all'),
  sort: z.enum(['featured', 'newest', 'price_asc', 'price_desc']).default('featured'),
  discounted: z.stringbool().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

// Parámetro de ruta de `GET /api/products/[slug]`. Reutiliza el patrón del slug de
// producto (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, 2–180) en vez de escribir otra expresión
// regular: eso rechaza mayúsculas, espacios, `%`, `_` y `../` antes de que exista
// una consulta (AC4).
export const catalogSlugParamSchema = productSlugSchema;

export type CatalogQueryParams = z.output<typeof catalogQuerySchema>;
export type CatalogQueryInput = z.input<typeof catalogQuerySchema>;
