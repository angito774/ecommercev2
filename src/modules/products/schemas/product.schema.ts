import { z } from 'zod';

import { PRICE_INPUT_PATTERN } from '../lib/price';

export const productSlugSchema = z
  .string()
  .trim()
  .min(2, 'El slug debe tener al menos 2 caracteres')
  .max(180, 'El slug no puede superar 180 caracteres')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones');

export const skuSchema = z
  .string()
  .trim()
  .min(2, 'El SKU debe tener al menos 2 caracteres')
  .max(60, 'El SKU no puede superar 60 caracteres')
  .regex(/^[A-Z0-9][A-Z0-9-]*$/, 'Solo mayúsculas, números y guiones');

// El formulario captura el precio en unidades y lo convierte a céntimos antes de
// enviarlo: la API solo conoce enteros.
const productFields = z.object({
  sku: skuSchema,
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(160, 'El nombre no puede superar 160 caracteres'),
  slug: productSlugSchema,
  description: z
    .string()
    .trim()
    .max(2000, 'La descripción no puede superar 2000 caracteres')
    .nullable(),
  imageUrl: z
    .url('Debe ser una URL válida')
    .max(500, 'La URL no puede superar 500 caracteres')
    .nullable(),
  priceCents: z
    .number()
    .int('El precio debe expresarse en céntimos enteros')
    .min(0, 'El precio no puede ser negativo')
    .max(99_999_999, 'El precio supera el máximo admitido'),
  stock: z
    .number()
    .int('El stock debe ser un número entero')
    .min(0, 'El stock no puede ser negativo')
    .max(1_000_000, 'El stock supera el máximo admitido'),
  specs: z.record(z.string().trim().min(1).max(60), z.string().trim().max(200)).nullable(),
  categoryId: z.uuid('Elige una categoría'),
  isActive: z.boolean(),
});

// Los `default` viven solo aquí: aplicados en los campos base, `.partial()` los
// seguiría inyectando en las claves ausentes de un PATCH y sobrescribiría campos
// que el cliente nunca envió. Es la corrección C2 del spec 001 y no se repite.
export const createProductSchema = productFields.extend({
  description: productFields.shape.description.default(null),
  imageUrl: productFields.shape.imageUrl.default(null),
  specs: productFields.shape.specs.default(null),
  stock: productFields.shape.stock.default(0),
  isActive: productFields.shape.isActive.default(true),
});

export const updateProductSchema = productFields
  .partial()
  .refine((values) => Object.keys(values).length > 0, 'Debe enviar al menos un campo');

export const productQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  categoryId: z.union([z.literal('all'), z.uuid()]).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['name', 'priceCents', 'stock', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const productIdSchema = z.uuid();

// Schema del formulario, distinto del de la API: el precio viaja como texto
// mientras el usuario lo escribe, y `specs` se edita como lista de pares para no
// pedirle JSON a nadie.
export const productFormSchema = productFields.omit({ priceCents: true, specs: true }).extend({
  price: z
    .string()
    .trim()
    .regex(PRICE_INPUT_PATTERN, 'Usa hasta 2 decimales, por ejemplo 1299.90'),
  specs: z
    .array(z.object({ key: z.string().trim().max(60), value: z.string().trim().max(200) }))
    .max(20, 'Como máximo 20 características'),
});

export type CreateProductValues = z.output<typeof createProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type ProductQueryParams = z.output<typeof productQuerySchema>;
export type ProductFormValues = z.output<typeof productFormSchema>;
