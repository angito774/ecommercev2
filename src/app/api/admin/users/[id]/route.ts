import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext } from '@/lib/audit';
import { updateUserSchema, userIdSchema } from '@/modules/users/schemas/user.schema';
import * as userAccessService from '@/server/services/user-access.service';

type Context = RouteContext<'/api/admin/users/[id]'>;

const INVALID_ID = 'El identificador del usuario no es válido';

export async function PATCH(request: Request, context: Context) {
  try {
    const { actor, granted } = await authorize('users.update');

    // En Next 16 `params` es una promesa, por eso el await antes de validar.
    const { id } = await context.params;
    const parsedId = userIdSchema.safeParse(id);
    if (!parsedId.success) return badRequest(INVALID_ID);

    const body = await parseJsonBody(request, updateUserSchema, 'Datos del usuario inválidos');
    if (!body.ok) return body.response;

    // El autobloqueo y el guard de roles elevados viven en el servicio, no aquí: la
    // petición se puede forjar desde fuera de la UI.
    const updated = await userAccessService.setUserActive({
      actor,
      granted,
      context: getAuditContext(request),
      userId: parsedId.data,
      isActive: body.data.isActive,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'PATCH /api/admin/users/[id]',
      fallback: 'No se pudo actualizar el acceso del usuario',
    });
  }
}
