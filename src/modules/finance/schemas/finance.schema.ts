import { z } from 'zod';

import { PURCHASE_RECEIPT_TYPES } from '@/lib/purchase-receipts';
import { isFutureReportingDay } from '@/lib/reporting';
import { isValidRuc } from '@/modules/orders/lib/peru-document';

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

// Serie tal y como se imprime: hasta 4 caracteres alfanuméricos en mayúscula (`F001`,
// `E001`, `B002`). No se valida contra ningún padrón: es lo que dice el papel.
const RECEIPT_SERIES_PATTERN = /^[A-Z0-9]{1,4}$/;

// Correlativo como cadena: `00001234` conserva los ceros con los que está impreso (D-14).
const RECEIPT_NUMBER_PATTERN = /^[0-9]{1,20}$/;

// Objeto anidado y no cinco campos planos (D-6): «todo o nada» es representable en el
// tipo, y en el PATCH `receipt: null` significa «quítalo» sin ambigüedad frente a «no lo
// mando».
export const purchaseReceiptSchema = z
  .object({
    type: z.enum(PURCHASE_RECEIPT_TYPES),
    // Dígito verificador por módulo 11, reutilizado del spec 022 (D-11). Comprueba que
    // el número no está tecleado al azar; no comprueba que el proveedor exista.
    supplierRuc: z.string().trim().refine(isValidRuc, 'El RUC del proveedor no es válido'),
    supplierName: z.string().trim().min(3).max(160),
    series: z
      .string()
      .trim()
      .toUpperCase()
      .regex(RECEIPT_SERIES_PATTERN, 'La serie no es válida')
      .optional(),
    number: z
      .string()
      .trim()
      .regex(RECEIPT_NUMBER_PATTERN, 'El número del comprobante no es válido')
      .optional(),
  })
  // Los dos o ninguno: media referencia no identifica el documento (AC12).
  .refine((v) => (v.series === undefined) === (v.number === undefined), {
    message: 'La serie y el número del comprobante van juntos.',
    path: ['number'],
  });

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
  // `null` explícito y `default(null)`: el alta sin comprobante puede omitirlo y el
  // resto del código recibe siempre `PurchaseReceiptInput | null`, nunca `undefined`
  // (AC3).
  //
  // `igvCents` no aparece por ningún lado y eso es la garantía de AC7: Zod descarta lo
  // que no declara, así que no existe un cuerpo capaz de fijar el impuesto.
  receipt: purchaseReceiptSchema.nullable().default(null),
});

// Parcial, como `updateProductSchema`: el PATCH admite cualquier subconjunto. El
// `refine` cierra el cuerpo vacío, que pasaría la validación y dejaría un UPDATE sin
// columnas.
//
// El `receipt` del PATCH se redeclara **sin** el `default(null)` del alta, y no es un
// detalle de estilo: en Zod 4 el `.partial()` envuelve el campo en `optional` pero el
// default sigue rellenando la clave ausente. Heredarlo tal cual haría que omitir
// `receipt` llegara al handler como `receipt: null` —es decir, «bórralo»— y que un
// cuerpo `{}` dejara de ser vacío para el `refine` de abajo. Con esta línea las tres
// semánticas son las tres del tipo: valor (cambiarlo), `null` (quitarlo, AC10) y
// ausente (no tocarlo, AC11).
export const updateExpenseSchema = createExpenseSchema
  .partial()
  .extend({ receipt: purchaseReceiptSchema.nullable().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No hay nada que actualizar.',
  });

export const expenseIdSchema = z.uuid();

export type FinanceRangeParams = z.output<typeof financeRangeSchema>;
export type ExpenseQueryParams = z.output<typeof expenseQuerySchema>;
export type CreateExpenseInput = z.output<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.output<typeof updateExpenseSchema>;
export type PurchaseReceiptInput = z.output<typeof purchaseReceiptSchema>;
