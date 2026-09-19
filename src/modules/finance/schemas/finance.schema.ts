import { z } from 'zod';

import { isFutureReportingDay } from '@/lib/reporting';

// Origen único de las categorías de gasto: el enum de Postgres las declara para la
// columna y esta tupla para TypeScript y para Zod. Las dos listas tienen que decir lo
// mismo; añadir un valor aquí sin la migración `ALTER TYPE … ADD VALUE` produce un
// 500 al insertar, no un 400 (D-4, §10).
export const EXPENSE_CATEGORIES = [
  'suppliers',
  'logistics',
  'rent',
  'utilities',
  'marketing',
  'software',
  'taxes',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// Tope de cordura, no de negocio: 1 000 000 PEN. Un cero de más al teclear el importe
// es el error frecuente, y sin tope acabaría en el `int4` de la columna (que desborda
// a ~21,4 M PEN) provocando un 500 en vez de un 400.
export const MAX_EXPENSE_AMOUNT_CENTS = 100_000_000;

// Días, no instantes: el rango lo elige una persona en un `<input type="date">` y los
// dos extremos son inclusivos tal y como se leen (AC8). La traducción a instantes
// para `orders.created_at` la hace el servidor (D-8).
const dayKey = z.iso.date();

// Comparación lexicográfica sobre dos `'YYYY-MM-DD'`: el formato es de ancho fijo, así
// que el orden de cadena coincide con el cronológico. Mismo criterio que
// `adminOrderQuerySchema` (spec 014).
const isOrderedRange = (value: { from?: string; to?: string }): boolean =>
  !value.from || !value.to || value.from <= value.to;

// El `path` marca el campo `from` para que el formulario sepa dónde pintar el error.
// Función y no objeto compartido: Zod lo tipa como array mutable y reutilizar la misma
// instancia entre dos schemas dejaría un array compartido al alcance de quien lo mute.
const invertedRangeIssue = () => ({
  message: 'La fecha inicial no puede ser posterior a la final.',
  path: ['from'],
});

export const financeRangeSchema = z
  .object({
    from: dayKey.optional(),
    to: dayKey.optional(),
  })
  .refine(isOrderedRange, invertedRangeIssue());

export const expenseQuerySchema = z
  .object({
    from: dayKey.optional(),
    to: dayKey.optional(),
    // Centinela `all` en vez de omitir: el `Select` de shadcn/Radix no admite un item
    // con `value=""`, y `products` e `inventory` ya usan esta misma forma.
    category: z.union([z.literal('all'), z.enum(EXPENSE_CATEGORIES)]).default('all'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(isOrderedRange, invertedRangeIssue());

export const createExpenseSchema = z.object({
  concept: z.string().trim().min(3).max(160),
  // Entero positivo: el `.int()` rechaza el decimal que produciría un céntimo a
  // medias y el `.positive()` cierra el 0 y los negativos (AC12). El CHECK de la base
  // es la segunda barrera, no la primera.
  amountCents: z.number().int().positive().max(MAX_EXPENSE_AMOUNT_CENTS),
  category: z.enum(EXPENSE_CATEGORIES),
  // No futuro: un gasto con fecha de mañana falsearía el mes en curso (AC13). Se
  // compara contra el día de hoy en Lima, no contra el del servidor en UTC.
  incurredOn: dayKey.refine((day) => !isFutureReportingDay(day, new Date()), {
    message: 'La fecha del gasto no puede ser futura.',
  }),
});

// Parcial, como `updateProductSchema`: el PATCH admite cualquier subconjunto. El
// `refine` cierra el cuerpo vacío, que pasaría la validación y dejaría un UPDATE sin
// columnas.
export const updateExpenseSchema = createExpenseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No hay nada que actualizar.',
  });

export const expenseIdSchema = z.uuid();

export type FinanceRangeParams = z.output<typeof financeRangeSchema>;
export type ExpenseQueryParams = z.output<typeof expenseQuerySchema>;
export type CreateExpenseInput = z.output<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.output<typeof updateExpenseSchema>;
