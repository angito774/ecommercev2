import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import {
  isPermissionCode,
  isRoleSlug,
  type PermissionCode,
  type RoleSlug,
} from '@/lib/permissions';
import { db, type Reader, type Tx } from '@/server/db';
import {
  permissions,
  rolePermissions,
  roles,
  USER_TEXT_LENGTHS,
  userRoles,
  users,
} from '@/server/db/schema';
import type { RoleRef } from '@/server/repositories/role.repository';

type User = typeof users.$inferSelect;

// Solo los campos que Clerk es dueño de sincronizar: `is_active` lo gobierna el
// panel y no debe pisarse en cada webhook `user.updated`.
export type UpsertUserValues = {
  clerkId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
};

export async function findByClerkId(clerkId: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);
  return user ?? null;
}

// `reader` por defecto es el `db` global; los mutadores le pasan su `tx` para leer
// el `before` de la bitácora dentro de la misma transacción que el UPDATE.
export async function findById(id: string, reader: Reader = db): Promise<User | null> {
  const [user] = await reader.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function findRolesByUserId(
  userId: string,
  reader: Reader = db,
): Promise<RoleRef[]> {
  const rows = await reader
    .select({ id: roles.id, slug: roles.slug, isElevated: roles.isElevated })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId))
    .orderBy(asc(roles.slug));

  // Lo que no está en el catálogo del código no otorga nada: una fila que quedó en
  // la base tras retirar un rol se descarta en vez de castearse.
  return rows.flatMap((row) => (isRoleSlug(row.slug) ? [{ ...row, slug: row.slug }] : []));
}

// Set efectivo de permisos: clerk_id → users → user_roles → role_permissions →
// permissions. Un usuario desactivado no resuelve ningún permiso aunque su sesión
// de Clerk siga viva.
export async function findPermissionCodesByClerkId(clerkId: string): Promise<PermissionCode[]> {
  const rows = await db
    .selectDistinct({ code: permissions.code })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(users.clerkId, clerkId), eq(users.isActive, true)));

  return rows.map((row) => row.code).filter(isPermissionCode);
}

// Añade roles sin tocar los que ya tuviera: el webhook `user.created` aplica los
// roles de la invitación y no debe poder revocar nada. El reemplazo completo del
// conjunto es otra operación, con su propia autorización.
export async function addRoles(tx: Tx, userId: string, roleIds: string[]): Promise<number> {
  if (roleIds.length === 0) return 0;

  const inserted = await tx
    .insert(userRoles)
    .values(roleIds.map((roleId) => ({ userId, roleId })))
    .onConflictDoNothing()
    .returning({ roleId: userRoles.roleId });

  return inserted.length;
}

// Soft delete: la fila se conserva porque `audit_logs.actor_id` la referencia y la
// bitácora es append-only. Devuelve null cuando no hubo cambio —el usuario no está
// reflejado o ya estaba en ese estado—, de modo que un reintento de Svix no genera
// una segunda entrada de auditoría.
export async function setActiveByClerkId(
  tx: Tx,
  clerkId: string,
  isActive: boolean,
): Promise<User | null> {
  const [updated] = await tx
    .update(users)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(users.clerkId, clerkId), ne(users.isActive, isActive)))
    .returning();

  return updated ?? null;
}

// Clerk no garantiza que sus strings quepan en las columnas: un valor más largo
// aborta la transacción con `22001 string_data_right_truncation`, lo que dejaría al
// webhook en reintento infinito y al upsert JIT lanzando en cada request. El límite
// se lee del schema para que no haya dos verdades sobre el ancho.
const clamped = (max: number) => z.string().transform((value) => value.slice(0, max));

const upsertUserSchema = z.object({
  // La identidad no se recorta jamás: un `clerk_id` truncado crearía una fila espejo
  // que ninguna sesión vuelve a resolver y que atraería los roles de otra cuenta.
  clerkId: z
    .string()
    .max(
      USER_TEXT_LENGTHS.clerkId,
      `clerk_id excede ${USER_TEXT_LENGTHS.clerkId} caracteres y no puede recortarse.`,
    ),
  email: clamped(USER_TEXT_LENGTHS.email),
  firstName: clamped(USER_TEXT_LENGTHS.firstName).nullable(),
  lastName: clamped(USER_TEXT_LENGTHS.lastName).nullable(),
  imageUrl: clamped(USER_TEXT_LENGTHS.imageUrl).nullable(),
});

export type UserListParams = {
  q?: string;
  status: 'all' | 'active' | 'inactive';
  role: 'all' | RoleSlug;
  page: number;
  pageSize: number;
  sortBy: 'email' | 'createdAt';
  sortDir: 'asc' | 'desc';
};

export type UserWithRoleSlugs = User & { roleSlugs: RoleSlug[] };

