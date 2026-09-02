import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext } from '@/lib/audit';
import { assignRolesSchema, userIdSchema } from '@/modules/users/schemas/user.schema';
import * as userAccessService from '@/server/services/user-access.service';

type Context = RouteContext<'/api/admin/users/[id]/roles'>;

// PUT y no POST/DELETE por rol: reemplazar el conjunto completo es idempotente, se
// resuelve en una sola petición por diálogo y el before/after de la bitácora sale
// directo del diff.
export async function PUT(request: Request, context: Context) {
  try {
    const { actor, granted } = await authorize('users.assign_roles');

    const { id } = await context.params;
    const parsedId = userIdSchema.safeParse(id);
    if (!parsedId.success) return badRequest('El identificador del usuario no es válido');

    const body = await parseJsonBody(request, assignRolesSchema, 'Los roles enviados no son válidos');
    if (!body.ok) return body.response;

    const updated = await userAccessService.setUserRoles({
      actor,
      granted,
      context: getAuditContext(request),
      userId: parsedId.data,
      roleSlugs: body.data.roleSlugs,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'PUT /api/admin/users/[id]/roles',
      fallback: 'No se pudieron guardar los roles',
    });
  }
}
