import { z } from 'zod';

export const categorySlugSchema = z
  .string()
  .trim()
  .min(2, 'El slug debe tener al menos 2 caracteres')
  .max(140, 'El slug no puede superar 140 caracteres')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones');

const categoryFields = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(120, 'El nombre no puede superar 120 caracteres'),
  slug: categorySlugSchema,
  description: z
    .string()
    .trim()
    .max(1000, 'La descripción no puede superar 1000 caracteres')
    .nullable(),
  imageUrl: z
    .url('Debe ser una URL válida')
    .max(500, 'La URL no puede superar 500 caracteres')
    .nullable(),
  isActive: z.boolean(),
});

// Los `default` viven solo aquí: aplicados en los campos base, `.partial()` los
// seguiría inyectando en las claves ausentes de un PATCH y sobrescribiría
// campos que el cliente nunca envió.
export const createCategorySchema = categoryFields.extend({
  description: categoryFields.shape.description.default(null),
  imageUrl: categoryFields.shape.imageUrl.default(null),
  isActive: categoryFields.shape.isActive.default(true),
});

export const updateCategorySchema = categoryFields
  .partial()
  .refine((values) => Object.keys(values).length > 0, 'Debe enviar al menos un campo');

export const categoryQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const categoryIdSchema = z.uuid();

export type CreateCategoryValues = z.output<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
export type CategoryQueryParams = z.output<typeof categoryQuerySchema>;
