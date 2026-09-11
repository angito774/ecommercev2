import { z } from 'zod';

// Es **nuestro** uuid, nunca un `pm_…`: el cliente jamás envía un identificador de
// Stripe, así que no puede pedir el `detach` de una tarjeta ajena (D-13). Validarlo
// antes de tocar la base convierte un id malformado en un 400 del cliente y no en
// un 500 de Postgres al castear la cadena a uuid (AC10).
export const paymentMethodIdParamSchema = z.uuid();

// `POST /api/payment-methods/setup` no tiene cuerpo: todo lo que el servidor
// necesita —quién es y qué Customer le corresponde— sale de la sesión. No hay nada
// que validar porque no hay nada que el servidor lea del cliente.
