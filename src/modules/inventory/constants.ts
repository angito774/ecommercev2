import { ApiError } from '@/lib/errors';
import type { TransactionDirection } from '@/lib/inventory-transactions';

import type { InventoryDocumentQueryParams } from './schemas/inventory-document.schema';
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

// ── Documentos de movimiento ────────────────────────────────────────────────

export const INVENTORY_DOCUMENTS_PAGE_SIZE = 20;

// Rótulos de dirección. Mapa total sobre `TransactionDirection`: si algún día hubiera un
// tercer sentido, TypeScript obligaría a nombrarlo aquí en vez de caer a un fallback.
export const DIRECTION_LABELS: Record<TransactionDirection, string> = {
  ingreso: 'Ingreso',
  salida: 'Salida',
};

export const DIRECTION_NOTE_LABELS: Record<TransactionDirection, string> = {
  ingreso: 'Nota de ingreso',
  salida: 'Nota de salida',
};

export const DIRECTION_FILTER_OPTIONS = [
  { value: 'all', label: 'Ingresos y salidas' },
  { value: 'ingreso', label: 'Solo ingresos' },
  { value: 'salida', label: 'Solo salidas' },
] as const satisfies ReadonlyArray<{
  value: InventoryDocumentQueryParams['direction'];
  label: string;
}>;

// Los dos estados vacíos dicen cosas distintas y por eso son dos: sin filtros, cero
// documentos es que todavía no se registró ninguno y hay que explicar dónde se
// registran; con filtros, que la búsqueda no casó (AC17).
export const EMPTY_DOCUMENTS_TITLE = 'Todavía no hay movimientos registrados';

export const EMPTY_DOCUMENTS_MESSAGE =
  'Registra la primera nota de ingreso o de salida para empezar a explicar el stock.';

export const NO_DOCUMENT_RESULTS_TITLE = 'Sin resultados';

export const NO_DOCUMENT_RESULTS_MESSAGE =
  'Ningún documento coincide con la dirección, el rango de fechas o la referencia.';

export const MAX_DOCUMENT_ITEMS_LABEL =
  'Este documento ya tiene el máximo de líneas. Reparte el resto en otra nota.';

export const PRODUCT_NOT_FOUND_MESSAGE =
  'Uno de los productos del documento ya no existe. Quítalo y vuelve a intentarlo.';

export const INSUFFICIENT_STOCK_PREFIX = 'Stock insuficiente';

export function insufficientStockMessage(
  productName: string,
  stock: number,
  requested: number,
): string {
  return `${INSUFFICIENT_STOCK_PREFIX} de "${productName}": quedan ${stock} unidades y la nota pide ${requested}.`;
}

// El 409 de stock viaja con el `productId` de la línea que no alcanzó (§6): el diálogo
// marca esa línea comparando ids y no buscando el nombre del producto dentro del
// mensaje, que señalaría la línea equivocada cuando un nombre es prefijo de otro
// (AC5, T31). Devuelve `null` para cualquier otro fallo, incluido el 409 de producto
// repetido, que no apunta a una línea concreta.
export function stockConflictProductId(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;

  const { data } = error;
  if (typeof data !== 'object' || data === null || !('productId' in data)) return null;

  return typeof data.productId === 'string' ? data.productId : null;
}

export const inventoryDocumentKeys = {
  all: ['inventory-documents'] as const,
  lists: () => [...inventoryDocumentKeys.all, 'list'] as const,
  list: (params: InventoryDocumentQueryParams) =>
    [...inventoryDocumentKeys.lists(), params] as const,
  detail: (id: string) => [...inventoryDocumentKeys.all, 'detail', id] as const,
};
