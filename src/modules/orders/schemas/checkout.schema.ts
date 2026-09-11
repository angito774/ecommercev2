import { z } from 'zod';

import { MAX_LINE_QUANTITY } from '@/modules/cart/constants';

import { MAX_CHECKOUT_LINES } from '../constants';

export const checkoutLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.int().min(1).max(MAX_LINE_QUANTITY),
});

// No hay ningún campo de precio, nombre, imagen ni total. Es la garantía
// estructural de AC3: el servidor no puede leer un importe del cliente porque el
// contrato no lo transporta. Todo lo demás se relee de `products` (D-9).
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
});

export const checkoutResponseSchema = z.object({ url: z.url() });

export type CheckoutLineInput = z.infer<typeof checkoutLineSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
