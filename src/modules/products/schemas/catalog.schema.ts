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

export type CatalogQueryParams = z.output<typeof catalogQuerySchema>;
export type CatalogQueryInput = z.input<typeof catalogQuerySchema>;
