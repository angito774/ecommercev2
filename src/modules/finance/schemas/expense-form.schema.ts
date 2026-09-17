import { z } from 'zod';

import { PRICE_INPUT_PATTERN } from '@/modules/products/lib/price';

import { EXPENSE_CATEGORIES } from './finance.schema';

// Schema propio del formulario, como en productos: el importe se teclea en soles y
// viaja como cadena hasta `toCents()`, que es aritmética de cadenas sin coma flotante
// (D-19). El schema de la API recibe ya los céntimos enteros.
export const expenseFormSchema = z.object({
  concept: z.string().trim().min(3, 'Mínimo 3 caracteres').max(160, 'Máximo 160 caracteres'),
  // Mismo patrón que el precio del producto: hasta 6 enteros y 2 decimales.
  amount: z.string().regex(PRICE_INPUT_PATTERN, 'Importe inválido'),
  category: z.enum(EXPENSE_CATEGORIES),
  incurredOn: z.iso.date('Fecha inválida'),
});

export type ExpenseFormValues = z.output<typeof expenseFormSchema>;
