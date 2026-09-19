import { z } from 'zod';

import { TRANSACTION_TYPE_CODES } from '@/lib/inventory-transactions';
import { isFutureReportingDay } from '@/lib/reporting';

// Tope de cordura: una nota con más de 50 líneas se captura en un ERP, no aquí, y cada
// línea es un UPDATE dentro de la transacción (§10).
export const MAX_DOCUMENT_ITEMS = 50;

export const MAX_ITEM_QUANTITY = 1_000_000;

export const DUPLICATE_ITEM_MESSAGE =
  'Un producto no puede repetirse en el mismo documento';

export const documentItemSchema = z.object({
  productId: z.uuid('Elige un producto'),
  quantity: z
    .number()
    .int('La cantidad debe ser un número entero')
    .min(1, 'La cantidad debe ser mayor que cero')
    .max(MAX_ITEM_QUANTITY, 'La cantidad supera el máximo admitido'),
});

// El duplicado se rechaza con un mensaje que nombra el problema; el índice único de
// `(document_id, product_id)` es la red que aguanta la concurrencia (AC8).
const hasNoDuplicates = (items: ReadonlyArray<{ productId: string }>): boolean =>
  new Set(items.map((item) => item.productId)).size === items.length;

export const createInventoryDocumentSchema = z.object({
  // `z.enum` sobre el catálogo en código: un tipo desconocido es 400 en el borde y no
  // un 500 por violación de clave foránea (AC7). La dirección no viaja en el cuerpo:
  // el servidor la deriva del catálogo (AC15).
  transaccionId: z.enum(TRANSACTION_TYPE_CODES),
  docDate: z.iso
    .date('Usa el formato AAAA-MM-DD')
    // Mismo criterio que `expenses.incurredOn` (spec 017): hoy es el día en Lima, no el
    // del servidor en UTC (AC9).
    .refine((day) => !isFutureReportingDay(day, new Date()), {
      message: 'La fecha del documento no puede ser futura',
    }),
  reference: z.string().trim().max(120).optional(),
  items: z
    .array(documentItemSchema)
    .min(1, 'El documento debe tener al menos una línea')
    .max(MAX_DOCUMENT_ITEMS, `Como máximo ${MAX_DOCUMENT_ITEMS} líneas por documento`)
    .refine(hasNoDuplicates, { message: DUPLICATE_ITEM_MESSAGE }),
});

export const inventoryDocumentQuerySchema = z
  .object({
    // Centinela `all`, como `categoryId` en inventario y `category` en finanzas: el
    // Select de shadcn/Radix no admite un item con valor vacío.
    direction: z.union([z.literal('all'), z.enum(['ingreso', 'salida'])]).default('all'),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  // Comparación lexicográfica de dos `'AAAA-MM-DD'`: el ancho fijo hace que el orden de
  // cadena sea el cronológico. El `path` marca `from`, que es el campo a corregir (AC14).
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['from'],
  });

export const inventoryDocumentIdSchema = z.uuid();

// Schema del formulario, distinto del de la API: la cantidad viaja como texto mientras
// se teclea, igual que `productFormSchema` hace con el precio.
//
// La línea guarda **solo** lo que el cuerpo necesita. El nombre, el SKU y el stock del
// producto son datos de presentación y viven en el estado del diálogo, no en el
// formulario: meterlos aquí obligaría a arrastrarlos por inputs ocultos para que
// sobrevivieran al envío.
export const QUANTITY_INPUT_PATTERN = /^\d{1,7}$/;

export const inventoryDocumentLineSchema = z.object({
  productId: z.uuid('Elige un producto'),
  quantity: z
    .string()
    .trim()
    .regex(QUANTITY_INPUT_PATTERN, 'Usa un número entero de unidades')
    .refine((value) => Number(value) >= 1, 'La cantidad debe ser mayor que cero'),
});

export const inventoryDocumentFormSchema = z.object({
  transaccionId: z.enum(TRANSACTION_TYPE_CODES),
  docDate: z.iso.date('Usa el formato AAAA-MM-DD'),
  reference: z.string().trim().max(120),
  items: z
    .array(inventoryDocumentLineSchema)
    .min(1, 'Añade al menos un producto')
    .max(MAX_DOCUMENT_ITEMS, `Como máximo ${MAX_DOCUMENT_ITEMS} líneas por documento`)
    .refine(hasNoDuplicates, { message: DUPLICATE_ITEM_MESSAGE }),
});

export type CreateInventoryDocumentInput = z.input<typeof createInventoryDocumentSchema>;
export type CreateInventoryDocumentValues = z.output<typeof createInventoryDocumentSchema>;
export type InventoryDocumentQueryParams = z.output<typeof inventoryDocumentQuerySchema>;
export type InventoryDocumentFormValues = z.output<typeof inventoryDocumentFormSchema>;
export type InventoryDocumentLineValues = z.output<typeof inventoryDocumentLineSchema>;
