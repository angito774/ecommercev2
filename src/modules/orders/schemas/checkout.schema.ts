import { z } from 'zod';

import { MAX_LINE_QUANTITY } from '@/modules/cart/constants';

import { MAX_CHECKOUT_LINES } from '../constants';
import {
  documentLength,
  isValidPeruDocument,
  type BuyerDocumentType,
} from '../lib/peru-document';

export const checkoutLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.int().min(1).max(MAX_LINE_QUANTITY),
});

export const BUYER_DOCUMENT_TYPES = ['dni', 'ruc'] as const satisfies readonly BuyerDocumentType[];

export const BUYER_DOCUMENT_LABELS: Record<BuyerDocumentType, string> = {
  dni: 'Boleta (DNI)',
  ruc: 'Factura (RUC)',
};

const DIGITS_ONLY_MESSAGE = 'El documento solo admite dígitos.';

const LEGAL_NAME_REQUIRED_MESSAGE = 'La factura necesita la razón social.';
const LEGAL_NAME_NOT_ALLOWED_MESSAGE = 'La razón social solo se registra en una factura.';

const MAX_LEGAL_NAME_LENGTH = 160;

// AC2 exige que el mensaje **distinga** «longitud» de «número inválido»: no es lo mismo
// que falte un dígito —se sigue tecleando— que haberlos tecleado todos mal —hay que
// mirar el papel—. Por eso son dos ramas y no un texto que las junte.
function documentIssueMessage(type: BuyerDocumentType, value: string): string | null {
  if (isValidPeruDocument(type, value)) return null;

  const expected = documentLength(type);
  const name = type === 'ruc' ? 'RUC' : 'DNI';

  if (value.length !== expected) return `El ${name} son ${expected} dígitos.`;

  return type === 'ruc'
    ? 'Ese RUC no es válido: revisa el número antes de continuar.'
    : 'Ese DNI no es válido.';
}

// Un `superRefine` compartido y no dos copias: el contrato de la API y el del formulario
// solo difieren en **cómo se representa «no hay razón social»** —`undefined` en el JSON,
// cadena vacía en el input— y duplicar la regla dejaría que el formulario admitiera lo
// que la API rechaza, que es la peor forma de descubrirlo (spec 021, §6.1).
//
// Los errores cuelgan del campo concreto para que React Hook Form los pinte donde se
// corrigen, en vez de en la raíz del objeto.
function addBuyerIssues(
  value: { documentType: BuyerDocumentType; documentNumber: string },
  hasLegalName: boolean,
  ctx: z.RefinementCtx,
): void {
  const documentMessage = documentIssueMessage(value.documentType, value.documentNumber);
  if (documentMessage) {
    ctx.addIssue({ code: 'custom', path: ['documentNumber'], message: documentMessage });
  }

  const needsLegalName = value.documentType === 'ruc';
  if (needsLegalName === hasLegalName) return;

  ctx.addIssue({
    code: 'custom',
    path: ['legalName'],
    message: needsLegalName ? LEGAL_NAME_REQUIRED_MESSAGE : LEGAL_NAME_NOT_ALLOWED_MESSAGE,
  });
}

// Contrato de `POST /api/checkout`. `legalName` es `.optional()` y no `.nullable()`: el
// cuerpo lo produce un formulario, y un campo que no se rellena simplemente no viaja.
export const buyerSchema = z
  .object({
    documentType: z.enum(BUYER_DOCUMENT_TYPES),
    documentNumber: z.string().trim().regex(/^\d+$/, DIGITS_ONLY_MESSAGE),
    legalName: z.string().trim().min(2).max(MAX_LEGAL_NAME_LENGTH).optional(),
  })
  .superRefine((value, ctx) => {
    addBuyerIssues(value, value.legalName !== undefined, ctx);
  });

// No hay ningún campo de precio, nombre, imagen ni total. Es la garantía estructural de
// AC3 del spec 007: el servidor no puede leer un importe del cliente porque el contrato no
// lo transporta. Todo lo demás se relee de `products` (spec 007, D-9).
//
// `buyer` es **obligatorio**, no opcional con fallback a boleta anónima (spec 022, D-3):
// SUNAT exige identificar al comprador en una boleta a partir de S/ 700 y el catálogo lo
// supera con holgura. Pedirlo siempre elimina la rama «boleta sin documento», que sería
// justo la que nadie prueba.
export const checkoutSchema = z.object({
  lines: z
    .array(checkoutLineSchema)
    .min(1, 'El carrito está vacío.')
    .max(MAX_CHECKOUT_LINES)
    // Dos líneas del mismo producto pasarían dos veces por la validación de stock
    // comparando cada una contra el total disponible, y la suma podría superarlo.
    .refine(
      (lines) => new Set(lines.map((line) => line.productId)).size === lines.length,
      'Hay productos repetidos en el carrito.',
    ),
  buyer: buyerSchema,
});

// Schema del **formulario**, que captura texto como el resto del panel: `legalName` es
// siempre una cadena y vale `''` cuando no se rellena. El mapeo a `undefined` ocurre al
// construir el cuerpo, en un solo sitio (`toBuyerPayload`).
export const buyerFormSchema = z
  .object({
    documentType: z.enum(BUYER_DOCUMENT_TYPES),
    documentNumber: z.string().trim().regex(/^\d+$/, DIGITS_ONLY_MESSAGE),
    legalName: z.string().trim().max(MAX_LEGAL_NAME_LENGTH),
  })
  .superRefine((value, ctx) => {
    addBuyerIssues(value, value.legalName !== '', ctx);
  });

/**
 * Única traducción de los valores del formulario al cuerpo de la API. Vive junto a los dos
 * schemas porque es la pieza que los reconcilia: sin ella, cada `onSubmit` decidiría por su
 * cuenta si mandar `''`, `null` o nada, y `''` es exactamente lo que el `CHECK
 * orders_buyer_legal_name_requires_ruc` no admite en una boleta.
 */
export function toBuyerPayload(values: BuyerFormValues): BuyerInput {
  return {
    documentType: values.documentType,
    documentNumber: values.documentNumber,
    legalName: values.legalName === '' ? undefined : values.legalName,
  };
}

export const checkoutResponseSchema = z.object({ url: z.url() });

export type CheckoutLineInput = z.infer<typeof checkoutLineSchema>;
export type BuyerInput = z.output<typeof buyerSchema>;
export type BuyerFormValues = z.output<typeof buyerFormSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
