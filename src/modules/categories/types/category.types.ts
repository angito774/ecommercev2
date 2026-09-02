import type { InferSelectModel } from 'drizzle-orm';

// `import type` obligatorio: un import de valor arrastraría el schema Drizzle y
// @neondatabase/serverless al bundle del cliente (spec 001 §10).
import type { categories } from '@/server/db/schema/category';

export type Category = InferSelectModel<typeof categories>;

export type CategoryListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CategoryListResponse = {
  data: Category[];
  meta: CategoryListMeta;
};
