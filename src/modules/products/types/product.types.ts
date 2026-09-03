import type { InferSelectModel } from 'drizzle-orm';

// `import type` obligatorio: un import de valor arrastraría el schema Drizzle y
// @neondatabase/serverless al bundle del cliente (spec 001 §10).
import type { products } from '@/server/db/schema/product';

export type Product = InferSelectModel<typeof products>;

// El nombre de la categoría lo resuelve el servidor con un join: sin él, la tabla
// tendría que pedir el listado de categorías y cruzarlo en cliente para pintar una
// sola columna.
export type ProductWithCategory = Product & {
  categoryName: string;
  categorySlug: string;
};

export type ProductListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  // El cliente NO decide permisos: los recibe ya resueltos por el servidor y solo
  // los usa para ocultar controles. La frontera real es el 403 del handler.
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

export type ProductListResponse = {
  data: ProductWithCategory[];
  meta: ProductListMeta;
};
