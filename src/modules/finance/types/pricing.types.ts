import type { products } from '@/server/db/schema';

import type { UnitMargin } from '../lib/pricing-math';

// Inferido del schema Drizzle, nunca redeclarado a mano (CLAUDE.md regla 5). Es el único
// tipo del proyecto que sí publica `averageCostCents`, y por eso vive en el módulo que se
// abre con `finance.read` (spec 021, D-8).
type Product = typeof products.$inferSelect;

export type PricingRow = Pick<
  Product,
  // `stock` a la vista porque es lo que pondera el promedio y lo que el costo inicial
  // valoriza: sin él, «11 000» no se puede interpretar. `averageCostCents` es `null`
  // cuando no hay costo registrado, nunca 0 (AC5).
  'id' | 'sku' | 'name' | 'priceCents' | 'stock' | 'averageCostCents'
> &
  // Derivado por el servidor con `unitMargin()`, para que dos columnas de la misma fila
  // no puedan discrepar (mismo criterio que `resolveStockStatus`, spec 016 D-9).
  UnitMargin;

export type PricingListResponse = {
  data: PricingRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    // Resuelto en el servidor; la UI solo oculta la acción. La frontera real es el 403
    // del POST (AC4).
    canSetInitialCost: boolean;
  };
};

// Proyección estrecha a propósito: no devuelve la fila entera del producto para no
// publicar por la puerta de atrás lo que las proyecciones de productos excluyen (D-8).
export type InitialCostSet = Pick<Product, 'id' | 'sku' | 'name'> & {
  /** Ya no puede ser `null`: acaba de escribirse. */
  averageCostCents: number;
};
