import type { AdminProduct, Product } from '../types/product.types';

// La frontera que impide que un costo llegue a `audit_logs` (spec 021, D-9).
//
// El riesgo tiene nombre y es el mismo que el de los salarios (spec 018, D-8):
// `product.created` y `product.updated` escriben `changes` con las filas **enteras**
// —`findById` hace `select()` a secas y `update()` devuelve `returning()` completo—, y
// `audit-log-columns.tsx` renderiza `changes` y `metadata` íntegros. En cuanto existe
// `products.average_cost_cents`, cualquier edición de producto copiaría el costo a la
// bitácora, que `audit` lee con `audit_logs.read` **sin** tener `finance.read`. Además
// `PATCH` nunca modifica esa columna, así que en el `changes` era ruido.
//
// Es una función pura y probada, no un `delete` suelto en el handler: nada en el tipo de
// `AuditInput` lo impediría, porque `changes` es `unknown`.

/** El proyectado que sí puede entrar en la bitácora, y también en la respuesta. */
export type AuditableProduct = AdminProduct;

export function toAuditableProduct(row: Product): AuditableProduct {
  // Proyección positiva y no `delete`/rest: se enumera lo que sale, así que una columna
  // nueva y sensible en `products` no se cuela sola en el log por haberla añadido al
  // schema. Es el mismo criterio que `PRODUCT_COLUMNS` en el repositorio.
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl,
    priceCents: row.priceCents,
    compareAtPriceCents: row.compareAtPriceCents,
    stock: row.stock,
    specs: row.specs,
    categoryId: row.categoryId,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
