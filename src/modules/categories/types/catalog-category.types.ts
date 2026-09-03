import type { Category } from './category.types';

// Proyección pública de una categoría. `isActive` no viaja: en la tienda solo
// existen las activas, así que el campo sería siempre `true` y ruido en el payload.
export type CatalogCategory = Pick<
  Category,
  'id' | 'name' | 'slug' | 'description' | 'imageUrl'
> & {
  // Número de productos publicables de la categoría. Lo resuelve el repositorio
  // con un `count` agrupado: pedirlo desde el cliente sería una consulta por
  // tarjeta (spec 004, §6.2).
  productCount: number;
};

export type CatalogCategoryListResponse = {
  data: CatalogCategory[];
};
