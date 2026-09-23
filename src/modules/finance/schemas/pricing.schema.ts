import { z } from 'zod';

import { MAX_PRICE_CENTS, PRICE_INPUT_PATTERN, toCents } from '@/modules/products/lib/price';

export const pricingQuerySchema = z.object({
  // Sin centinela `all` y sin `categoryId`: el orden es fijo y la única dimensión que
  // filtra es la búsqueda (spec 021, D-14). El escape de comodines lo hace el
  // repositorio, igual que en inventario.
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const setInitialCostSchema = z.object({
  // Entero positivo: el `.int()` rechaza el decimal que produciría un céntimo a medias y
  // el `.positive()` cierra el 0 y los negativos (AC13). El `CHECK` de la base es la
  // segunda barrera, no la primera.
  unitCostCents: z
    .number()
    .int('El costo debe expresarse en céntimos enteros')
    .positive('El costo debe ser mayor que cero')
    .max(MAX_PRICE_CENTS, 'El costo supera el máximo admitido'),
});

// El diálogo teclea soles, como el resto del panel. La conversión a céntimos ocurre en el
// borde del formulario con `toCents`, que es aritmética de cadenas sin coma flotante.
export const initialCostFormSchema = z.object({
  unitCost: z
    .string()
    .trim()
    .regex(PRICE_INPUT_PATTERN, 'Usa hasta 2 decimales, por ejemplo 899.90')
    .refine((value) => toCents(value) > 0, 'El costo debe ser mayor que cero'),
});

export const pricingProductIdSchema = z.uuid();

export type PricingQueryParams = z.output<typeof pricingQuerySchema>;
export type SetInitialCostInput = z.output<typeof setInitialCostSchema>;
export type InitialCostFormValues = z.output<typeof initialCostFormSchema>;
