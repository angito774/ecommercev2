import type { InferSelectModel } from 'drizzle-orm';

import type { PermissionCode } from '@/lib/permissions';
// `import type` obligatorio: un import de valor arrastraría el schema Drizzle y
// @neondatabase/serverless al bundle del cliente (spec 002 §10).
import type { permissions } from '@/server/db/schema/permission';
import type { roles } from '@/server/db/schema/role';

export type Role = InferSelectModel<typeof roles>;
export type Permission = InferSelectModel<typeof permissions>;

export type RoleWithPermissionCodes = Role & { permissionCodes: PermissionCode[] };

export type RolesResponse = {
  data: RoleWithPermissionCodes[];
  // El catálogo completo viaja aparte para que la matriz de /admin/roles pueda
  // pintar las columnas de permisos que ningún rol otorga.
  permissions: Permission[];
};
