import { z } from 'zod';

// El contrato de `GET /api/admin/orders`. `status` es un enum cerrado y no texto
// libre como el de la bitácora: aquí la columna sí es un enum de Postgres, así que
// un valor fuera de la lista no encontraría nada y merece 400 en vez de un listado
// vacío que parece un fallo de datos.
export const adminOrderQuerySchema = z
  .object({
    dateFrom: z.iso.datetime().optional(),
    dateTo: z.iso.datetime().optional(),
    status: z.enum(['all', 'pending', 'paid', 'payment_failed', 'canceled']).default('all'),
    customerSearch: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  // Comparación lexicográfica sobre dos ISO 8601 en UTC: el formato es de ancho
  // fijo, así que el orden de cadena coincide con el cronológico y no hace falta
  // construir dos `Date` para saber que el rango está invertido.
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['dateFrom'],
  });

// Solo `canceled`: el enum completo abriría por la puerta de atrás transiciones que
// este spec no define (D-2). Con el literal, la única transición posible es la
// especificada y el 403/409 no depende de recordar un `if` en el handler.
export const cancelOrderSchema = z.object({ status: z.literal('canceled') });

export const orderIdSchema = z.uuid();

// Forma del jsonb `orders.shipping_address` tal y como lo escribe
// `readShippingAddress()` en `order-fulfillment.service.ts`. Todo es `nullish`
// porque la columna no tiene constraint y su forma la dicta Stripe: se valida para
// poder caer a `null` sin romper, no para garantizar que los campos estén (D-12).
export const shippingAddressSchema = z.object({
  name: z.string().nullish(),
  address: z.object({
    line1: z.string().nullish(),
    line2: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    postal_code: z.string().nullish(),
    country: z.string().nullish(),
  }),
});

export type AdminOrderQueryParams = z.output<typeof adminOrderQuerySchema>;
export type ShippingAddress = z.output<typeof shippingAddressSchema>;
