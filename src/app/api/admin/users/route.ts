import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext } from '@/lib/audit';
import { can } from '@/lib/permissions';
import { inviteUserSchema, userQuerySchema } from '@/modules/users/schemas/user.schema';
import type { UserListResponse } from '@/modules/users/types/user.types';
import * as userRepository from '@/server/repositories/user.repository';
import * as userAccessService from '@/server/services/user-access.service';

export async function GET(request: Request) {
  try {
    const { actor, granted } = await authorize('users.read');

    const { searchParams } = new URL(request.url);
    const parsed = userQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const { data, total } = await userRepository.findMany(parsed.data);
    const { page, pageSize } = parsed.data;

    const body: UserListResponse = {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        // El cliente no decide permisos: recibe resuelto quién es él y si puede
        // tocar roles elevados, y solo lo usa para deshabilitar controles.
        currentUserId: actor.id,
        canAssignElevatedRoles: can(granted, 'users.assign_elevated_roles'),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/users',
      fallback: 'No se pudo obtener el listado de usuarios',
    });
  }
}

export async function POST(request: Request) {
  try {
    const { actor, granted } = await authorize('users.invite');

    const body = await parseJsonBody(request, inviteUserSchema, 'Datos de la invitación inválidos');
    if (!body.ok) return body.response;

    const result = await userAccessService.inviteUser({
      actor,
      granted,
      context: getAuditContext(request),
      email: body.data.email,
      roleSlugs: body.data.roleSlugs,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/admin/users',
      fallback: 'No se pudo enviar la invitación',
    });
  }
}
