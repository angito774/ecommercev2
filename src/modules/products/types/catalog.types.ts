import type { Product } from './product.types';

// Nivel de disponibilidad. El entero de `stock` nunca sale del servidor: publicarlo
// expone la operación del negocio a cualquiera con `curl` (spec 004, D-7).
export type StockLevel = 'out' | 'low' | 'in';

// Proyección pública del catálogo. Se construye por `Pick` sobre el tipo inferido
// de Drizzle, no reescribiendo las columnas a mano (CLAUDE.md regla 5), y deja
// fuera `sku`, `stock`, `specs`, `isActive` y `categoryId` (AC6).
export type CatalogProduct = Pick<
  Product,
  'id' | 'name' | 'slug' | 'description' | 'imageUrl' | 'priceCents' | 'compareAtPriceCents'
> & {
  // Ambos se derivan en el SELECT del repositorio, no en el handler ni en el
  // componente, para que servidor y cliente muestren siempre el mismo número
  // (spec 004, D-9). `discountPercent` es null cuando no hay precio anterior.
  discountPercent: number | null;
  stockLevel: StockLevel;
  categoryName: string;
  categorySlug: string;
  // Sin `createdAt`: el orden por fecha lo resuelve el `ORDER BY` del repositorio y
  // ningún componente lo pinta, así que exponerlo solo añadía peso al payload
  // serializado (regla `server-serialization`). Además evita el problema de que
  // `Date` no sobrevive a JSON y el `initialData` del hook tuviera un tipo distinto
  // al de la respuesta fetcheada.
};

// Proyección de la ficha: el listado más el único campo que la página necesita y
// la rejilla no. `sku`, `stock`, `isActive` y `categoryId` siguen fuera (spec 005,
// D-6): que la vista sea más grande no cambia lo que es operación interna.
// `specs` llega por `Pick` del tipo inferido de Drizzle, no reescrito a mano
// (CLAUDE.md regla 5): es `Record<string, string> | null`, y `null` significa que
// el producto no tiene ficha técnica, así que la sección no se renderiza (AC7).
export type CatalogProductDetail = CatalogProduct & Pick<Product, 'specs'>;

export type CatalogProductListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// Sin flags de permiso, a diferencia de `ProductListMeta`: aquí no hay nada que
// ocultar por rol (spec 004, §6.1).
export type CatalogProductListResponse = {
  data: CatalogProduct[];
  meta: CatalogProductListMeta;
};
