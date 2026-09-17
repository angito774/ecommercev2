import { z } from 'zod';

import { PRICE_INPUT_PATTERN } from '@/modules/products/lib/price';

// Mismo criterio que `skuSchema`: lo teclea una persona, así que se normaliza el
// formato en vez de aceptar cualquier cadena.
export const employeeCodeSchema = z
  .string()
  .trim()
  .min(2, 'El código debe tener al menos 2 caracteres')
  .max(30, 'El código no puede superar 30 caracteres')
  .regex(/^[A-Z0-9][A-Z0-9-]*$/, 'Solo mayúsculas, números y guiones');

const employeeFields = z.object({
  employeeCode: employeeCodeSchema,
  firstName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  lastName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  jobTitle: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  // 'AAAA-MM-DD'. `z.iso.date()` y no `z.coerce.date()`: la columna es `date` en modo
  // string y así el valor no pasa nunca por un `Date` con huso (D-11).
  hiredAt: z.iso.date('Usa el formato AAAA-MM-DD'),
  baseSalaryCents: z
    .number()
    .int('El salario debe expresarse en céntimos enteros')
    .min(1, 'El salario debe ser mayor que cero')
    .max(99_999_999, 'El salario supera el máximo admitido'),
  isActive: z.boolean(),
});

export const createEmployeeSchema = employeeFields.extend({
  isActive: employeeFields.shape.isActive.default(true),
});

// Los `default` viven solo en el schema de alta: aplicados en los campos base,
// `.partial()` los seguiría inyectando en las claves ausentes de un PATCH (misma
// corrección que el spec 001, C2).
export const updateEmployeeSchema = employeeFields
  .partial()
  .refine((values) => Object.keys(values).length > 0, 'Debe enviar al menos un campo');

export const employeeIdSchema = z.uuid();

export const employeeQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  // Default `active` y no `all` como en productos: un ex empleado no forma parte de
  // la planilla de hoy y se acumula para siempre (D-14).
  status: z.enum(['all', 'active', 'inactive']).default('active'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Schema del formulario, distinto del de la API: el salario viaja como texto mientras
// se escribe. Mismo patrón y mismo `PRICE_INPUT_PATTERN` que el de producto, para que
// 2500.5 no se convierta en 250049.99… (spec 003).
export const employeeFormSchema = employeeFields.omit({ baseSalaryCents: true }).extend({
  baseSalary: z
    .string()
    .trim()
    .regex(PRICE_INPUT_PATTERN, 'Usa hasta 2 decimales, por ejemplo 2500.00'),
});

// `Input` es lo que viaja por la red, con los `default` todavía sin aplicar; `Values`
// es lo que el repositorio recibe ya normalizado. La misma pareja de nombres que usa
// `product.schema.ts`: el cliente tipa con `Input`, el servidor con `Values`.
export type CreateEmployeeInput = z.input<typeof createEmployeeSchema>;
export type CreateEmployeeValues = z.output<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.input<typeof updateEmployeeSchema>;
export type UpdateEmployeeValues = z.output<typeof updateEmployeeSchema>;
export type EmployeeQueryParams = z.output<typeof employeeQuerySchema>;
export type EmployeeFormValues = z.output<typeof employeeFormSchema>;
