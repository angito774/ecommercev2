import type { ProductWithCategory } from '@/modules/products/types/product.types';

// `'in'` no aparece nunca en una respuesta de este endpoint —el WHERE lo excluye—
// pero la función pura lo devuelve igualmente y el badge lo mapea: estrechar el
// tipo a 'out' | 'low' obligaría a un cast en el repositorio (D-6).
//
// Tipo propio y no el `StockLevel` del catálogo público: comparten los tres valores
// pero no el significado, y acoplarlos haría que subir el umbral del panel cambiase
// lo que ve el comprador (D-7).
export type StockStatus = 'out' | 'low' | 'in';

// La fila es el producto entero con su categoría, no una proyección corta: es lo
// que `ProductFormDialog` recibe por props sin una segunda petición (D-5).
export type InventoryRow = ProductWithCategory & { status: StockStatus };

export type InventoryListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  // El umbral que usó la consulta, no el que el cliente supone: el rótulo tiene
  // que decir el mismo número que filtró. Mismo criterio que `lowStockThreshold`
  // en el `meta` del dashboard.
  threshold: number;
  // Resuelto en el servidor; la UI solo oculta controles. La frontera real es el
  // 403 del PATCH de productos (AC13).
  canUpdateProduct: boolean;
};

export type InventoryListResponse = {
  data: InventoryRow[];
  meta: InventoryListMeta;
};
