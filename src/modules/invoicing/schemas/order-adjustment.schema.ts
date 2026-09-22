import { z } from 'zod';

import { REASONS_BY_INTENT } from '@/lib/electronic-documents';
import { buyerSchema } from '@/modules/orders/schemas/checkout.schema';
import { MAX_PRICE_CENTS, PRICE_INPUT_PATTERN, toCents } from '@/modules/products/lib/price';

const AMOUNT_INTEGER_MESSAGE = 'El importe debe expresarse en céntimos enteros';
const AMOUNT_POSITIVE_MESSAGE = 'El importe debe ser mayor que cero';
const AMOUNT_MAX_MESSAGE = 'El importe supera el máximo admitido';

// Un solo sitio donde se describe «un importe de ajuste»: lo comparten la devolución
// parcial y el cargo adicional, y dos copias serían dos topes que se desalinean.
const amountCentsSchema = z
  .number()
  .int(AMOUNT_INTEGER_MESSAGE)
  .positive(AMOUNT_POSITIVE_MESSAGE)
  .max(MAX_PRICE_CENTS, AMOUNT_MAX_MESSAGE);

/**
 * Unión discriminada y **no** un objeto con todo opcional (D-2): con campos opcionales, un
 * `cargo_adicional` que viajara con `buyer` dentro compilaría y el service tendría que
 * decidir qué ignorar en silencio. Aquí cada intención declara **exactamente** lo que
 * admite, y lo que sobra es un `400` de Zod sin escribir un solo `if` de saneamiento.
 *
 * El `reasonCode` se valida contra el subconjunto de **su** intención y no contra el
 * catálogo entero, así que un motivo de devolución parcial dentro de una anulación total es
 * un `400` y no un documento con un motivo que SUNAT no espera ahí (AC13).
 *
 * `strictObject` y no `object` en cada rama, y es lo que hace cierta la promesa de D-2: por
 * defecto Zod **descarta** las claves que sobran en vez de rechazarlas, así que un
 * `cargo_adicional` con `buyer` dentro pasaría con un `200` y el comprador se quedaría sin
 * saber que su corrección se ignoró en silencio. Con `strict` es un `400` que nombra el
 * campo intruso.
 */
export const orderAdjustmentSchema = z.discriminatedUnion('intent', [
  z.strictObject({
    intent: z.literal('anulacion_total'),
    // Sin `amountCents`: el importe de una anulación total es, por definición, el saldo no
    // reembolsado. Aceptarlo del cliente permitiría «anular totalmente» por menos del
    // total, que es otra operación y ya tiene su propio nombre.
    reasonCode: z.enum(REASONS_BY_INTENT.anulacion_total),
  }),
  z.strictObject({
    intent: z.literal('devolucion_parcial'),
    // El importe **no** se valida aquí contra el saldo disponible: ese saldo vive en otra
    // fila y puede cambiar entre la validación y la escritura. Es un `ValidationError` del
    // service, que `toErrorResponse()` traduce a 400 sin `issues` (mismo criterio que la
    // fecha de pago de nómina, spec 018 D-16).
    amountCents: amountCentsSchema,
    reasonCode: z.enum(REASONS_BY_INTENT.devolucion_parcial),
  }),
  z.strictObject({
    intent: z.literal('correccion_comprador'),
    // El mismo `buyerSchema` del checkout (spec 022, §6.1): la validación del DNI/RUC con
    // su dígito verificador y la regla de la razón social existen una sola vez en el repo.
    buyer: buyerSchema,
    reasonCode: z.enum(REASONS_BY_INTENT.correccion_comprador),
  }),
  z.strictObject({
    intent: z.literal('cargo_adicional'),
    amountCents: amountCentsSchema,
    reasonCode: z.enum(REASONS_BY_INTENT.cargo_adicional),
  }),
]);

export type OrderAdjustmentInput = z.output<typeof orderAdjustmentSchema>;

const AMOUNT_FORMAT_MESSAGE = 'Escribe el importe en soles, con hasta dos decimales.';

/**
 * Schema del **formulario**, que captura el importe como texto igual que el resto del
 * panel. Se declara aparte y no se reutiliza `orderAdjustmentSchema` con un `coerce`,
 * por el mismo reparto que `buyerSchema` / `buyerFormSchema` (spec 022, §6.1): el contrato
 * de la API habla en céntimos enteros y el del diálogo en soles tecleados, y mezclarlos
 * dejaría al formulario admitiendo `1299.999`.
 *
 * La traducción a céntimos ocurre en el `onSubmit`, en el único sitio que conoce las dos
 * representaciones (AC24).
 */
export const adjustmentAmountFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(PRICE_INPUT_PATTERN, AMOUNT_FORMAT_MESSAGE)
    .refine((value) => toCents(value) > 0, AMOUNT_POSITIVE_MESSAGE),
});

export type AdjustmentAmountFormValues = z.output<typeof adjustmentAmountFormSchema>;
