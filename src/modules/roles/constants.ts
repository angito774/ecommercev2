import { ROLE_DEFINITIONS, type RoleDefinition, type RoleSlug } from '@/lib/permissions';

export const roleKeys = {
  all: ['roles'] as const,
  list: () => [...roleKeys.all, 'list'] as const,
};

// El catálogo puro de `src/lib/permissions.ts` es la misma fuente desde la que el
// seed escribe `roles.name`, así que sirve de índice para pintar la etiqueta de un
// slug sin pedir el listado a la API.
const BY_SLUG = new Map<RoleSlug, RoleDefinition>(
  ROLE_DEFINITIONS.map((role) => [role.slug, role]),
);

export function roleLabel(slug: RoleSlug): string {
  return BY_SLUG.get(slug)?.name ?? slug;
}
// Orden de presentación de la matriz. La API devuelve los roles por `slug`
// alfabético, que deja `admin` antes que `super_admin` y mezcla los que abren el
// panel con los que no. Este índice es puramente visual —no decide nada de
// autorización, así que no choca con la regla 10 de CLAUDE.md— y sale del mismo
// catálogo del que nacen los roles, de modo que un rol nuevo aparece sin tocar
// esto.
const ORDER = new Map<RoleSlug, number>(ROLE_DEFINITIONS.map((role, index) => [role.slug, index]));

export function roleOrder(slug: string): number {
  return ORDER.get(slug as RoleSlug) ?? ROLE_DEFINITIONS.length;
}

export function roleDescription(slug: RoleSlug): string {
  return BY_SLUG.get(slug)?.description ?? '';
}

// Etiquetas cortas para los encabezados de la matriz. La `description` del catálogo
// es una frase entera y no cabe en una columna; estas dos tablas dan el nombre
// breve y caen al valor crudo si el catálogo crece sin pasar por aquí, que es
// preferible a romper la vista.
const RESOURCE_LABELS: Record<string, string> = {
  categories: 'Categorías',
  users: 'Usuarios',
  roles: 'Roles',
  audit_logs: 'Bitácora',
};

const ACTION_LABELS: Record<string, string> = {
  read: 'Ver',
  create: 'Crear',
  update: 'Editar',
  delete: 'Desactivar',
  invite: 'Invitar',
  assign_roles: 'Cambiar roles',
  assign_elevated_roles: 'Nombrar administradores',
};

export function resourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] ?? resource;
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
