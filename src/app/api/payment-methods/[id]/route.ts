import { NextResponse } from 'next/server';

import { badRequest, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext } from '@/lib/audit';
import { requireActiveUser } from '@/lib/auth';
import { INVALID_CARD_ID_MESSAGE } from '@/modules/payments/constants';
import { paymentMethodIdParamSchema } from '@/modules/payments/schemas/payment-method.schema';
import type { DeleteSavedCardResponse } from '@/modules/payments/types/payment-method.types';
import { deleteSavedCard } from '@/server/services/payment-method.service';

type Context = RouteContext<'/api/payment-methods/[id]'>;

// Mismo preámbulo que los otros dos: sin permiso RBAC, con `requireActiveUser()` y
// con la propiedad de la fila como autorización real (D-4). Los seis status del mapa
// de §6 salen de `toErrorResponse()` sin un solo `if` aquí: el servicio lanza
// `NotFoundError` o `UpstreamError` y la traducción vive en un único sitio.
export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireActiveUser();

    // En Next 16 `params` es una promesa, por eso el await antes de validar. Un id
    // malformado es un 400 del cliente, no un 500 de Postgres (AC10).
    const { id } = await context.params;
    const parsed = paymentMethodIdParamSchema.safeParse(id);
    if (!parsed.success) return badRequest(INVALID_CARD_ID_MESSAGE, parsed.error.issues);

    const deletedId = await deleteSavedCard(user, parsed.data, getAuditContext(request));

    const body: DeleteSavedCardResponse = { id: deletedId };
    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'DELETE /api/payment-methods/[id]',
      fallback: 'No se pudo eliminar la tarjeta',
    });
  }
}
