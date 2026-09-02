import { asc, eq, inArray } from 'drizzle-orm';

import {
  isPermissionCode,
  isRoleSlug,
  type PermissionCode,
  type RoleSlug,
} from '@/lib/permissions';
import { db } from '@/server/db';
import { permissions, rolePermissions, roles } from '@/server/db/schema';

type Role = typeof roles.$inferSelect;

export type RoleWithPermissions = Role & { permissionCodes: PermissionCode[] };

// Referencia mínima de un rol. `isElevated` viaja siempre con ella porque la regla
// "solo quien tiene users.assign_elevated_roles toca admin/super_admin" se decide
// sobre ese dato de la tabla, nunca comparando slugs en el código (CLAUDE.md regla
// 10).
export type RoleRef = { id: string; slug: RoleSlug; isElevated: boolean };

export async function findAllWithPermissions(): Promise<RoleWithPermissions[]> {
  // Dos consultas y agrupación en memoria en vez de una agregación jsonb: con 6
  // roles y 11 permisos el coste es irrelevante y el tipo sale sin castear.
  const [allRoles, grants] = await Promise.all([
    db.select().from(roles).orderBy(asc(roles.slug)),
    db
      .select({ roleId: rolePermissions.roleId, code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)),
  ]);

  const codesByRole = new Map<string, PermissionCode[]>();
  for (const grant of grants) {
    if (!isPermissionCode(grant.code)) continue;
    const codes = codesByRole.get(grant.roleId);
    if (codes) codes.push(grant.code);
    else codesByRole.set(grant.roleId, [grant.code]);
  }

  return allRoles.map((role) => ({
    ...role,
    permissionCodes: codesByRole.get(role.id) ?? [],
  }));
}

export async function findBySlugs(slugs: RoleSlug[]): Promise<RoleRef[]> {
  if (slugs.length === 0) return [];

  const rows = await db
    .select({ id: roles.id, slug: roles.slug, isElevated: roles.isElevated })
    .from(roles)
    .where(inArray(roles.slug, slugs))
    .orderBy(asc(roles.slug));

  // Lo que no está en el catálogo del código no otorga nada: una fila que quedó en
  // la base tras retirar un rol se descarta en vez de castearse.
  return rows.flatMap((row) => (isRoleSlug(row.slug) ? [{ ...row, slug: row.slug }] : []));
}
