export const APP_NAME = 'E-commerce Tech';
export const APP_DESCRIPTION = 'Tienda de tecnología';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// Cabecera de los dos endpoints públicos del catálogo. Vive aquí y no en un módulo
// porque la comparten `products` y `categories`, y que las dos rutas caduquen a la
// vez es justamente lo que evita que la portada mezcle datos de dos instantes.
// Contrapartida asumida: un cambio de precio publicado desde el panel tarda hasta
// un minuto en verse (spec 004, §10).
export const CATALOG_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';
