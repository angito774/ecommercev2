import { z } from 'zod';

import { PURCHASE_TRANSACTION_ID, TRANSACTION_TYPE_CODES } from '@/lib/inventory-transactions';
import { isFutureReportingDay } from '@/lib/reporting';
import { MAX_PRICE_CENTS, PRICE_INPUT_PATTERN, toCents } from '@/modules/products/lib/price';

// Tope de cordura: una nota con más de 50 líneas se captura en un ERP, no aquí, y cada
// línea es un UPDATE dentro de la transacción (§10).
export const MAX_DOCUMENT_ITEMS = 50;

export const MAX_ITEM_QUANTITY = 1_000_000;

export const DUPLICATE_ITEM_MESSAGE =
  'Un producto no puede repetirse en el mismo documento';

export const COST_REQUIRED_MESSAGE =
  'Una compra necesita el costo unitario de cada línea';

export const COST_NOT_ALLOWED_MESSAGE =
  'Solo una nota de ingreso por compra registra costo unitario';

export const documentItemSchema = z.object({
  productId: z.uuid('Elige un producto'),
  quantity: z
    .number()
    .int('La cantidad debe ser un número entero')
    .min(1, 'La cantidad debe ser mayor que cero')
    .max(MAX_ITEM_QUANTITY, 'La cantidad supera el máximo admitido'),
  // Opcional en la línea y condicionado en el documento: el tipo de transacción vive
  // en la cabecera, así que la regla es cruzada por naturaleza y no cabe aquí.
  unitCostCents: z
    .number()
    .int('El costo debe expresarse en céntimos enteros')
    .positive('El costo debe ser mayor que cero')
    .max(MAX_PRICE_CENTS, 'El costo supera el máximo admitido')
    .optional(),
});

// El duplicado se rechaza con un mensaje que nombra el problema; el índice único de
// `(document_id, product_id)` es la red que aguanta la concurrencia (AC8).
const hasNoDuplicates = (items: ReadonlyArray<{ productId: string }>): boolean =>
  new Set(items.map((item) => item.productId)).size === items.length;

// El invariante «una compra lleva costo en cada línea, y solo una compra lo lleva» vive
// aquí y en el service, y **no puede ser un `CHECK`** de la base: el tipo de transacción
// está en la cabecera y un `CHECK` de fila no lee otra tabla (spec 021, D-3).
const requiresUnitCost = (transaccionId: string): boolean =>
  transaccionId === PURCHASE_TRANSACTION_ID;

export const createInventoryDocumentSchema = z
  .object({
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
  })
  // `superRefine` y no `refine`: el error tiene que colgar de la línea concreta a la que
  // le falta el costo, para que el formulario lo marque donde se corrige (mismo criterio
  // que el 409 de stock, spec 020 AC5).
  .superRefine((value, ctx) => {
    const requiresCost = requiresUnitCost(value.transaccionId);

    value.items.forEach((item, index) => {
      const hasCost = item.unitCostCents !== undefined;
      if (requiresCost === hasCost) return;

      ctx.addIssue({
        code: 'custom',
        path: ['items', index, 'unitCostCents'],
        message: requiresCost ? COST_REQUIRED_MESSAGE : COST_NOT_ALLOWED_MESSAGE,
      });
    });
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

export const UNIT_COST_INPUT_MESSAGE =
  'Usa un importe mayor que cero, con hasta 2 decimales';

export const inventoryDocumentLineSchema = z.object({
  productId: z.uuid('Elige un producto'),
  quantity: z
    .string()
    .trim()
    .regex(QUANTITY_INPUT_PATTERN, 'Usa un número entero de unidades')
    .refine((value) => Number(value) >= 1, 'La cantidad debe ser mayor que cero'),
  // Cadena vacía mientras no se teclea: el campo solo se exige —y solo se pinta— cuando
  // el tipo es `ingreso_compra` (spec 021, AC28).
  unitCost: z.string().trim(),
});

export const inventoryDocumentFormSchema = z
  .object({
    transaccionId: z.enum(TRANSACTION_TYPE_CODES),
    docDate: z.iso.date('Usa el formato AAAA-MM-DD'),
    reference: z.string().trim().max(120),
    items: z
      .array(inventoryDocumentLineSchema)
      .min(1, 'Añade al menos un producto')
      .max(MAX_DOCUMENT_ITEMS, `Como máximo ${MAX_DOCUMENT_ITEMS} líneas por documento`)
      .refine(hasNoDuplicates, { message: DUPLICATE_ITEM_MESSAGE }),
  })
  // Condicionado al tipo, igual que el schema de la API: con cualquier otro tipo el campo
  // no se pinta y lo que quedara tecleado no viaja en el cuerpo (AC28).
  .superRefine((value, ctx) => {
    if (!requiresUnitCost(value.transaccionId)) return;

    value.items.forEach((item, index) => {
      if (PRICE_INPUT_PATTERN.test(item.unitCost) && toCents(item.unitCost) > 0) return;

      ctx.addIssue({
        code: 'custom',
        path: ['items', index, 'unitCost'],
        message: UNIT_COST_INPUT_MESSAGE,
      });
    });
  });

export type CreateInventoryDocumentInput = z.input<typeof createInventoryDocumentSchema>;
export type CreateInventoryDocumentValues = z.output<typeof createInventoryDocumentSchema>;
export type InventoryDocumentQueryParams = z.output<typeof inventoryDocumentQuerySchema>;
export type InventoryDocumentFormValues = z.output<typeof inventoryDocumentFormSchema>;
export type InventoryDocumentLineValues = z.output<typeof inventoryDocumentLineSchema>;
