import type { ProductQueryParams } from './schemas/product.schema';

export const DEFAULT_PAGE_SIZE = 10;

export const SEARCH_DEBOUNCE_MS = 300;

// El interceptor de src/lib/axios.ts colapsa la respuesta de error a su `message` y
// descarta el status, así que el diálogo reconoce cada 409 por su constante. Son
// dos porque `products` tiene dos constraints unique y el formulario tiene que
// marcar el campo correcto (spec 003, AC9).
export const PRODUCT_SKU_CONFLICT_MESSAGE =
  'Ya existe un producto con ese SKU. Los productos inactivos también lo reservan.';

export const PRODUCT_SLUG_CONFLICT_MESSAGE =
  'Ya existe un producto con ese slug. Los productos inactivos también lo reservan.';

// Nombres reales de los constraints, tal y como los creó la migración 0002 y como
// los devuelve Postgres en el error 23505.
export const PRODUCT_CONFLICT_MESSAGES: Record<string, string> = {
  products_sku_unique: PRODUCT_SKU_CONFLICT_MESSAGE,
  products_slug_unique: PRODUCT_SLUG_CONFLICT_MESSAGE,
};

export const PRODUCT_STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
] as const satisfies ReadonlyArray<{ value: ProductQueryParams['status']; label: string }>;

export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (params: ProductQueryParams) => [...productKeys.lists(), params] as const,
};
