import { z } from 'zod';

// Dos instantes absolutos, no «mes actual» ni «últimos 30 días»: el rango lo
// resuelve el navegador con su propia zona horaria y el servidor solo recibe el
// resultado (D-7). Así el contrato tiene una sola forma y no hay que fijar una
// zona en el servidor para interpretarlo.
//
// Ambos opcionales: sin ninguno la consulta devuelve el historial completo,
// acotado por `MAX_ORDER_HISTORY`. El cliente siempre manda los dos.
export const orderHistoryQuerySchema = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  // El 400 de AC6. La UI ya lo señala en línea y no dispara la consulta, pero un
  // rango invertido que llegue igualmente no debe devolver una lista vacía como
  // si fuera un resultado legítimo.
  .refine((v) => !v.from || !v.to || new Date(v.from) <= new Date(v.to), {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['from'],
  });

export type OrderHistoryQueryParams = z.output<typeof orderHistoryQuerySchema>;

// Un id malformado es un 400 del cliente, no un 500 de Postgres al intentar
// castear la cadena a uuid.
export const orderIdParamSchema = z.uuid();
