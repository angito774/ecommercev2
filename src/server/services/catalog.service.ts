import { cache } from 'react';

import * as categoryRepository from '@/server/repositories/category.repository';

// El layout del storefront (footer) y la portada (marquee, rejilla y filtros del
// catálogo) necesitan exactamente la misma lista. Next no deduplica entre layout y
// page por sí solo —no es un `fetch`, es una consulta por driver—, así que sin esto
// cada render abre dos veces la misma consulta a Neon.
//
// `cache()` de React memoiza por request: la segunda llamada devuelve la promesa de
// la primera y no toca la base. Es el mismo mecanismo que ya usa
// `getEffectivePermissions()` en la capa de autorización.
export const getPublicCategories = cache(() => categoryRepository.findPublicWithCounts());

// Variante que NO puede lanzar, para el layout del storefront.
//
// Next no usa el `error.tsx` de un segmento para atrapar lo que lanza el
// `layout.tsx` de ese mismo segmento: ese boundary solo cubre lo que cuelga por
// debajo. Si el layout lanzaba, el visitante recibía un 500 con el cuerpo vacío —
// sin header, sin mensaje, sin nada—, que es justo lo que `error.tsx` venía a
// evitar.
//
// El footer degrada perfectamente sin categorías, así que un fallo de lectura se
// traga aquí y se devuelve la lista vacía. La lectura de la portada sigue usando
// `getPublicCategories()` y sigue pudiendo lanzar: ahí sí hay boundary y el
// visitante debe ver el estado de error, no un catálogo mudo.
export async function getPublicCategoriesForChrome(): Promise<
  Awaited<ReturnType<typeof getPublicCategories>>
> {
  try {
    return await getPublicCategories();
  } catch (error) {
    // No se silencia: el fallo tiene que quedar en el log aunque la página siga.
    console.error('No se pudieron leer las categorías del footer', error);
    return [];
  }
}
