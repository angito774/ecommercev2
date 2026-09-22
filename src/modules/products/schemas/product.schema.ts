import { z } from 'zod';

import { MAX_PRICE_CENTS, PRICE_INPUT_PATTERN, toCents } from '../lib/price';

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
    .max(MAX_PRICE_CENTS, 'El precio supera el máximo admitido'),
  // `null` no es "cero": significa que el producto no tiene precio anterior y por
  // tanto no lleva ni precio tachado ni badge de descuento (spec 004, §5.1).
  compareAtPriceCents: z
    .number()
    .int('El precio anterior debe expresarse en céntimos enteros')
    .min(0, 'El precio anterior no puede ser negativo')
    .max(MAX_PRICE_CENTS, 'El precio anterior supera el máximo admitido')
    .nullable(),
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
// Un precio anterior que no supera al actual daría un descuento de 0 % o negativo.
// La comprobación vive aquí y no solo en el formulario: `productFormSchema` corre en
// el navegador y cualquiera puede saltárselo hablando directamente con la API. El
// mensaje se comparte con el PATCH para no tener dos redacciones del mismo error.
export const COMPARE_AT_PRICE_MESSAGE =
  'El precio anterior debe ser mayor que el precio actual';

export function isValidComparePrice(
  priceCents: number,
  compareAtPriceCents: number | null | undefined,
): boolean {
  return (
    compareAtPriceCents === null ||
    compareAtPriceCents === undefined ||
    compareAtPriceCents > priceCents
  );
}

export const createProductSchema = productFields
  .extend({
    description: productFields.shape.description.default(null),
    imageUrl: productFields.shape.imageUrl.default(null),
    compareAtPriceCents: productFields.shape.compareAtPriceCents.default(null),
    specs: productFields.shape.specs.default(null),
    stock: productFields.shape.stock.default(0),
    isActive: productFields.shape.isActive.default(true),
  })
  .refine((values) => isValidComparePrice(values.priceCents, values.compareAtPriceCents), {
    message: COMPARE_AT_PRICE_MESSAGE,
    path: ['compareAtPriceCents'],
  });

// Sin `.refine()` de precio: es un PATCH parcial y un cuerpo que solo trae
// `compareAtPriceCents` no conoce el `priceCents` con el que hay que compararlo. La
// comprobación cruzada la hace el handler contra la fila ya combinada, dentro de la
// transacción y con el estado real de la tabla.
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
export const productFormSchema = productFields
  .omit({ priceCents: true, compareAtPriceCents: true, specs: true })
  .extend({
    price: z
      .string()
      .trim()
      .regex(PRICE_INPUT_PATTERN, 'Usa hasta 2 decimales, por ejemplo 1299.90'),
    // Vacío es `null`, no `"0"`: dejar el campo en blanco significa "sin oferta".
    compareAtPrice: z
      .string()
      .trim()
      .regex(PRICE_INPUT_PATTERN, 'Usa hasta 2 decimales, por ejemplo 1499.00')
      .nullable(),
    specs: z
      .array(z.object({ key: z.string().trim().max(60), value: z.string().trim().max(200) }))
      .max(20, 'Como máximo 20 características'),
  })
  // Mismo invariante que `createProductSchema`, reutilizando su predicado y su
  // mensaje: aquí solo cambia que los precios llegan como texto. El formulario lo
  // comprueba para dar el error junto al campo, no como frontera de seguridad —esa
  // es la del schema de la API.
  .refine(
    (values) =>
      values.compareAtPrice === null ||
      !PRICE_INPUT_PATTERN.test(values.price) ||
      isValidComparePrice(toCents(values.price), toCents(values.compareAtPrice)),
    { message: COMPARE_AT_PRICE_MESSAGE, path: ['compareAtPrice'] },
  );

export type CreateProductValues = z.output<typeof createProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type ProductQueryParams = z.output<typeof productQuerySchema>;
export type ProductFormValues = z.output<typeof productFormSchema>;
