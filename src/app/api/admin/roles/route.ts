import { NextResponse } from 'next/server';

import { authorize, toErrorResponse } from '@/lib/api-guard';
import type { RolesResponse } from '@/modules/roles/types/role.types';
import * as permissionRepository from '@/server/repositories/permission.repository';
import * as roleRepository from '@/server/repositories/role.repository';

// Solo lectura: los 6 roles y los 11 permisos nacen del seed, así que este recurso
// no expone POST, PATCH ni DELETE (spec 002 §3, "no incluye").
export async function GET() {
  try {
    await authorize('roles.read');

    const [data, catalog] = await Promise.all([
      roleRepository.findAllWithPermissions(),
      permissionRepository.findAll(),
    ]);

    const body: RolesResponse = { data, permissions: catalog };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/roles',
      fallback: 'No se pudieron obtener los roles',
    });
  }
}
