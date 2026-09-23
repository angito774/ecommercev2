import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';

import { escapeLikePattern } from '@/lib/utils';
import { unitMargin } from '@/modules/finance/lib/pricing-math';
import type { PricingQueryParams } from '@/modules/finance/schemas/pricing.schema';
import type { PricingRow } from '@/modules/finance/types/pricing.types';
import { db, type Reader } from '@/server/db';
import { products } from '@/server/db/schema';

// **Única proyección del repositorio que publica `average_cost_cents`**, y vive en su
// propio archivo justamente por eso: si esta consulta compartiera `PRODUCT_COLUMNS` con
// el listado de productos y el de inventario, añadir el costo allí para reutilizarlo
// sería un cambio de una línea que se lo entregaría a `products.read` e `inventory.read`
// —permisos que `manager` y `audit` tienen y que no incluyen finanzas— (spec 021, D-8).
const PRICING_COLUMNS = {
  id: products.id,
  sku: products.sku,
  name: products.name,
  priceCents: products.priceCents,
  stock: products.stock,
  averageCostCents: products.averageCostCents,
} as const;

// Se repite la expresión en el ORDER BY en vez de ordenar por un alias del SELECT, igual
// que `HAS_DISCOUNT` en el catálogo: un alias no es referenciable desde ORDER BY en todos
// los motores. `desc` pone el `true` —«sin costo»— primero, que es donde está el problema
// que la pantalla existe para resolver (D-14).
const WITHOUT_COST = sql`(${products.averageCostCents} is null)`;

type PricingFilterParams = Pick<PricingQueryParams, 'search'>;

// Exportada para poder probarla sin base de datos: es la pieza con reglas —el invariante
// que ningún query param puede desactivar y el escape de comodines— y el resto de
// `findPricingRows` es fontanería de Drizzle.
//
// Devuelve `SQL` y no `SQL | undefined`, igual que en inventario: el invariante está
// siempre, así que este WHERE nunca es vacío.
export function buildPricingFilters(params: PricingFilterParams): SQL {
  // Lo retirado del catálogo no se vende, así que no tiene margen que mirar (AC21). No es
  // parametrizable desde fuera: ningún query param puede convertir esta ruta en el
  // catálogo entero.
  const conditions: SQL[] = [eq(products.isActive, true)];

  if (params.search) {
    // Sin escapar, buscar `%` devolvería la tabla entera como si fuera un resultado
    // (AC22). El valor sigue viajando como parámetro: esto no es inyección, es un
    // resultado incorrecto que quien consulta puede provocar.
    const pattern = `%${escapeLikePattern(params.search)}%`;

    // Nombre y SKU, igual que el listado de productos y el de inventario: quien revisa
    // márgenes busca tanto por uno como por el otro.
    conditions.push(or(ilike(products.name, pattern), ilike(products.sku, pattern)) as SQL);
  }

  return and(...conditions) as SQL;
}

export type PricingListResult = { data: PricingRow[]; total: number };

// Orden fijo, sin `sortBy` en la query (D-14): lo primero que hay que resolver para
// responder «qué margen deja cada producto» es el producto al que le falta el costo, así
// que esos encabezan. El `id` cierra el desempate para que la paginación sea estable: sin
// él, dos productos con el mismo nombre pueden repetirse entre páginas (AC20).
export async function findPricingRows(
  params: PricingQueryParams,
  reader: Reader = db,
): Promise<PricingListResult> {
  const { page, pageSize } = params;
  const where = buildPricingFilters(params);

  const [rows, [totals]] = await Promise.all([
    reader
      .select(PRICING_COLUMNS)
      .from(products)
      .where(where)
      .orderBy(desc(WITHOUT_COST), asc(products.name), asc(products.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    // Sin join ni segunda tabla: los dos filtros viven en `products`. Mismo criterio que
    // el listado de inventario.
    reader.select({ value: count() }).from(products).where(where),
  ]);

  return {
    total: totals?.value ?? 0,
    // El margen lo deriva el servidor sobre las filas de la página, no un `CASE` en SQL:
    // el `NULLIF(price_cents, 0)` que haría falta para no dividir por cero es justo la
    // guarda que `unitMargin()` ya trae probada (D-7).
    data: rows.map((row) => ({ ...row, ...unitMargin(row.priceCents, row.averageCostCents) })),
  };
}
