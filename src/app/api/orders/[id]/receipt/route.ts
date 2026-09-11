import { NextResponse } from 'next/server';

import { badRequest, toErrorResponse } from '@/lib/api-guard';
import { requireActiveUser } from '@/lib/auth';
import { orderIdParamSchema } from '@/modules/orders/schemas/order-history.schema';
import type { OrderReceiptResponse } from '@/modules/orders/types/order.types';
import { getReceiptUrl } from '@/server/services/order-receipt.service';

type Context = RouteContext<'/api/orders/[id]/receipt'>;

const INVALID_ID_MESSAGE = 'El identificador del pedido no es válido';

// Mismo preámbulo que `GET /api/orders`: sin permiso RBAC, con `requireActiveUser()`
// y con la propiedad del pedido como autorización real. Los siete status del mapa
// de §6 salen de `toErrorResponse()` sin un solo `if` aquí: el servicio lanza
// `NotFoundError`, `ConflictError` o `UpstreamError` y la traducción vive en un
// único sitio.
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireActiveUser();

    // En Next 16 `params` es una promesa, por eso el await antes de validar.
    const { id } = await context.params;
    const parsed = orderIdParamSchema.safeParse(id);
    if (!parsed.success) return badRequest(INVALID_ID_MESSAGE, parsed.error.issues);

    const url = await getReceiptUrl(user, parsed.data);

    const body: OrderReceiptResponse = { url };
    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/orders/[id]/receipt',
      fallback: 'No se pudo obtener la boleta del pedido',
    });
  }
}
