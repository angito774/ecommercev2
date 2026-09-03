import { NextResponse } from 'next/server';
import type { z } from 'zod';

import {
  getEffectivePermissions,
  requireAuth,
  requirePermission,
  UnauthorizedError,
} from '@/lib/auth';
import { ConflictError, NotFoundError, UpstreamError } from '@/lib/errors';
import { ForbiddenError, type PermissionCode } from '@/lib/permissions';
import { isUniqueViolation, uniqueViolationTarget } from '@/lib/utils';
import type { users } from '@/server/db/schema';

type User = typeof users.$inferSelect;

export type Authorized = {
  // Fila espejo del actor: los mutadores la necesitan para `audit_logs.actor_id`.
  actor: User;
  // Set efectivo ya resuelto: evita una segunda llamada cuando el handler tiene
  // que decidir algo más que el permiso de entrada (p. ej. `canAssignElevatedRoles`).
  granted: ReadonlySet<PermissionCode>;
};

// Preámbulo único de todo Route Handler bajo /api/admin. Antes vivía copiado en
// cada verbo; con ~10 copias el riesgo dejó de ser estético: un handler nuevo que
// olvide el preámbulo queda público en silencio.
//
// La verificación sigue corriendo DENTRO del recurso (CLAUDE.md regla 8): esto no
// es un middleware ni un matcher por ruta, es una llamada explícita que cada
// handler hace en su primera línea y que resuelve la sesión con `auth()` a través
// de `requireAuth()`. Nunca `auth.protect()`: en un Route Handler redirige con 307
// al formulario de login y axios acabaría leyendo HTML (docs/SETUP.md §6).
//
// Lanza en vez de devolver: así el `catch` del handler traduce el 401 y el 403 por
// el mismo camino que el resto de fallos, y es imposible ignorar el resultado.
export async function authorize(permission: PermissionCode): Promise<Authorized> {
  const actor = await requireAuth();
  await requirePermission(permission);

  // Sin consulta extra: `getEffectivePermissions()` está memoizado por request con
  // `cache()` y `requirePermission()` acaba de resolverlo.
  return { actor, granted: await getEffectivePermissions() };
}

export function badRequest(message: string, issues?: z.ZodIssue[]): NextResponse {
  return NextResponse.json(issues ? { message, issues } : { message }, { status: 400 });
}

type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

// El cuerpo se lee y se valida después de autorizar: un usuario sin permiso no debe
// poder enumerar el contrato de la API a base de 400 antes de recibir su 403.
export async function parseJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  invalidMessage: string,
): Promise<ParsedBody<z.output<TSchema>>> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return { ok: false, response: badRequest('El cuerpo debe ser JSON válido') };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, response: badRequest(invalidMessage, parsed.error.issues) };
  }

  return { ok: true, data: parsed.data };
}

type ErrorResponseOptions = {
  // Etiqueta del handler para el `console.error` del 500.
  label: string;
  fallback: string;
  // Mensaje del 409 cuando el conflicto lo detecta el constraint unique de Postgres
  // en vez de una regla de negocio. Sin él, una violación unique cae al 500.
  //
  // Como texto para las tablas con un solo constraint unique (`categories`). Como
  // mapa `nombre del constraint -> mensaje` para las que tienen varios
  // (`products`: sku y slug), porque el cliente necesita saber qué campo marcar y
  // el interceptor de axios solo le deja el mensaje (spec 003, AC9).
  uniqueViolationMessage?: string | Record<string, string>;
};

const GENERIC_CONFLICT_MESSAGE = 'Ya existe un registro con esos datos.';

function conflictMessage(
  option: string | Record<string, string>,
  error: unknown,
): string {
  if (typeof option === 'string') return option;

  const constraint = uniqueViolationTarget(error);
  // Un 23505 que no sabemos atribuir sigue siendo un conflicto del cliente: cae a
  // un mensaje genérico, nunca a un 500, que sería culpar al servidor.
  return (constraint && option[constraint]) || GENERIC_CONFLICT_MESSAGE;
}

// Única traducción de fallo → status de toda la API de admin. Que viva en un solo
// sitio es lo que garantiza que 401 sea siempre "sin sesión" y 403 siempre "con
// sesión y sin permiso" (docs/SETUP.md §6), sin depender de que cada handler
// recuerde el orden de las ramas.
export function toErrorResponse(error: unknown, options: ErrorResponseOptions): NextResponse {
  // Una sesión de Clerk que no resuelve fila espejo (cuenta sin correo primario) no
  // se puede identificar como actor de la bitácora: 401, no 500.
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ message: error.message }, { status: 401 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ message: error.message }, { status: 403 });
  }

  if (error instanceof NotFoundError) {
    return NextResponse.json({ message: error.message }, { status: 404 });
  }

  if (error instanceof ConflictError) {
    return NextResponse.json({ message: error.message }, { status: 409 });
  }

  if (error instanceof UpstreamError) {
    console.error(options.label, error);
    return NextResponse.json({ message: error.message }, { status: 502 });
  }

  // El conflicto lo detecta el constraint, no un SELECT previo: un pre-check dejaría
  // una carrera entre la lectura y el INSERT.
  if (options.uniqueViolationMessage && isUniqueViolation(error)) {
    const message = conflictMessage(options.uniqueViolationMessage, error);
    return NextResponse.json({ message }, { status: 409 });
  }

  console.error(options.label, error);
  return NextResponse.json({ message: options.fallback }, { status: 500 });
}
