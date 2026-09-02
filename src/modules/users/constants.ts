import { ROLE_DEFINITIONS } from '@/lib/permissions';

import type { UserQueryParams } from './schemas/user.schema';

export const DEFAULT_PAGE_SIZE = 10;

export const SEARCH_DEBOUNCE_MS = 300;

export const USER_STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Con acceso' },
  { value: 'inactive', label: 'Sin acceso' },
] as const satisfies ReadonlyArray<{ value: UserQueryParams['status']; label: string }>;

// Las etiquetas salen del catálogo de `src/lib/permissions.ts`, que es puro y ya
// tiene el nombre en español de cada rol: duplicarlas aquí crearía dos verdades
// sobre cómo se llama un rol en la interfaz.
export const USER_ROLE_OPTIONS = [
  { value: 'all', label: 'Todos los roles' },
  ...ROLE_DEFINITIONS.map((role) => ({ value: role.slug, label: role.name })),
] as const satisfies ReadonlyArray<{ value: UserQueryParams['role']; label: string }>;

// El interceptor de src/lib/axios.ts colapsa la respuesta de error a su `message` y
// descarta el status, así que el diálogo reconoce el 409 por esta constante en vez
// de por el código HTTP. La comparten el servicio que la emite y el formulario que
// la mapea al campo de correo.
export const USER_EMAIL_CONFLICT_MESSAGE =
  'Ese correo ya tiene una invitación pendiente o una cuenta creada. Búscalo en la lista para cambiarle los roles.';

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (params: UserQueryParams) => [...userKeys.lists(), params] as const,
};
