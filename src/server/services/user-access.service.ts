import { clerkClient } from '@clerk/nextjs/server';

import { logAudit, type AuditContext } from '@/lib/audit';
import { APP_URL } from '@/lib/constants';
import { ConflictError, NotFoundError, UpstreamError } from '@/lib/errors';
import { can, ForbiddenError, type PermissionCode, type RoleSlug } from '@/lib/permissions';
import { USER_EMAIL_CONFLICT_MESSAGE } from '@/modules/users/constants';
import type { InvitationResult, UserWithRoles } from '@/modules/users/types/user.types';
import { db } from '@/server/db';
import type { users } from '@/server/db/schema';
import * as roleRepository from '@/server/repositories/role.repository';
import type { RoleRef } from '@/server/repositories/role.repository';
import * as userRepository from '@/server/repositories/user.repository';

type User = typeof users.$inferSelect;

// El actor y su set efectivo llegan resueltos desde el handler (`authorize()`): el
// servicio decide reglas de negocio, no vuelve a mirar la sesión.
type Command = {
  actor: User;
  granted: ReadonlySet<PermissionCode>;
  context: AuditContext;
};

const SELF_ROLES_MESSAGE =
  'No puedes cambiar tus propios roles. Pídeselo a otra persona con acceso a la gestión de usuarios.';
const SELF_ACTIVE_MESSAGE = 'No puedes quitarte a ti mismo el acceso al panel.';
const ELEVATED_MESSAGE =
  'Esa operación afecta a un rol de administración y solo puede hacerla quien tiene permitido nombrar administradores.';
const USER_NOT_FOUND_MESSAGE = 'Usuario no encontrado';

// Traducción de la regla "solo un super administrador otorga o revoca
// admin/super_admin" sin un solo literal de rol: la clasificación es el dato
// `roles.is_elevated` y la autorización es el código de permiso (CLAUDE.md regla 10).
function assertMayTouch(roles: readonly RoleRef[], granted: ReadonlySet<PermissionCode>): void {
  if (!roles.some((role) => role.isElevated)) return;
  if (can(granted, 'users.assign_elevated_roles')) return;

  throw new ForbiddenError('users.assign_elevated_roles', ELEVATED_MESSAGE);
}

async function resolveRoles(roleSlugs: RoleSlug[]): Promise<RoleRef[]> {
  const unique = [...new Set(roleSlugs)];
  const resolved = await roleRepository.findBySlugs(unique);

  // Zod ya acotó los slugs al catálogo, así que un faltante solo puede significar
  // que la base no está sembrada: es un fallo del servidor, no de la petición.
  if (resolved.length !== unique.length) {
    throw new Error(
      `Faltan roles en la base de datos (${unique.length - resolved.length}). Ejecuta npm run db:seed.`,
    );
  }

  return resolved;
}

function sameSlugs(before: readonly RoleSlug[], after: readonly RoleSlug[]): boolean {
  if (before.length !== after.length) return false;
  const set = new Set(before);
  return after.every((slug) => set.has(slug));
}

// La Backend API de Clerk falla con 400 o 422 cuando el correo ya tiene invitación
// pendiente o ya pertenece a una cuenta (spec OpenAPI `POST /invitations`). El
// formato del correo lo validó Zod antes, así que ese es el único rechazo de cliente
// que queda: se traduce a 409 y todo lo demás a 502.
type ClerkFailure = { status?: unknown; errors?: unknown };

function clerkStatusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const { status } = error as ClerkFailure;
  return typeof status === 'number' ? status : null;
}

async function createInvitation(email: string, roleSlugs: RoleSlug[]): Promise<string> {
  try {
    const clerk = await clerkClient();
    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      // Los roles viajan aquí: cuando la persona acepta y se registra, Clerk los
      // copia a `user.public_metadata` y el webhook `user.created` los aplica.
      publicMetadata: { roleSlugs },
      redirectUrl: `${APP_URL}/sign-up`,
    });

    return invitation.id;
  } catch (error) {
    const status = clerkStatusOf(error);

    if (status === 400 || status === 422) {
      throw new ConflictError(USER_EMAIL_CONFLICT_MESSAGE);
    }

    throw new UpstreamError(
      'No se pudo contactar con el servicio de invitaciones. Inténtalo de nuevo en un momento.',
      { cause: error },
    );
  }
}

