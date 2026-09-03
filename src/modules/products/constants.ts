import type { CatalogQueryInput } from './schemas/catalog.schema';
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

// Espacio de claves separado del de administración: las dos listas salen de
// endpoints distintos y con proyecciones distintas, así que una invalidación del
// panel no debe tocar el caché de la tienda ni al revés.
export const catalogKeys = {
  all: ['catalog'] as const,
  lists: () => [...catalogKeys.all, 'list'] as const,
  list: (params: CatalogQueryInput) => [...catalogKeys.lists(), params] as const,
};

// Tamaño de la primera página del catálogo. Lo comparten la lectura inicial del
// Server Component y el hook: si divergieran, la clave de `initialData` no
// coincidiría con la de la primera consulta del cliente y habría un refetch
// inmediato (AC8).
export const CATALOG_PAGE_SIZE = 12;

// Cuántos resultados muestra el overlay de búsqueda.
export const CATALOG_SEARCH_LIMIT = 6;

// Alineado con el `s-maxage=60` de los endpoints públicos: no tiene sentido que el
// cliente considere rancio un dato que el borde todavía sirve como fresco.
export const CATALOG_STALE_TIME_MS = 60 * 1000;
