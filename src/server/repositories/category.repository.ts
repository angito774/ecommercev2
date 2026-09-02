import { and, asc, count, desc, eq, ilike, type SQL } from 'drizzle-orm';

import { db, type Reader, type Tx } from '@/server/db';
import { categories } from '@/server/db/schema';

type Category = typeof categories.$inferSelect;
type NewCategory = typeof categories.$inferInsert;

export type CategoryListParams = {
  q?: string;
  status: 'all' | 'active' | 'inactive';
  page: number;
  pageSize: number;
  sortBy: 'name' | 'createdAt' | 'updatedAt';
  sortDir: 'asc' | 'desc';
};

export type CategoryListResult = {
  data: Category[];
  total: number;
};

// El enum de `sortBy` se resuelve contra este mapa, de modo que nunca llega un
// identificador arbitrario a la cláusula ORDER BY.
const SORT_COLUMNS = {
  name: categories.name,
  createdAt: categories.createdAt,
  updatedAt: categories.updatedAt,
} as const;

function buildFilters({ q, status }: Pick<CategoryListParams, 'q' | 'status'>): SQL | undefined {
  const conditions: SQL[] = [];

  if (q) conditions.push(ilike(categories.name, `%${q}%`));
  if (status !== 'all') conditions.push(eq(categories.isActive, status === 'active'));

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function findMany(params: CategoryListParams): Promise<CategoryListResult> {
  const { page, pageSize, sortBy, sortDir } = params;
  const where = buildFilters(params);
  const orderBy = sortDir === 'asc' ? asc(SORT_COLUMNS[sortBy]) : desc(SORT_COLUMNS[sortBy]);

  const [data, [totals]] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(categories).where(where),
  ]);

  return { data, total: totals?.value ?? 0 };
}

// `reader` por defecto es el `db` global; PATCH y DELETE le pasan su `tx` para que
// el `before` de la bitácora se lea dentro de la misma transacción que el UPDATE.
export async function findById(id: string, reader: Reader = db): Promise<Category | null> {
  const [category] = await reader.select().from(categories).where(eq(categories.id, id)).limit(1);
  return category ?? null;
}

// Los mutadores reciben un `Tx` y no admiten el `db` global: así es imposible
// escribir una categoría sin su entrada en `audit_logs`, porque ambas comparten la
// transacción del handler (docs/SETUP.md §5.2, regla dura 2). Las lecturas siguen
// con el `db` global.
export async function create(tx: Tx, values: NewCategory): Promise<Category> {
  const [created] = await tx.insert(categories).values(values).returning();
  return created;
}

export async function update(
  tx: Tx,
  id: string,
  values: Partial<NewCategory>,
): Promise<Category | null> {
  const [updated] = await tx
    .update(categories)
    .set(values)
    .where(eq(categories.id, id))
    .returning();
  return updated ?? null;
}

export async function softDelete(tx: Tx, id: string): Promise<Category | null> {
  const [deactivated] = await tx
    .update(categories)
    .set({ isActive: false })
    .where(eq(categories.id, id))
    .returning();
  return deactivated ?? null;
}