export async function inviteUser(
  command: Command & { email: string; roleSlugs: RoleSlug[] },
): Promise<InvitationResult> {
  const { actor, granted, context, email, roleSlugs } = command;

  const roles = await resolveRoles(roleSlugs);
  assertMayTouch(roles, granted);

  // Clerk primero y la bitácora después: sostener una transacción de Neon durante
  // una llamada HTTP a un tercero bloquearía la conexión durante segundos. El precio
  // es que una invitación enviada cuyo log falle responde 500 sin traza; la cuenta
  // sigue sin poder entrar al panel hasta que el webhook la refleje, y ese evento sí
  // deja su propia entrada.
  const invitationId = await createInvitation(email, roleSlugs);

  await db.transaction((tx) =>
    logAudit(tx, {
      actorId: actor.id,
      action: 'user.invited',
      entityType: 'user',
      // Todavía no existe fila en `users`: la entidad se identifica por la
      // invitación hasta que la persona acepte.
      entityId: invitationId,
      severity: 'warning',
      changes: { before: null, after: { roleSlugs } },
      // El correo identifica a la cuenta invitada y por eso se guarda; nunca
      // contraseñas, tokens ni el payload crudo (docs/SETUP.md §5.2, regla 3).
      metadata: { email },
      context,
    }),
  );

  return { invitationId, email, roleSlugs };
}

export async function setUserRoles(
  command: Command & { userId: string; roleSlugs: RoleSlug[] },
): Promise<UserWithRoles> {
  const { actor, granted, context, userId, roleSlugs } = command;

  // La UI deshabilita la fila propia, pero la petición se puede forjar. Efecto
  // colateral valioso: garantiza que nunca queden cero super administradores.
  if (actor.id === userId) {
    throw new ForbiddenError('users.assign_roles', SELF_ROLES_MESSAGE);
  }

  // Los roles se resuelven fuera de la transacción porque son datos semilla que no
  // dependen del usuario; el usuario en sí se lee dentro, con el `tx`.
  const requested = await resolveRoles(roleSlugs);

  return db.transaction(async (tx) => {
    // Dentro de la transacción y no antes: leerlo con el `db` global devolvería al
    // cliente una fila rancia y, si la cuenta desaparece entre la lectura y el
    // `setRoles`, la FK reventaría con un 500 en vez de este 404 limpio.
    const target = await userRepository.findById(userId, tx);
    if (!target) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);

    const before = await userRepository.findRolesByUserId(userId, tx);

    // Entrante y saliente: quitar un rol elevado es tan sensible como otorgarlo.
    assertMayTouch([...before, ...requested], granted);

    const beforeSlugs = before.map((role) => role.slug);
    const afterSlugs = requested.map((role) => role.slug);

    // Sin cambio real no hay nada que auditar: una entrada con before === after
    // ensucia la bitácora y haría fallar el recuento de AC11.
    if (sameSlugs(beforeSlugs, afterSlugs)) {
      return { ...target, roleSlugs: beforeSlugs };
    }

    await userRepository.setRoles(
      tx,
      userId,
      requested.map((role) => role.id),
      actor.id,
    );

    await logAudit(tx, {
      actorId: actor.id,
      action: 'user.roles_changed',
      entityType: 'user',
      entityId: userId,
      severity: 'warning',
      changes: { before: { roleSlugs: beforeSlugs }, after: { roleSlugs: afterSlugs } },
      context,
    });

    return { ...target, roleSlugs: afterSlugs };
  });
}

export async function setUserActive(
  command: Command & { userId: string; isActive: boolean },
): Promise<UserWithRoles> {
  const { actor, granted, context, userId, isActive } = command;

  if (actor.id === userId) {
    throw new ForbiddenError('users.update', SELF_ACTIVE_MESSAGE);
  }

  return db.transaction(async (tx) => {
    const before = await userRepository.findById(userId, tx);
    if (!before) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);

    const targetRoles = await userRepository.findRolesByUserId(userId, tx);
    const roleSlugs = targetRoles.map((role) => role.slug);

    // Sin este guard, quien no puede revocar un rol elevado lo neutraliza por la
    // puerta de atrás quitándole el acceso. Vale en los dos sentidos: reactivar a un
    // administrador también le devuelve todos sus permisos.
    assertMayTouch(targetRoles, granted);

    if (before.isActive === isActive) {
      return { ...before, roleSlugs };
    }

    const after = await userRepository.setActive(tx, userId, isActive);
    if (!after) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);

    await logAudit(tx, {
      actorId: actor.id,
      action: isActive ? 'user.activated' : 'user.deactivated',
      entityType: 'user',
      entityId: after.id,
      severity: 'warning',
      changes: { before: { isActive: before.isActive }, after: { isActive: after.isActive } },
      context,
    });

    return { ...after, roleSlugs };
  });
}
