import { and, asc, count, eq, ilike, lt, or, type SQL } from 'drizzle-orm';

import { escapeLikePattern } from '@/lib/utils';
import { resolveStockStatus } from '@/modules/inventory/lib/stock-status';
import type { InventoryQueryParams } from '@/modules/inventory/schemas/inventory.schema';
import type { InventoryRow } from '@/modules/inventory/types/inventory.types';
import { db, type Reader } from '@/server/db';
import { categories, products } from '@/server/db/schema';

// Las mismas columnas que publica el listado de productos del panel: la fila entera
// es lo que `ProductFormDialog` recibe por props, así que abrir el diálogo desde
// inventario no necesita una segunda petición (D-5). Se enumeran en vez de usar
// `select()` a secas porque el join añade dos campos de `categories` y
// `getTableColumns` mezclaría los `id` de ambas.
const INVENTORY_COLUMNS = {
  id: products.id,
  sku: products.sku,
  name: products.name,
  slug: products.slug,
  description: products.description,
  imageUrl: products.imageUrl,
  priceCents: products.priceCents,
  compareAtPriceCents: products.compareAtPriceCents,
  stock: products.stock,
  specs: products.specs,
  categoryId: products.categoryId,
  isActive: products.isActive,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
} as const;

type InventoryFilterParams = Pick<InventoryQueryParams, 'search' | 'categoryId'>;

// Exportada para poder probarla sin base de datos: es la pieza con reglas —los dos
// invariantes que ningún query param puede desactivar, el `all` que no filtra y el
// escape de comodines— y el resto de `findLowStock` es fontanería de Drizzle.
//
// Devuelve `SQL` y no `SQL | undefined`, a diferencia de los otros repositorios: los
// invariantes están siempre, así que este WHERE nunca es vacío. Un listado de
// inventario sin filtro sería el catálogo entero (AC4, AC5, AC6).
export function buildInventoryFilters(params: InventoryFilterParams, threshold: number): SQL {
  const conditions: SQL[] = [
    // Lo retirado del catálogo no se repone (AC6).
    eq(products.isActive, true),
    // `<` y no `<=`: un producto con exactamente el umbral todavía no es una alerta,
    // y `resolveStockStatus` traza la misma frontera (AC4).
    lt(products.stock, threshold),
  ];

  if (params.search) {
    // Sin escapar, buscar `%` devolvería toda la tabla como si fuera un resultado
    // (AC9). El valor sigue viajando como parámetro: esto no es inyección, es un
    // resultado incorrecto que quien consulta puede provocar.
    const pattern = `%${escapeLikePattern(params.search)}%`;

    // Nombre y SKU, igual que la búsqueda del listado de productos: quien repone
    // busca tanto por uno como por el otro.
    conditions.push(or(ilike(products.name, pattern), ilike(products.sku, pattern)) as SQL);
  }

  if (params.categoryId !== 'all') conditions.push(eq(products.categoryId, params.categoryId));

  // `and()` con al menos dos condiciones nunca devuelve undefined.
  return and(...conditions) as SQL;
}

export type InventoryListResult = { data: InventoryRow[]; total: number };

// Orden fijo, sin `sortBy` en la query: la pantalla existe para responder «qué
// atiendo primero», y un orden elegible permite justamente ocultar lo urgente (D-8).
// `id` cierra el desempate para que la paginación sea estable: sin él, dos productos
// con el mismo stock y el mismo nombre pueden repetirse entre páginas.
export async function findLowStock(
  params: InventoryQueryParams,
  threshold: number,
  reader: Reader = db,
): Promise<InventoryListResult> {
  const { page, pageSize } = params;
  const where = buildInventoryFilters(params, threshold);

  const [rows, [totals]] = await Promise.all([
    reader
      .select({
        ...INVENTORY_COLUMNS,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(asc(products.stock), asc(products.name), asc(products.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    // El conteo no necesita el join: los tres filtros viven en `products`, incluido
    // `category_id`. Mismo criterio que el listado de productos del panel.
    reader.select({ value: count() }).from(products).where(where),
  ]);

  return {
    total: totals?.value ?? 0,
    // El estado lo deriva el servidor con el mismo umbral que filtró, para que el
    // badge y el rótulo de la pantalla no puedan discrepar (D-9).
    data: rows.map((row) => ({ ...row, status: resolveStockStatus(row.stock, threshold) })),
  };
}
