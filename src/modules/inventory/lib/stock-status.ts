import type { StockStatus } from '../types/inventory.types';

// Se deriva en TypeScript y no con un `CASE` en SQL a propósito: así queda
// comprobable sin base de datos y la consulta no reutiliza ninguna plantilla `sql`
// entre `select` y `orderBy`, que es la clase de bug que el spec 015 documenta
// (D-14, §10).
//
// El negativo cae en `'out'` por el `<= 0`: `decrementStock` no hace clamp a
// propósito (spec 007, D-10), así que una sobreventa deja el entero bajo cero y esa
// fila debe encabezar el listado, no desaparecer de él.
export function resolveStockStatus(stock: number, threshold: number): StockStatus {
  if (stock <= 0) return 'out';
  if (stock < threshold) return 'low';
  return 'in';
}
