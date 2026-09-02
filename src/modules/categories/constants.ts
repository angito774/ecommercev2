import type { CategoryQueryParams } from './schemas/category.schema';

export const DEFAULT_PAGE_SIZE = 10;

export const CATEGORY_STATUS_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Inactivas' },
] as const satisfies ReadonlyArray<{ value: CategoryQueryParams['status']; label: string }>;

export const SEARCH_DEBOUNCE_MS = 300;

// El interceptor de src/lib/axios.ts colapsa la respuesta de error a su
// `message` y descarta el status, así que el formulario reconoce el 409 de slug
// por esta constante en lugar de por el código HTTP. La comparten el Route
// Handler que la emite y el diálogo que la mapea al campo.
export const CATEGORY_SLUG_CONFLICT_MESSAGE =
  'Ya existe una categoría con ese slug. Las categorías inactivas también lo reservan.';

export const categoryKeys = {
  all: ['categories'] as const,
  lists: () => [...categoryKeys.all, 'list'] as const,
  list: (params: CategoryQueryParams) => [...categoryKeys.lists(), params] as const,
};