export type UserListResult = {
  data: UserWithRoleSlugs[];
  total: number;
};

// El enum de `sortBy` se resuelve contra este mapa, de modo que nunca llega un
// identificador arbitrario a la cláusula ORDER BY.
const SORT_COLUMNS = {
  email: users.email,
  createdAt: users.createdAt,
} as const;

function buildFilters({ q, status, role }: Pick<UserListParams, 'q' | 'status' | 'role'>) {
  const conditions: SQL[] = [];

  if (q) {
    const pattern = `%${q}%`;
    const match = or(
      ilike(users.email, pattern),
      ilike(users.firstName, pattern),
      ilike(users.lastName, pattern),
    );
    if (match) conditions.push(match);
  }

  if (status !== 'all') conditions.push(eq(users.isActive, status === 'active'));

  // EXISTS y no un JOIN: filtrar por rol con un join duplicaría filas de usuario
  // cuando alguien tiene varios roles y rompería el `count` de la paginación.
  if (role !== 'all') {
    conditions.push(
      exists(
        db
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .innerJoin(roles, eq(roles.id, userRoles.roleId))
          .where(and(eq(userRoles.userId, users.id), eq(roles.slug, role))),
      ),
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function findMany(params: UserListParams): Promise<UserListResult> {
  const { page, pageSize, sortBy, sortDir } = params;
  const where = buildFilters(params);
  const orderBy = sortDir === 'asc' ? asc(SORT_COLUMNS[sortBy]) : desc(SORT_COLUMNS[sortBy]);

  const [pageRows, [totals]] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(users).where(where),
  ]);

  // Segunda consulta acotada a los ids de la página en vez de una agregación: el
  // tipo sale sin castear y el coste es un índice más sobre `user_roles`.
  const grants =
    pageRows.length === 0
      ? []
      : await db
          .select({ userId: userRoles.userId, slug: roles.slug })
          .from(userRoles)
          .innerJoin(roles, eq(roles.id, userRoles.roleId))
          .where(
            inArray(
              userRoles.userId,
              pageRows.map((user) => user.id),
            ),
          )
          .orderBy(asc(roles.slug));

  const slugsByUser = new Map<string, RoleSlug[]>();
  for (const grant of grants) {
    if (!isRoleSlug(grant.slug)) continue;
    const slugs = slugsByUser.get(grant.userId);
    if (slugs) slugs.push(grant.slug);
    else slugsByUser.set(grant.userId, [grant.slug]);
  }

  return {
    data: pageRows.map((user) => ({ ...user, roleSlugs: slugsByUser.get(user.id) ?? [] })),
    total: totals?.value ?? 0,
  };
}

// Reemplazo total del conjunto: borra e inserta dentro del mismo `tx`, de modo que
// el diff que audita el handler no puede quedar a medias.
export async function setRoles(
  tx: Tx,
  userId: string,
  roleIds: string[],
  assignedBy: string,
): Promise<void> {
  await tx.delete(userRoles).where(eq(userRoles.userId, userId));

  // Un INSERT con array vacío falla en Drizzle, y quedarse sin roles es un resultado
  // legítimo: deja al usuario en el default `customer`, sin permisos.
  if (roleIds.length === 0) return;

  await tx.insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId, assignedBy })));
}

export async function setActive(tx: Tx, id: string, isActive: boolean): Promise<User | null> {
  const [updated] = await tx
    .update(users)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  return updated ?? null;
}

// UPDATE condicional, no read-then-write: dos pestañas pulsando «Agregar tarjeta» a
// la vez pasarían las dos una comprobación en memoria y la segunda pisaría el
// Customer de la primera, dejando tarjetas huérfanas en el Customer perdido. Aquí la
// carrera la resuelve el motor y quien pierde reutiliza el `cus_…` que ya está
// guardado (spec 009, D-15).
//
// Devuelve el `cus_…` vigente, sea el recién fijado o el que ya había; `null` solo
// si la fila no existe.
export async function attachStripeCustomer(
  tx: Tx,
  userId: string,
  customerId: string,
): Promise<string | null> {
  const [updated] = await tx
    .update(users)
    .set({ stripeCustomerId: customerId, updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.stripeCustomerId)))
    .returning({ stripeCustomerId: users.stripeCustomerId });

  if (updated?.stripeCustomerId) return updated.stripeCustomerId;

  const [current] = await tx
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return current?.stripeCustomerId ?? null;
}

export async function upsertFromClerk(tx: Tx, values: UpsertUserValues): Promise<User> {
  const safe = upsertUserSchema.parse(values);

  const [user] = await tx
    .insert(users)
    .values(safe)
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        email: safe.email,
        firstName: safe.firstName,
        lastName: safe.lastName,
        imageUrl: safe.imageUrl,
        updatedAt: new Date(),
      },
    })
    .returning();

  return user;
}
