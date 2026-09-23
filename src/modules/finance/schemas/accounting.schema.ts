import { z } from 'zod';

import { dayKey, invertedRangeIssue, isOrderedRange } from './finance.schema';

// Archivo propio y no un apéndice de `finance.schema.ts`: aquel declara el rango del
// resumen y todo el alta y edición de gastos, y esto es la query de dos listados de solo
// lectura. Las tres piezas del rango se **importan** de allí, que es su tercer consumidor
// y el umbral de extracción de CLAUDE.md §6.
//
// Sin `category`, sin `search` y sin `sortBy`: el rango es el único filtro de esta
// pantalla (§3), y la firma es lo que lo hace cumplir.
export const accountingQuerySchema = z
  .object({
    from: dayKey.optional(),
    to: dayKey.optional(),
    page: z.coerce.number().int().min(1).default(1),
    // Mismo tope que `expenseQuerySchema`: la vía para llevarse el rango entero es la
    // exportación, no un `?pageSize=100000` que traiga la tabla en un JSON.
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(isOrderedRange, invertedRangeIssue());

export type AccountingQueryParams = z.output<typeof accountingQuerySchema>;
