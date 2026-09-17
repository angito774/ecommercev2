import { z } from 'zod';

// Contrato de `GET /api/admin/inventory`. No hay parámetro de umbral ni de orden: el
// primero lo fija el servidor (§8, D-9) y el segundo es invariable (D-8), así que
// nada de lo que llegue por la query puede ensanchar el listado.
export const inventoryQuerySchema = z.object({
  // Texto libre sobre nombre y SKU. `trim()` aquí para que un `search` de solo
  // espacios llegue al repositorio como cadena vacía y no filtre nada.
  search: z.string().trim().max(160).optional(),
  // Centinela `all` en vez de omitir el parámetro: el `Select` de shadcn no admite
  // un item con valor vacío, y `products` ya usa esta misma forma (D-4).
  categoryId: z.union([z.literal('all'), z.uuid()]).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type InventoryQueryParams = z.output<typeof inventoryQuerySchema>;
