import type { InferSelectModel } from 'drizzle-orm';

// `import type` obligatorio: un import de valor arrastraría el schema Drizzle y
// @neondatabase/serverless al bundle del cliente (spec 001 §10).
import type { products } from '@/server/db/schema/product';

export type Product = InferSelectModel<typeof products>;

// `averageCostCents` queda fuera a propósito y el `Omit` es la frontera: el costo es
// dato financiero (`finance.read`) y este tipo lo consumen el listado de productos y
// el de inventario, que se abren con `products.read` / `inventory.read` —permisos que
// `manager` y `audit` sí tienen y que no incluyen finanzas (spec 021, D-8)—.
//
// No es documentación: es lo que rompe el typecheck si alguien añade la columna a
// `PRODUCT_COLUMNS` o a `INVENTORY_COLUMNS` para reutilizar la proyección. La única
// lectura que sí publica el costo vive en `pricing.repository.ts`.
export type AdminProduct = Omit<Product, 'averageCostCents'>;

// El nombre de la categoría lo resuelve el servidor con un join: sin él, la tabla
// tendría que pedir el listado de categorías y cruzarlo en cliente para pintar una
// sola columna.
export type ProductWithCategory = AdminProduct & {
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
