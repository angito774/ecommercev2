import { z } from 'zod';

import { PURCHASE_RECEIPT_TYPES } from '@/lib/purchase-receipts';
import { isValidRuc } from '@/modules/orders/lib/peru-document';
import { PRICE_INPUT_PATTERN } from '@/modules/products/lib/price';

import { EXPENSE_CATEGORIES } from './finance.schema';

export const INVALID_RUC_MESSAGE = 'El RUC del proveedor no es válido';

export const SUPPLIER_NAME_MESSAGE = 'Escribe la razón social del proveedor (mínimo 3)';

export const RECEIPT_SERIES_MESSAGE = 'Serie inválida: hasta 4 letras o dígitos';

export const RECEIPT_NUMBER_MESSAGE = 'Número inválido: solo dígitos';

export const RECEIPT_PAIR_MESSAGE = 'La serie y el número van juntos';

const SERIES_PATTERN = /^[A-Za-z0-9]{1,4}$/;

const NUMBER_PATTERN = /^[0-9]{1,20}$/;

const SUPPLIER_NAME_MIN = 3;
const SUPPLIER_NAME_MAX = 160;

// Schema propio del formulario, como en productos: el importe se teclea en soles y
// viaja como cadena hasta `toCents()`, que es aritmética de cadenas sin coma flotante
// (D-19). El schema de la API recibe ya los céntimos enteros.
export const expenseFormSchema = z
  .object({
    concept: z.string().trim().min(3, 'Mínimo 3 caracteres').max(160, 'Máximo 160 caracteres'),
    // Mismo patrón que el precio del producto: hasta 6 enteros y 2 decimales.
    amount: z.string().regex(PRICE_INPUT_PATTERN, 'Importe inválido'),
    category: z.enum(EXPENSE_CATEGORIES),
    incurredOn: z.iso.date('Fecha inválida'),

    // ── Comprobante (spec 024) ─────────────────────────────────────────────
    // Plano y con una bandera, no un objeto anidado: React Hook Form registra campos
    // por nombre y el bloque condicional se monta y desmonta entero. El diálogo es
    // quien arma el `receipt` del cuerpo a partir de estos seis (AC18).
    hasReceipt: z.boolean(),
    receiptType: z.enum(PURCHASE_RECEIPT_TYPES),
    supplierRuc: z.string().trim(),
    supplierName: z.string().trim(),
    receiptSeries: z.string().trim(),
    receiptNumber: z.string().trim(),
  })
  // `superRefine` y no `refine`: cada error tiene que colgar de su campo para que el
  // formulario lo pinte donde está, no en la raíz. Con el interruptor apagado no se
  // valida nada del bloque, porque no se pinta y lo tecleado no viaja (AC18).
  .superRefine((value, ctx) => {
    if (!value.hasReceipt) return;

    if (!isValidRuc(value.supplierRuc)) {
      ctx.addIssue({ code: 'custom', path: ['supplierRuc'], message: INVALID_RUC_MESSAGE });
    }

    const name = value.supplierName;
    if (name.length < SUPPLIER_NAME_MIN || name.length > SUPPLIER_NAME_MAX) {
      ctx.addIssue({ code: 'custom', path: ['supplierName'], message: SUPPLIER_NAME_MESSAGE });
    }

    // Vacío es «no lo tengo», que es legítimo: la serie y el número son opcionales
    // incluso con comprobante. Lo que no cabe es media referencia (AC12).
    const hasSeries = value.receiptSeries !== '';
    const hasNumber = value.receiptNumber !== '';

    if (hasSeries && !SERIES_PATTERN.test(value.receiptSeries)) {
      ctx.addIssue({ code: 'custom', path: ['receiptSeries'], message: RECEIPT_SERIES_MESSAGE });
    }

    if (hasNumber && !NUMBER_PATTERN.test(value.receiptNumber)) {
      ctx.addIssue({ code: 'custom', path: ['receiptNumber'], message: RECEIPT_NUMBER_MESSAGE });
    }

    if (hasSeries !== hasNumber) {
      ctx.addIssue({
        code: 'custom',
        // Cuelga del que falta, que es el que hay que rellenar.
        path: [hasSeries ? 'receiptNumber' : 'receiptSeries'],
        message: RECEIPT_PAIR_MESSAGE,
      });
    }
  });

export type ExpenseFormValues = z.output<typeof expenseFormSchema>;
