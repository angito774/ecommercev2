import { z } from 'zod';

import { ROLE_DEFINITIONS, type RoleSlug } from '@/lib/permissions';

// El enum se deriva del catálogo en vez de repetir los 6 slugs: si mañana cambia
// `ROLE_DEFINITIONS`, este schema deja de compilar en lugar de aceptar en silencio
// un rol que ya no existe.
const ROLE_SLUGS = ROLE_DEFINITIONS.map((role) => role.slug) as [RoleSlug, ...RoleSlug[]];

export const roleSlugSchema = z.enum(ROLE_SLUGS);

// Sin `firstName` ni `lastName`: `CreateParams` de `@clerk/backend`
// (`api/endpoints/InvitationApi.d.ts`) solo acepta `emailAddress`, `expiresInDays`,
// `ignoreExisting`, `notify`, `publicMetadata`, `redirectUrl` y `templateSlug`, así
// que no hay dónde guardarlos. El nombre real llega por el webhook `user.updated`
// cuando la persona completa el registro. Validarlos aquí solo serviría para
// aceptar dos campos de PII, descartarlos en silencio y responder 201 como si se
// hubieran guardado.
export const inviteUserSchema = z.object({
  email: z.email('Escribe un correo válido').max(255),
  roleSlugs: z.array(roleSlugSchema).min(1, 'Elige al menos un rol'),
});

export const assignRolesSchema = z.object({
  // Reemplazo total del conjunto: idempotente y sin endpoints add/remove.
  roleSlugs: z.array(roleSlugSchema),
});

export const updateUserSchema = z.object({ isActive: z.boolean() });

export const userQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  role: z.union([z.literal('all'), roleSlugSchema]).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['email', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const userIdSchema = z.uuid();

export type InviteUserValues = z.output<typeof inviteUserSchema>;
export type AssignRolesInput = z.output<typeof assignRolesSchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;
export type UserQueryParams = z.output<typeof userQuerySchema>;
