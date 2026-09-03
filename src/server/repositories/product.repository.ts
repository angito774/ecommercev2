import { and, asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';

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

// Devuelve la fila desnuda. La usan los mutadores para leer el `before` de la
// bitácora, que debe ser el estado real de la tabla y no una proyección con
// campos de otra.
export async function findById(id: string, reader: Reader = db): Promise<Product | null> {
  const [product] = await reader.select().from(products).where(eq(products.id, id)).limit(1);
  return product ?? null;
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
