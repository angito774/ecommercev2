import type { InventoryQueryParams } from './schemas/inventory.schema';
import type { StockStatus } from './types/inventory.types';

export const INVENTORY_PAGE_SIZE = 20;

export const INVENTORY_SEARCH_DEBOUNCE_MS = 300;

// Mapa total sobre `StockStatus`: `'in'` no llega nunca por este endpoint —el WHERE
// lo excluye— pero el tipo lo declara y dejar el caso fuera obligaría a un fallback
// que nadie puede probar (D-6).
export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  out: 'Agotado',
  low: 'Stock bajo',
  in: 'En stock',
};

// Los dos estados vacíos dicen cosas distintas y por eso son dos constantes: sin
// filtros, cero filas es la buena noticia; con filtros, es que la búsqueda no casó
// (AC12). Un solo copy para ambos casos alarmaría cuando no toca.
export const EMPTY_INVENTORY_TITLE = 'Todo el inventario está en orden';

export const EMPTY_INVENTORY_MESSAGE =
  'Ningún producto activo está por debajo del umbral de alerta.';

export const NO_RESULTS_TITLE = 'Sin resultados';

export const NO_RESULTS_MESSAGE =
  'Ningún producto bajo el umbral coincide con la búsqueda o la categoría.';

export const inventoryKeys = {
  all: ['inventory'] as const,
  lists: () => [...inventoryKeys.all, 'list'] as const,
  list: (params: InventoryQueryParams) => [...inventoryKeys.lists(), params] as const,
};
