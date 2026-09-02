import { cache } from 'react';

import { auth, currentUser } from '@clerk/nextjs/server';

import { can, ForbiddenError, type PermissionCode } from '@/lib/permissions';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import * as userRepository from '@/server/repositories/user.repository';

type User = typeof users.$inferSelect;

export { ForbiddenError };

// Mensaje único del 401 de toda la API: antes convivía con una constante literal
// repetida en cada Route Handler, y las dos formas de "sin sesión" —sin cookie y
// con cookie pero sin fila espejo— respondían textos distintos al mismo cliente.
export class UnauthorizedError extends Error {
  constructor() {
    super('Necesitas iniciar sesión para acceder a este recurso.');
    this.name = 'UnauthorizedError';
  }
}

const EMPTY_PERMISSIONS: ReadonlySet<PermissionCode> = new Set();

// `cache()` memoiza por request: el layout de admin resuelve el usuario para el
// redirect y para la navegación pagando una sola consulta, y la memoria caduca al
// terminar la petición, así que revocar un rol surte efecto en la siguiente.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const mirrored = await userRepository.findByClerkId(userId);
  if (mirrored) return mirrored;

  // Camino frío: el webhook `user.created` es eventualmente consistente y puede no
  // haber llegado todavía. `currentUser()` cuesta una llamada a la Backend API, por
  // eso solo se invoca cuando la fila espejo no existe.
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  // Solo el correo primario. Sin fallback al primero de la lista: ese email es la
  // clave con la que el seed busca al `super_admin`, y un correo secundario —que
  // Clerk no exige verificar— no debe poder atraer un rol elevado. Una cuenta sin
  // primario resoluble queda sin fila y, por tanto, sin permisos: default seguro.
  const email = clerkUser.primaryEmailAddress?.emailAddress;
  if (!email) return null;

  return db.transaction((tx) =>
    userRepository.upsertFromClerk(tx, {
      clerkId: clerkUser.id,
      email,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      imageUrl: clerkUser.imageUrl,
    }),
  );
});

export const getEffectivePermissions = cache(async (): Promise<ReadonlySet<PermissionCode>> => {
  const user = await getCurrentUser();
  if (!user || !user.isActive) return EMPTY_PERMISSIONS;

  const granted = await userRepository.findPermissionCodesByClerkId(user.clerkId);
  if (granted.length > 0) return new Set(granted);

  // Quien no tiene ninguna fila en `user_roles` se trata como `customer`
  // (docs/SETUP.md §5.1, regla dura 3), y `ROLE_PERMISSION_MATRIX['customer']` está
  // vacío: distinguir "sin rol" de "con rol sin permisos" costaría una consulta más
  // a Neon en cada request de la tienda para devolver el mismo conjunto vacío. Si
  // algún día `customer` otorga permisos, aquí vuelve a hacer falta esa consulta.
  return EMPTY_PERMISSIONS;
});

// Solo comprueba que exista sesión y fila espejo: NO mira `is_active`, porque un
// usuario desactivado debe recibir 403 y no 401 (AC13). Esa frontera la pone
// `requirePermission()`, que sí resuelve el set vacío para un usuario inactivo.
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requirePermission(code: PermissionCode): Promise<void> {
  const granted = await getEffectivePermissions();
  if (!can(granted, code)) throw new ForbiddenError(code);
}
