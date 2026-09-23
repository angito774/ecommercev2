import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext } from '@/lib/audit';
import { can } from '@/lib/permissions';
import {
  ADJUST_FAILED_FALLBACK_MESSAGE,
  INVALID_ADJUSTMENT_MESSAGE,
} from '@/modules/invoicing/constants';
import { orderAdjustmentSchema } from '@/modules/invoicing/schemas/order-adjustment.schema';
import { orderIdSchema } from '@/modules/orders/schemas/admin-order.schema';
import { adjustOrder } from '@/server/services/order-adjustment.service';

type Context = RouteContext<'/api/admin/orders/[id]/adjust'>;

const INVALID_ID = 'El identificador del pedido no es válido';

/**
 * `POST` y no `PATCH`: no se edita un campo del pedido, se **registra un hecho** —una
 * devolución con su documento— y la operación no es idempotente por repetición. `200` y no
 * `201`: el recurso creado no es direccionable por sí mismo; lo que devuelve la respuesta es
 * el pedido con su árbol de documentos (§6).
 *
 * **No emite nada.** El documento de corrección nace `pending` y se emite con
 * `POST /api/admin/invoicing/documents/[id]/issue`, el handler del spec 022, sin un solo
 * cambio: hay un único camino de emisión en todo el sistema (D-13, AC23).
 */
export async function POST(request: Request, context: Context) {
  try {
    // Mismo preámbulo que el resto de /api/admin: la verificación corre **dentro del
    // recurso** (CLAUDE.md regla 8), nunca en `proxy.ts`, y nunca `auth.protect()`, que en
    // un Route Handler redirige con 307 al login y dejaría a axios leyendo HTML (AC1).
    //
    // Va **antes** de leer el cuerpo, que es lo que AC2 exige: un usuario sin
    // `orders.refund` recibe 403 aunque su cuerpo fuera inválido, en vez de poder enumerar
    // el contrato de la API a base de 400.
    const { actor, granted } = await authorize('orders.refund');

    // En Next 16 `params` es una promesa, por eso el await antes de validar.
    const { id } = await context.params;
    const parsedId = orderIdSchema.safeParse(id);
    if (!parsedId.success) return badRequest(INVALID_ID);

    const body = await parseJsonBody(request, orderAdjustmentSchema, INVALID_ADJUSTMENT_MESSAGE);
    if (!body.ok) return body.response;

    // Sin un solo `if` de traducción: el service lanza `NotFoundError` (404),
    // `ConflictError` (409), `ValidationError` (400) y `UpstreamError` (502), y
    // `toErrorResponse()` los mapea igual que en el resto de la API de admin.
    const result = await adjustOrder(
      actor,
      parsedId.data,
      body.data,
      getAuditContext(request),
      // El enlace al PDF depende de `invoicing.issue` y no de `orders.refund`: se resuelve
      // aquí, sobre el set efectivo, y no dentro del service (spec 022, D-19).
      { includePdfUrl: can(granted, 'invoicing.issue') },
    );

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/admin/orders/[id]/adjust',
      fallback: ADJUST_FAILED_FALLBACK_MESSAGE,
    });
  }
}
