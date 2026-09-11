import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';

import type {
  CatalogProduct,
  CatalogProductDetail,
  StockLevel,
} from '@/modules/products/types/catalog.types';
import { db, type Reader, type Tx } from '@/server/db';
import { categories, products } from '@/server/db/schema';

type Product = typeof products.$inferSelect;
type NewProduct = typeof products.$inferInsert;

export type ProductWithCategory = Product & {
  categoryName: string;
  categorySlug: string;
};

export type ProductListParams = {
  q?: string;
  status: 'all' | 'active' | 'inactive';
  categoryId: 'all' | string;
  page: number;
  pageSize: number;
  sortBy: 'name' | 'priceCents' | 'stock' | 'createdAt';
  sortDir: 'asc' | 'desc';
};

export type ProductListResult = {
  data: ProductWithCategory[];
  total: number;
};

// El enum de `sortBy` se resuelve contra este mapa, de modo que nunca llega un
// identificador arbitrario a la cláusula ORDER BY.
const SORT_COLUMNS = {
  name: products.name,
  priceCents: products.priceCents,
  stock: products.stock,
  createdAt: products.createdAt,
} as const;

// Se enumeran las columnas en vez de usar `select()` a secas porque el join añade
// dos campos de `categories` y `getTableColumns` mezclaría los `id` de ambas.
const PRODUCT_COLUMNS = {
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

function buildFilters({
  q,
  status,
  categoryId,
}: Pick<ProductListParams, 'q' | 'status' | 'categoryId'>): SQL | undefined {
  const conditions: SQL[] = [];

  // La búsqueda cubre nombre y SKU: quien administra el catálogo busca tanto por
  // uno como por el otro, y obligarle a elegir campo sería peor interfaz.
  if (q) {
    const byNameOrSku = or(ilike(products.name, `%${q}%`), ilike(products.sku, `%${q}%`));
    if (byNameOrSku) conditions.push(byNameOrSku);
  }

  if (status !== 'all') conditions.push(eq(products.isActive, status === 'active'));
  if (categoryId !== 'all') conditions.push(eq(products.categoryId, categoryId));

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function findMany(params: ProductListParams): Promise<ProductListResult> {
  const { page, pageSize, sortBy, sortDir } = params;
  const where = buildFilters(params);
  const orderBy = sortDir === 'asc' ? asc(SORT_COLUMNS[sortBy]) : desc(SORT_COLUMNS[sortBy]);

  const [data, [totals]] = await Promise.all([
    db
      .select({
        ...PRODUCT_COLUMNS,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    // El conteo no necesita el join: `category_id` se filtra sobre la propia tabla.
    db.select({ value: count() }).from(products).where(where),
  ]);

  return { data, total: totals?.value ?? 0 };
}

// ── Catálogo público ────────────────────────────────────────────────────────

// A partir de aquí se sirve la tienda. El umbral vive en una constante para poder
// subirlo sin tocar el contrato: `low` revela que quedan pocas unidades y eso es
// información comercial deliberada, no un descuido (spec 004, §10).
const LOW_STOCK_THRESHOLD = 5;

export type CatalogListParams = {
  q?: string;
  // Slug, no uuid: así la URL del filtro es legible y el slug ya es único.
  category: 'all' | string;
  sort: 'featured' | 'newest' | 'price_asc' | 'price_desc';
  discounted: boolean;
  page: number;
  pageSize: number;
};

export type CatalogListResult = {
  data: CatalogProduct[];
  total: number;
};

// `compare_at_price_cents > price_cents` es null-safe: si la columna es NULL la
// comparación da NULL y el CASE cae al ELSE. El `::int` evita que Postgres
// devuelva `numeric`, que node-postgres entrega como string.
const DISCOUNT_PERCENT = sql<number | null>`
  case
    when ${products.compareAtPriceCents} > ${products.priceCents}
      then round(
        ((${products.compareAtPriceCents} - ${products.priceCents})::numeric * 100)
        / ${products.compareAtPriceCents}
      )::int
    else null
  end
`;

const STOCK_LEVEL = sql<StockLevel>`
  case
    when ${products.stock} <= 0 then 'out'
    when ${products.stock} <= ${LOW_STOCK_THRESHOLD} then 'low'
    else 'in'
  end
`;

// Se repite la condición en lugar de ordenar por el alias del SELECT porque un
// alias no es referenciable desde ORDER BY en todos los motores y aquí importa que
// la expresión no sea NULL nunca: `desc` en Postgres pone los NULL primero y
// entonces los productos SIN descuento encabezarían el orden "featured".
const HAS_DISCOUNT = sql`(${products.compareAtPriceCents} is not null and ${products.compareAtPriceCents} > ${products.priceCents})`;

const IN_STOCK = sql`(${products.stock} > 0)`;

// `id` cierra los cuatro órdenes como desempate estable: sin él, dos filas con el
// mismo precio o la misma fecha pueden intercambiarse entre páginas y el visitante
// ve un producto repetido y otro perdido.
const CATALOG_ORDER_BY = {
  featured: [desc(HAS_DISCOUNT), desc(IN_STOCK), desc(products.createdAt), asc(products.id)],
  newest: [desc(products.createdAt), asc(products.id)],
  price_asc: [asc(products.priceCents), asc(products.id)],
  price_desc: [desc(products.priceCents), asc(products.id)],
} as const satisfies Record<CatalogListParams['sort'], readonly SQL[]>;

// `%` y `_` son comodines de LIKE, no texto. Sin escaparlos, `?q=%` se traduce en
// `ilike '%%%'` y devuelve el catálogo entero como si fuera un resultado de
// búsqueda, y `?q=_` casa con cualquier carácter. No es inyección —el valor sigue
// viajando como parámetro— pero sí un resultado incorrecto que el visitante puede
// provocar. La barra invertida es a su vez el carácter de escape, así que va
// primero o se escaparía a sí misma dos veces.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// El filtro invariante no es parametrizable desde fuera a propósito: ningún query
// param puede desactivarlo, así que un producto inactivo —o uno activo bajo una
// categoría inactiva— no aparece nunca en la tienda (AC3, AC4).
function buildCatalogFilters({
  q,
  category,
  discounted,
}: Pick<CatalogListParams, 'q' | 'category' | 'discounted'>): SQL {
  const conditions: SQL[] = [
    eq(products.isActive, true),
    eq(categories.isActive, true),
  ];

  if (q) conditions.push(ilike(products.name, `%${escapeLikePattern(q)}%`));
  if (category !== 'all') conditions.push(eq(categories.slug, category));
  if (discounted) conditions.push(HAS_DISCOUNT);

  // `and()` con al menos dos condiciones nunca devuelve undefined.
  return and(...conditions) as SQL;
}

const CATALOG_COLUMNS = {
  id: products.id,
  name: products.name,
  slug: products.slug,
  description: products.description,
  imageUrl: products.imageUrl,
  priceCents: products.priceCents,
  compareAtPriceCents: products.compareAtPriceCents,
  discountPercent: DISCOUNT_PERCENT,
  stockLevel: STOCK_LEVEL,
  categoryName: categories.name,
  categorySlug: categories.slug,
} as const;

export async function findPublicMany(params: CatalogListParams): Promise<CatalogListResult> {
  const { page, pageSize, sort } = params;
  const where = buildCatalogFilters(params);

  // El conteo sí necesita el join, a diferencia del listado de admin: `is_active`
  // de la categoría y el filtro por slug viven en la otra tabla.
  const [data, [totals]] = await Promise.all([
    db
      .select(CATALOG_COLUMNS)
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(...CATALOG_ORDER_BY[sort])
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(where),
  ]);

  return { data, total: totals?.value ?? 0 };
}

// Ficha de producto. Comparte con `findPublicMany()` el filtro invariante y las
// derivaciones (`DISCOUNT_PERCENT`, `STOCK_LEVEL`), así que la página y el listado
// no pueden discrepar en el descuento ni en la disponibilidad. El `slug` es el
// único parámetro: nada de fuera puede desactivar `is_active` (spec 005, §6.3).
//
// Añade `specs` a `CATALOG_COLUMNS` y nada más: el resto de la fila —`sku`,
// `stock`, `isActive`, `categoryId`— sigue sin salir del servidor (AC6).
export async function findPublicBySlug(slug: string): Promise<CatalogProductDetail | null> {
  const [product] = await db
    .select({ ...CATALOG_COLUMNS, specs: products.specs })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(
      and(
        eq(products.slug, slug),
        eq(products.isActive, true),
        eq(categories.isActive, true),
      ),
    )
    .limit(1);

  return product ?? null;
}

// ── Administración ──────────────────────────────────────────────────────────

// Devuelve la fila desnuda. La usan los mutadores para leer el `before` de la
// bitácora, que debe ser el estado real de la tabla y no una proyección con
// campos de otra.
export async function findById(id: string, reader: Reader = db): Promise<Product | null> {
  const [product] = await reader.select().from(products).where(eq(products.id, id)).limit(1);
  return product ?? null;
}

// Una sola consulta para todas las líneas del carrito, en vez de un `findById` por
// línea: el checkout necesita el precio y el stock reales de hasta 50 productos y un
// N+1 dentro de la transacción multiplicaría los viajes a Neon. Devuelve filas
// desnudas —incluidos `stock` e `isActive`— porque el llamador es servidor y esa
// información es la que decide el 409 (D-9).
export async function findManyByIds(ids: string[], reader: Reader = db): Promise<Product[]> {
  if (ids.length === 0) return [];
  return reader.select().from(products).where(inArray(products.id, ids));
}

export type StockDecrement = {
  productId: string;
  quantity: number;
};

export type StockAfterDecrement = {
  productId: string;
  name: string;
  stock: number;
};

// Sin clamp a propósito: `GREATEST(stock - qty, 0)` borraría la evidencia de la
// sobreventa. Un negativo no rompe la tienda —`STOCK_LEVEL` mapea `<= 0` a `'out'`—
// y el `RETURNING` deja que el servicio audite el caso como `order.oversold` (D-10).
//
// Un UPDATE por línea. Con el tope de 50 líneas y dentro de una transacción ya
// abierta es aceptable; si creciera, se sustituye por `UPDATE … FROM (VALUES …)`.
export async function decrementStock(
  tx: Tx,
  lines: readonly StockDecrement[],
): Promise<StockAfterDecrement[]> {
  const results: StockAfterDecrement[] = [];

  for (const line of lines) {
    const [updated] = await tx
      .update(products)
      .set({ stock: sql`${products.stock} - ${line.quantity}` })
      .where(eq(products.id, line.productId))
      .returning({ productId: products.id, name: products.name, stock: products.stock });

    if (updated) results.push(updated);
  }

  return results;
}

export async function findByIdWithCategory(id: string): Promise<ProductWithCategory | null> {
  const [product] = await db
    .select({
      ...PRODUCT_COLUMNS,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.id, id))
    .limit(1);

  return product ?? null;
}

// Comprobación previa a escribir para poder devolver un 400 que nombre el campo,
// en vez de dejar que salte la violación de clave foránea y acabe en un 500
// (spec 003 §8, AC11). La carrera es irrelevante: las categorías se desactivan,
// nunca se borran.
export async function categoryExists(categoryId: string, reader: Reader = db): Promise<boolean> {
  const [row] = await reader
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  return row !== undefined;
}

// Los mutadores reciben un `Tx` y no admiten el `db` global: así es imposible
// escribir un producto sin su entrada en `audit_logs`, porque ambas comparten la
// transacción del handler (docs/SETUP.md §5.2, regla dura 2).
export async function create(tx: Tx, values: NewProduct): Promise<Product> {
  const [created] = await tx.insert(products).values(values).returning();
  return created;
}

export async function update(
  tx: Tx,
  id: string,
  values: Partial<NewProduct>,
): Promise<Product | null> {
  const [updated] = await tx.update(products).set(values).where(eq(products.id, id)).returning();
  return updated ?? null;
}

export async function softDelete(tx: Tx, id: string): Promise<Product | null> {
  const [deactivated] = await tx
    .update(products)
    .set({ isActive: false })
    .where(eq(products.id, id))
    .returning();

  return deactivated ?? null;
}
