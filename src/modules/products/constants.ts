import type { CatalogQueryInput } from './schemas/catalog.schema';
import type { ProductQueryParams } from './schemas/product.schema';

export const DEFAULT_PAGE_SIZE = 10;

// A partir de cuántas unidades el panel considera que hay que reponer. Vive aquí y
// no en `dashboard/constants.ts` —de donde vino (spec 015, D-12)— porque es una
// propiedad del producto: el widget del dashboard y la página de inventario tienen
// que decir el mismo número, y que uno importara del otro invertiría la dependencia
// (spec 016, D-2). Sigue siendo global y provisional; hacerlo configurable por
// producto o categoría es deuda explícita del spec 016 §11.
//
// No confundir con `CATALOG_LOW_STOCK_THRESHOLD` de `product.repository.ts`, que
// vale 5 y es información comercial para el comprador, no una alerta de reposición.
export const LOW_STOCK_THRESHOLD = 10;

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

// Cuántos productos de la misma categoría acompañan a la ficha. La consulta pide
// uno más y descarta el producto actual (spec 005, D-4).
export const RELATED_PRODUCTS_SIZE = 4;

// Alineado con el `s-maxage=60` de los endpoints públicos: no tiene sentido que el
// cliente considere rancio un dato que el borde todavía sirve como fresco.
export const CATALOG_STALE_TIME_MS = 60 * 1000;
