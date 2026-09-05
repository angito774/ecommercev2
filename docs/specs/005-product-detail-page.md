---
id: 005
title: Ficha de producto y navegación del buscador
status: done
module: products
scope: client
created: 2026-09-04
---

# 005 — Ficha de producto y navegación del buscador

## 1. Contexto

El spec 004 dejó la tienda pública en pie: portada con datos reales, catálogo
filtrable, buscador `⌘K` y carrito local. Excluyó de forma explícita la ficha de
producto (§3) y la anotó en su §11 como «spec siguiente del storefront», con la
observación de que la tarjeta ya viaja con `slug` y solo falta el destino.

Hoy eso se nota en tres sitios verificados en el código:

- No existe `src/app/(storefront)/products/[slug]/page.tsx` ni ningún Route
  Handler de producto individual. `src/app/api/products/route.ts` solo sirve el
  listado.
- `src/modules/storefront/components/search-dialog.tsx:61` lleva escrito
  «Sin ficha de producto todavía (§3), así que el resultado lleva al catálogo
  filtrado por su categoría». Elegir un resultado del buscador no lleva al
  producto que el visitante buscó, sino a su categoría.
- Ninguna tarjeta del storefront es un enlace: nombre, foto y precio no llevan a
  ninguna parte, y el único control es «añadir al carrito».

La consecuencia comercial es que el catálogo no se puede consultar: no hay
página donde ver la descripción ni la ficha técnica que el panel ya guarda en
`products.specs` (los 8 productos sembrados tienen entre 2 y 3 especificaciones
reales), y no hay ninguna URL de producto que compartir o indexar.

## 2. Objetivo

Un visitante puede abrir `/products/<slug>` desde cualquier tarjeta o resultado
de búsqueda y ver la ficha completa del producto —foto, descripción, precio,
descuento, disponibilidad, ficha técnica y productos relacionados— para decidir
la compra antes de añadirlo al carrito.

## 3. Alcance

### Incluye

- Ruta pública `/products/[slug]`: Server Component que lee por repositorio en el
  primer render (`docs/SETUP.md` §4, flecha de lectura inicial y SEO).
- `generateMetadata` por producto (título, descripción, `openGraph`, canonical) y
  datos estructurados JSON-LD `Product` con su `offers`.
- Route Handler público `GET /api/products/[slug]`, validado con Zod, con el
  mismo `Cache-Control` que los dos endpoints del spec 004.
- `findPublicBySlug()` en `product.repository.ts`, con el **mismo filtro
  invariante** que `findPublicMany()`: producto activo y categoría activa.
- DTO de detalle `CatalogProductDetail`: `CatalogProduct` + `specs`. Sigue sin
  exponer `sku`, `stock`, `isActive` ni `categoryId`.
- Estados de la ruta: `not-found.tsx` propio del storefront (con header y footer)
  y `loading.tsx` con la silueta de la ficha.
- Tira de productos relacionados de la misma categoría, resuelta con el
  `findPublicMany()` que ya existe.
- Enlace a la ficha desde los cuatro lugares donde hoy se pinta un producto:
  `product-card`, `deals-section`, `featured-slider` y `hero-visual`.
- Cambio del buscador: elegir un resultado navega a su ficha; el ítem de reserva
  navega al catálogo con el término aplicado. Nunca añade al carrito.
- Filtro por texto en la sección de catálogo (`ui.store` + `CatalogSection`),
  que es lo que hace verdadero «el catálogo con el filtro aplicado».
- Corrección de la navegación global: las anclas del header, del menú móvil, del
  footer y de `CategoryJumpLink` pasan a ser relativas a la raíz, porque desde la
  ficha `#catalogo` no existe en el documento.

### No incluye (explícito)

- **Página de catálogo `/products`** (índice paginado con filtros propios en la
  URL). Sigue diferida: el catálogo vive en la sección `#catalogo` de la portada.
  `/products` responderá 404, igual que hoy.
- **Galería de imágenes.** El modelo tiene una sola `image_url`; una galería
  necesita `product_images`, que está en `docs/SETUP.md` §5.3 pero sin spec.
- **Selector de cantidad en la ficha.** El botón añade de uno en uno, como en el
  resto de la tienda; la cantidad se ajusta en el drawer del carrito.
- **Valoraciones, reseñas, preguntas y wishlist.** Sin tabla, igual que en 004.
- **`sitemap.xml` y `robots.txt`.** El JSON-LD sí entra (es marcado de la propia
  página); el sitemap necesita una consulta de slugs y decisiones de indexación
  que no pertenecen a esta feature.
- **Cambios de esquema.** Nada nuevo en `products` ni en `categories`.
- **Migración de la búsqueda a `pg_trgm`/`tsvector`.** El `ilike` del spec 004 se
  reutiliza tal cual.
- **Checkout, pedidos y carrito de servidor.**

## 4. Criterios de aceptación

- [x] **AC1** — Dado un visitante sin sesión, cuando abre `/products/<slug>` de un
      producto activo bajo categoría activa, entonces recibe `200` con la ficha
      renderizada desde el servidor y no se le redirige a `/sign-in`.
- [x] **AC2** — Dado un slug inexistente, o el de un producto con
      `is_active = false`, o el de un producto cuya categoría tiene
      `is_active = false`, cuando se abre `/products/<slug>`, entonces responde
      `404` y renderiza el `not-found` del storefront con header y footer.
- [x] **AC3** — Dado `GET /api/products/<slug>` de un producto publicable, cuando
      se ejecuta sin sesión, entonces devuelve `200` con `CatalogProductDetail` y
      la cabecera `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`,
      sin que intervenga `authorize()`.
- [x] **AC4** — Dado `GET /api/products/<slug>` con un slug que no cumple el
      patrón (`MAYUSCULAS`, espacios, `../`), cuando se ejecuta, entonces responde
      `400` con `{ message, issues }` y **no** consulta la base.
- [x] **AC5** — Dado `GET /api/products/<slug>` de un producto inexistente o no
      publicable, cuando se ejecuta, entonces responde `404` con `{ message }`.
- [x] **AC6** — Dada la respuesta de la ficha (API o payload de la página), cuando
      se inspecciona, entonces no contiene `sku`, `stock`, `isActive` ni
      `categoryId`; la disponibilidad sigue viajando como `stockLevel`.
- [x] **AC7** — Dado un producto con `specs` no vacío, cuando se abre su ficha,
      entonces se listan todos sus pares clave/valor; y con `specs` nulo o vacío,
      la sección de ficha técnica no se renderiza (no queda un bloque vacío).
- [x] **AC8** — Dado un producto con `compare_at_price_cents > price_cents`,
      cuando se abre su ficha, entonces muestra precio actual, precio tachado y
      badge `−N %`; sin precio anterior no muestra ninguno de los dos.
- [x] **AC9** — Dado un producto con `stockLevel = 'out'`, cuando se abre su ficha,
      entonces el botón de añadir al carrito está deshabilitado y se muestra
      «Agotado».
- [x] **AC10** — Dada la ficha de un producto, cuando se inspecciona el HTML,
      entonces contiene un `<script type="application/ld+json">` con
      `@type: "Product"`, `name`, `offers.price` en unidades, `priceCurrency: PEN`
      y `availability` coherente con `stockLevel`.
- [x] **AC11** — Dada la ficha de un producto, cuando se leen sus `<title>` y
      `og:*`, entonces llevan el nombre real del producto y no el genérico de la
      tienda.
- [x] **AC12** — Dada la ficha de un producto de una categoría con más productos
      publicables, cuando se abre, entonces muestra hasta 4 relacionados de esa
      categoría y **nunca** el propio producto; si no hay ninguno, la sección no
      se renderiza.
- [x] **AC13** — Dada una tarjeta del catálogo, cuando se pulsa sobre su nombre o
      su imagen, entonces se navega a `/products/<slug>`; y cuando se pulsa el
      botón de añadir, entonces se añade al carrito y **no** se navega.
- [x] **AC14** — Dada una tarjeta del catálogo recorrida con el teclado, cuando se
      tabula, entonces las únicas paradas son el enlace a la ficha y el grupo de
      control de cantidad —el botón de añadir cuando el producto no está en el
      carrito, o el stepper «−／cantidad／+» cuando ya tiene unidades (feature
      aprobada en paralelo a este spec, ver D-16)—, todas con foco visible y sin
      enlaces anidados dentro de otros elementos interactivos.
- [x] **AC15** — Dado el buscador con resultados, cuando el visitante elige uno con
      `Enter` o con el ratón, entonces se navega a `/products/<slug>` de **ese**
      producto, el overlay se cierra, el foco vuelve al disparador y **el carrito
      no cambia** (`itemCount` idéntico antes y después).
- [x] **AC16** — Dado el buscador con un término escrito, cuando el visitante elige
      el ítem de reserva «Ver … en el catálogo», entonces se navega a `/#catalogo`
      con el término aplicado y la rejilla muestra los resultados de ese término,
      no el catálogo completo.
- [x] **AC17** — Dado el buscador con un término sin ningún resultado, cuando el
      visitante pulsa `Enter`, entonces ocurre el caso de reserva de AC16 (el
      catálogo con su estado vacío nombrando el término) y no una acción muda.
- [x] **AC18** — Dado el catálogo con un término aplicado, cuando el visitante
      pulsa la ✕ del término, entonces la rejilla vuelve al catálogo completo sin
      recargar la página.
- [x] **AC19** — Dado que el visitante está en `/products/<slug>`, cuando pulsa
      «Catálogo» en el header, «Ver el catálogo» en el menú móvil o una categoría
      del footer, entonces llega a la sección de catálogo de la portada con el
      filtro puesto, en navegación de cliente (sin recarga completa).
- [x] **AC20** — Dada la portada, cuando se pulsa una entrada del header o del
      marquee, entonces sigue siendo un desplazamiento dentro del mismo documento:
      la corrección de AC19 no convierte las anclas de la portada en recargas.
- [x] **AC21** — Dada la ficha a 390 px de ancho, cuando se navega, entonces la
      columna es única, todo objetivo táctil mide ≥ 44 px de alto y no hay scroll
      horizontal en el `body`.
- [x] **AC22** — Dado `prefers-reduced-motion: reduce`, cuando se carga la ficha,
      entonces todo el contenido es visible en su estado final y no se ejecuta
      ninguna animación de entrada.
- [x] **AC23** — Dado el proyecto completo, cuando se ejecuta
      `npm run typecheck && npm run lint && npm run build`, entonces los tres pasan
      y `/products/[slug]` aparece como ruta dinámica en la salida del build.

## 5. Modelo de datos

**Sin cambios de esquema.** No hay tablas ni columnas nuevas, ni migración. La
ficha se sirve entera desde `products` y `categories` tal como las dejaron los
specs 001, 003 y 004, incluida la columna `specs` (`jsonb`,
`$type<Record<string, string>>()`) que ya existe desde el spec 003 y que hasta
ahora solo consumía el panel.

### 5.1 Proyección de detalle (no es una tabla)

Extiende la proyección pública del spec 004 §5.3 con el único campo que la ficha
necesita y el listado no. Se compone sobre `CatalogProduct`, que a su vez se
deriva por `Pick` del tipo inferido de Drizzle (CLAUDE.md regla 5):

```ts
// src/modules/products/types/catalog.types.ts — se añade
export type CatalogProductDetail = CatalogProduct & {
  // Ficha técnica tal como la guarda el panel. `null` cuando el producto no tiene
  // ninguna; el componente no renderiza la sección en ese caso (AC7).
  specs: Record<string, string> | null;
};
```

Lo que sigue **fuera** del DTO y por qué: `stock` (el entero delata inventario,
spec 004 D-7), `isActive` y `categoryId` (internos), `sku` (identificador de
operación; si comercialmente hiciera falta un «modelo» visible, es un campo
propio, no el SKU) y `createdAt` (nadie lo pinta, spec 004 I-1).

## 6. Contratos de API

Un Route Handler nuevo, **público**. `src/proxy.ts` no cambia: las rutas son
públicas por defecto y `clerkMiddleware()` sigue resolviendo la sesión para el
header (`docs/SETUP.md` §6).

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/products/[slug]` | público | `slug` de ruta | `CatalogProductDetail` | 400, 404, 500 |

Cabecera de respuesta en el `200`: `CATALOG_CACHE_CONTROL` de
`src/lib/constants.ts` (`public, s-maxage=60, stale-while-revalidate=300`), la
misma que ya emiten `/api/products` y `/api/categories`, para que las tres
caduquen a la vez y la tienda no mezcle datos de dos instantes.

### 6.1 Entrada

El parámetro de ruta se valida con Zod **antes** de tocar la base (CLAUDE.md
regla 4), reutilizando el patrón de slug que ya existe en vez de escribir otra
expresión regular:

```ts
// src/modules/products/schemas/catalog.schema.ts — se añade
export const catalogSlugParamSchema = productSlugSchema;
```

`productSlugSchema` ya impone `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 2–180 caracteres.
Eso rechaza mayúsculas, espacios, `%`, `_` y cualquier intento de recorrido de
rutas antes de que exista una consulta (AC4).

### 6.2 Salida y errores

```ts
type CatalogProductDetailResponse = CatalogProductDetail;
```

Se devuelve el objeto plano, sin envoltorio `{ data }`: es un recurso único y el
`{ data, meta }` de la lista existe por la paginación, que aquí no aplica.

| Status | Cuerpo |
|---|---|
| 400 | `{ message: 'El slug del producto no es válido', issues: ZodIssue[] }` |
| 404 | `{ message: 'Producto no encontrado' }` |
| 500 | `{ message: 'No se pudo obtener el producto' }` |

El 404 no distingue entre «no existe», «está inactivo» y «su categoría está
inactiva»: los tres son «no publicable» y separarlos convertiría el endpoint en
un oráculo del catálogo interno.

### 6.3 Filtro invariante

Idéntico al de `findPublicMany()` y **no parametrizable desde fuera**:

```
products.slug = $1 AND products.is_active = true AND categories.is_active = true
```

Es lo que hace que AC2 y AC5 sean la misma regla vista desde la página y desde
la API.

## 7. Arquitectura y archivos afectados

```
src/server/db/schema/                  — sin cambios

src/server/repositories/
  product.repository.ts                + findPublicBySlug()

src/server/services/
  catalog.service.ts                   + getPublicProductBySlug = cache(...)

src/app/api/
  products/[slug]/route.ts             NUEVO — GET público

src/app/(storefront)/
  not-found.tsx                        NUEVO — 404 con header y footer
  loading.tsx                          ELIMINADO — sustituido por <Suspense> en page.tsx (§12.2)
  page.tsx                             + <Suspense fallback={<HomeSkeleton />}>
  products/[slug]/layout.tsx           NUEVO — validación del slug + notFound() (§12.2)
  products/[slug]/page.tsx             NUEVO — Server Component + generateMetadata
  products/[slug]/loading.tsx          NUEVO — esqueleto con la silueta de la ficha

src/modules/products/
  types/catalog.types.ts               + CatalogProductDetail
  schemas/catalog.schema.ts            + catalogSlugParamSchema
  constants.ts                         + RELATED_PRODUCTS_SIZE

src/modules/storefront/
  constants.ts                         STOREFRONT_NAV → hrefs relativos a la raíz
  store/ui.store.ts                    + catalogQuery / setCatalogQuery
  components/
    home-skeleton.tsx                  NUEVO — silueta de la portada (era loading.tsx)
    hash-scroll.tsx                    NUEVO — scroll al hash tras resolver el Suspense (§12.8)
    add-to-cart-button.tsx             stepper: botones size-9 → size-11 (D-16)
    product-detail.tsx                 NUEVO — server, cuerpo de la ficha
    product-spec-list.tsx              NUEVO — server, ficha técnica
    product-json-ld.tsx                NUEVO — server, datos estructurados
    related-products.tsx               NUEVO — server, tira de la categoría
    product-breadcrumb.tsx             NUEVO — server + CategoryJumpLink
    product-card.tsx                   + enlace extendido a la ficha
    deals-section.tsx                  + enlace a la ficha
    featured-slider.tsx                + enlace a la ficha
    hero-visual.tsx                    + enlace a la ficha
    search-dialog.tsx                  onSelect → ficha; ítem de reserva → catálogo
    catalog-section.tsx                + filtro por término y chip para limpiarlo
    category-jump-link.tsx             <a> → <Link href="/#catalogo">
    storefront-header.tsx              <a> → <Link>
    mobile-menu.tsx                    <a> → <Link>
    storefront-footer.tsx              <a> → <Link>
```

Nada de esto toca `src/app/(admin)`, `src/lib/permissions.ts` ni `src/proxy.ts`.

## 8. Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| D-1 | La ficha es un Server Component que lee por repositorio, con `generateMetadata` sobre la misma lectura memoizada con `cache()` | Client Component con `useCatalogProduct(slug)` | Es la página que de verdad quiere indexarse (spec 004 §11): el título, la descripción y el JSON-LD tienen que estar en el HTML inicial, no aparecer al hidratar. `docs/SETUP.md` §4 reserva la flecha `Server Component → repositorio` exactamente a esto. `cache()` evita que `generateMetadata` y el render abran dos consultas, con el mismo mecanismo que ya usa `getPublicCategories()`. |
| D-2 | `GET /api/products/[slug]` se construye aunque la página no lo consuma | No construirlo | Está en el alcance confirmado y completa la superficie pública: hoy `/api/products` devuelve una lista de slugs que no resuelven contra ningún recurso individual. **Contrapartida escrita a propósito: en esta fase el endpoint no tiene consumidor de cliente.** Por eso *no* se crean el service ni el hook que lo llamarían —serían una abstracción con cero consumidores, contra CLAUDE.md §6—, y su verificación es por `curl` (AC3–AC5). Si en la revisión se prefiere, T7 y T8 se pueden retirar sin afectar a ningún otro criterio de aceptación. |
| D-3 | El repositorio gana `findPublicBySlug()` en lugar de reutilizar `findPublicMany({ q: slug })` | Reutilizar el listado | El listado busca por `ilike` sobre `name`, no por slug, y devuelve página y conteo que aquí sobran. La función nueva comparte con él el filtro invariante y las derivaciones (`DISCOUNT_PERCENT`, `STOCK_LEVEL`), que ya son constantes del módulo: no se duplica SQL, se reutiliza. |
| D-4 | Los relacionados salen de `findPublicMany({ category, sort: 'featured', pageSize: RELATED+1 })`, descartando el producto actual | Una consulta `findRelated()` nueva con `NOT id = $1` | La función existente ya filtra por slug de categoría, aplica el invariante y ordena por `featured`. Pedir uno de más y descartar el actual en JavaScript cuesta una línea; una consulta nueva cuesta una función, su tipo y su mantenimiento. Se revisa si algún día los relacionados dejan de ser «misma categoría». |
| D-5 | 404 con `notFound()` de `next/navigation` y un `not-found.tsx` propio del segmento `(storefront)` | Dejar que caiga en `src/app/not-found.tsx` | El de la raíz se renderiza fuera del layout del storefront: el visitante perdería header, buscador, carrito y footer justo en el momento en que más necesita seguir navegando, y además saldría con la paleta neutra del admin porque no lleva `data-surface="storefront"`. |
| D-6 | El DTO de detalle añade `specs` y nada más | Añadir también `sku` y `stock` | `specs` es contenido de marketing que el panel ya redacta y que la ficha existe para mostrar (AC7). `stock` y `sku` siguen siendo operación interna: la regla de spec 004 D-7 no cambia porque la página sea más grande. |
| D-7 | Enlace extendido (`after:absolute after:inset-0`) sobre el nombre de la tarjeta, con el botón de carrito elevado por encima | Envolver la tarjeta entera en `<Link>` | Un `<Link>` alrededor de toda la tarjeta anidaría el botón de añadir dentro de un ancla: HTML inválido, y el clic en el botón navegaría además de añadir. El enlace extendido deja una sola parada de tabulación para el enlace, mantiene el botón como segunda parada y conserva el área de clic de toda la tarjeta (AC13, AC14). |
| D-8 | Las anclas del *chrome* (header, menú móvil, footer, `CategoryJumpLink`) pasan a `/#seccion` y a `next/link` | Dejarlas como `#seccion` | Con una segunda página en el storefront, `#catalogo` deja de existir en el documento y esos enlaces se vuelven mudos desde la ficha. `/#catalogo` en el mismo documento sigue siendo navegación *same-document* —el navegador desplaza, no recarga (AC20)—, y `next/link` hace que desde la ficha sea navegación de cliente, que es lo que conserva el estado de Zustand con el filtro recién puesto (AC19). |
| D-9 | El buscador navega con `router.push()` a la ficha y ya no toca `setCategoryFilter` | Mantener el salto al catálogo por categoría | Era una solución de espera con su motivo escrito en el propio archivo. Elegir un resultado concreto y aterrizar en «todos los monitores» es una respuesta a una pregunta distinta de la que se hizo. |
| D-10 | El ítem de reserva del buscador aplica el **término** al catálogo, para lo cual `ui.store` gana `catalogQuery` y `CatalogSection` lo pasa como `q` | Que el ítem de reserva salte a `#catalogo` sin aplicar nada | «Navegar al catálogo con el filtro aplicado» solo es cierto si el filtro existe. Sin `q`, el visitante que busca «ssd» aterrizaría en el catálogo completo, que es peor que no moverse. Además resuelve el caso real de que el overlay muestra 6 resultados (`CATALOG_SEARCH_LIMIT`) y la búsqueda puede tener más. |
| D-11 | El ítem de reserva se renderiza siempre que hay término, también con 0 resultados | Ofrecerlo solo cuando hay resultados | Con 0 resultados y sin ítem seleccionable, `Enter` no hace nada y el overlay parece roto. Con él, el visitante llega al estado vacío del catálogo, que nombra el término y ofrece los filtros de categoría: es una salida, no un callejón. |
| D-12 | JSON-LD `Product` inline en la ficha; `sitemap.xml` se queda fuera | Hacer los dos ahora | El JSON-LD es marcado de esta página y sale de datos que el render ya tiene en memoria: coste cero. El sitemap es infraestructura de indexación —consulta de slugs, `lastModified`, política de rutas excluidas— y merece su propia decisión. |
| D-13 | Precio del JSON-LD en unidades con 2 decimales, derivado de los céntimos en el punto de serialización | Publicar los céntimos | `schema.org/Offer.price` se interpreta en la moneda de `priceCurrency`; publicar `129990` con `PEN` afirma un precio mil veces mayor. La conversión vive solo en ese componente; el resto de la app sigue en enteros (CLAUDE.md §6). |
| D-14 | Layout asimétrico: media a la izquierda (≈7 columnas de 12) e información a la derecha, en columna única bajo 900 px; la ficha técnica como lista de definición con filas de línea fina | Rejilla 50/50 con «caja de compra» flotante | La foto real que sirve el proveedor es apaisada (≈1.75:1, ver `product-media.tsx`) y una columna de media estrecha la deja diminuta dentro del marco `object-contain`. El dispositivo estructural es la propia ficha técnica: los pares clave/valor son datos reales del producto, así que las filas *son* contenido y no decoración —a diferencia de numeradores `01/02/03`, que aquí no describirían ninguna secuencia real (`frontend-design`)—. |
| D-15 | Sin animaciones nuevas: la ficha reutiliza `<Reveal>` donde aporte y hereda `MotionConfig reducedMotion="user"` del layout | Secuencia de entrada propia de la ficha | El presupuesto de movimiento del storefront ya está gastado en la portada (spec 004 D-4). Una página cuyo trabajo es que se lea la especificación no gana nada con animación, y sí pierde en `prefers-reduced-motion` mal cubierto (AC22). |
| D-16 | AC14 acepta el stepper «−／cantidad／+» como grupo de control válido (no solo el botón de añadir); sus botones se ajustan a 44px | Revertir el stepper en `ProductCard`, o volverlo no-tabulable con `tabIndex={-1}` | El stepper de `add-to-cart-button.tsx` es una feature aprobada y verificada en navegador por el usuario en paralelo a este spec (fuera de su alcance formal, pero comparte componente con T13/T15 vía `related-products.tsx` → `ProductCard`). Revertirlo deshace trabajo ya aceptado; volverlo no-tabulable degrada el teclado sin necesidad. AC14 se corrige para pedir «sin anidamiento y foco visible en todas las paradas del grupo de cantidad», sin fijar el número exacto de botones. AC21 no cambia: los botones del stepper suben de `size-9` a `size-11` (44px) para cumplirlo donde sea que aparezca. |

**Skills.** Consultada `frontend-design` para D-14 (la dirección visual de la
ficha es UI nueva: `docs/design/` solo trae portada y versión móvil, sin página
de producto). `security-review` no se invoca porque esta feature no toca
autenticación, permisos ni datos protegidos: toda su superficie es pública por
diseño y las comprobaciones relevantes están en §10.
**No están instaladas** en esta sesión, y por tanto no se han usado:
`superpowers:brainstorming`, `superpowers:writing-plans`, `vercel:nextjs`,
`vercel:next-cache-components` y `vercel:vercel-storage`.

## 9. Tareas

### Fase 1 — Datos

- [x] **T1** — Añadir el tipo `CatalogProductDetail` (`CatalogProduct & { specs }`) · archivo: `src/modules/products/types/catalog.types.ts` · verificación: `npm run typecheck`
- [x] **T2** — Implementar `findPublicBySlug(slug)`: `innerJoin` a `categories`, filtro invariante de §6.3, `CATALOG_COLUMNS` + `specs`, `limit(1)`, devuelve `CatalogProductDetail | null` · archivo: `src/server/repositories/product.repository.ts` · verificación: `npm run typecheck`
- [x] **T3** — Añadir `getPublicProductBySlug = cache((slug) => …)` para que página y `generateMetadata` compartan una sola consulta · archivo: `src/server/services/catalog.service.ts` · verificación: `npm run typecheck`
- [x] **T4** — Añadir `RELATED_PRODUCTS_SIZE = 4` · archivo: `src/modules/products/constants.ts` · verificación: `npm run typecheck`

### Fase 2 — API pública

- [x] **T5** — Exportar `catalogSlugParamSchema` reutilizando `productSlugSchema` · archivo: `src/modules/products/schemas/catalog.schema.ts` · verificación: `npm run typecheck`
- [x] **T6** — Implementar `GET /api/products/[slug]`: `RouteContext<'/api/products/[slug]'>`, `await context.params`, validación Zod antes de consultar, 404 sin distinguir causa, `Cache-Control`, `toErrorResponse` para el 500 · archivo: `src/app/api/products/[slug]/route.ts` · verificación: `curl` de los cuatro casos (AC3, AC4, AC5) y `curl -I` para la cabecera

### Fase 3 — La ficha

- [x] **T7** — `not-found.tsx` del storefront: mensaje, enlace a la portada y al catálogo, con la identidad del storefront · archivo: `src/app/(storefront)/not-found.tsx` · verificación: abrir `/products/no-existe` (AC2)
- [x] **T8** — `loading.tsx` de la ficha con la silueta real (media + columna de información + tira de relacionados), no un esqueleto genérico · archivo: `src/app/(storefront)/products/[slug]/loading.tsx` · verificación: `npm run build`
- [x] **T9** — `ProductBreadcrumb`: Inicio → categoría (`CategoryJumpLink`) → nombre, con `nav aria-label` y el último elemento sin enlace · archivo: `src/modules/storefront/components/product-breadcrumb.tsx` · verificación: `npm run typecheck`
- [x] **T10** — `ProductSpecList`: lista de definición a partir de `specs`, devuelve `null` con `specs` nulo o vacío · archivo: `src/modules/storefront/components/product-spec-list.tsx` · verificación: AC7
- [x] **T11** — `ProductJsonLd`: `<script type="application/ld+json">` con `Product`, `offers` (precio en unidades, `PEN`, `availability` desde `stockLevel`) e `image` solo si hay `imageUrl` · archivo: `src/modules/storefront/components/product-json-ld.tsx` · verificación: AC10
- [x] **T12** — `ProductDetail`: composición de media, breadcrumb, categoría, nombre, descripción, precio con tachado y badge, señal de stock, `AddToCartButton variant="full"` y ficha técnica, en el layout de D-14 · archivo: `src/modules/storefront/components/product-detail.tsx` · verificación: AC8, AC9, AC21
- [x] **T13** — `RelatedProducts`: recibe la lista ya leída, reutiliza `ProductCard` y devuelve `null` con lista vacía · archivo: `src/modules/storefront/components/related-products.tsx` · verificación: AC12
- [x] **T14** — `page.tsx` de la ficha: `await params`, validación del slug, `getPublicProductBySlug()`, `notFound()` si es null, lectura de relacionados descartando el propio producto, composición y `generateMetadata` sobre la misma lectura memoizada · archivo: `src/app/(storefront)/products/[slug]/page.tsx` · verificación: AC1, AC2, AC11, AC12, AC23

### Fase 4 — Enlaces a la ficha

- [x] **T15** — Enlace extendido en `ProductCard` (nombre como `<Link>` con `after:absolute after:inset-0`, botón de carrito elevado con `relative z-[1]`) · archivo: `src/modules/storefront/components/product-card.tsx` · verificación: AC13, AC14
- [x] **T16** — Enlace a la ficha en la tarjeta destacada y en las secundarias de ofertas, con el mismo patrón · archivo: `src/modules/storefront/components/deals-section.tsx` · verificación: AC13
- [x] **T17** — Enlace a la ficha desde el slide destacado · archivo: `src/modules/storefront/components/featured-slider.tsx` · verificación: AC13
- [x] **T18** — Enlace a la ficha desde la tarjeta del hero · archivo: `src/modules/storefront/components/hero-visual.tsx` · verificación: AC13

### Fase 5 — Buscador y navegación del chrome

- [x] **T19** — Añadir `catalogQuery` y `setCatalogQuery` al store de UI · archivo: `src/modules/storefront/store/ui.store.ts` · verificación: `npm run typecheck`
- [x] **T20** — `CatalogSection`: pasa `q: catalogQuery || undefined` al hook, restringe `initialData` a `category === 'all' && catalogQuery === ''`, muestra un chip con el término activo y su ✕, y nombra el término en el estado vacío · archivo: `src/modules/storefront/components/catalog-section.tsx` · verificación: AC16, AC17, AC18
- [x] **T21** — `SearchDialog`: `onSelect(product)` → cierre, limpieza del término y `router.push('/products/' + product.slug)`; ítem de reserva «Ver … en el catálogo» → `setCatalogQuery`, `setCategoryFilter('all')` y `router.push('/#catalogo')`; se elimina el salto por categoría y el `getElementById` · archivo: `src/modules/storefront/components/search-dialog.tsx` · verificación: AC15, AC16, AC17
- [x] **T22** — `STOREFRONT_NAV` con hrefs relativos a la raíz (`/#ofertas`, …) y actualización del comentario que decía que la ficha no existe · archivo: `src/modules/storefront/constants.ts` · verificación: `npm run typecheck`
- [x] **T23** — Header: la navegación principal pasa de `<a>` a `<Link>` · archivo: `src/modules/storefront/components/storefront-header.tsx` · verificación: AC19, AC20
- [x] **T24** — Menú móvil: navegación y CTA «Ver el catálogo» a `<Link href="/#catalogo">` · archivo: `src/modules/storefront/components/mobile-menu.tsx` · verificación: AC19
- [x] **T25** — Footer: la navegación pasa a `<Link>` · archivo: `src/modules/storefront/components/storefront-footer.tsx` · verificación: AC19
- [x] **T26** — `CategoryJumpLink`: `<a href="#catalogo">` → `<Link href="/#catalogo">`, conservando el `onClick` que fija el filtro · archivo: `src/modules/storefront/components/category-jump-link.tsx` · verificación: AC19, AC20

### Fase 6 — Cierre

- [x] **T27** — Verificación final · verificación: `npm run typecheck && npm run lint && npm run build` (AC23)

## 10. Riesgos y consideraciones

- **Endpoint sin consumidor.** Es el riesgo consciente de D-2: código que nadie
  ejercita se pudre en silencio. Mitigación: los AC3–AC5 se verifican con `curl`
  en T6 y quedan escritos aquí; si la revisión lo prefiere, se retira.
- **Fuga por el payload RSC.** El DTO recorta bien, pero cualquier campo extra
  que se pase a un Client Component viaja serializado al navegador. `ProductDetail`
  y `RelatedProducts` deben permanecer en el servidor y pasar a los hijos cliente
  (`AddToCartButton`, `ProductMedia`) solo lo que ya consumen hoy.
- **Regresión de las anclas.** T22–T26 tocan navegación que funciona. El fallo
  silencioso sería convertir el desplazamiento de la portada en una recarga
  completa; AC20 existe para eso y hay que comprobarlo en la portada, no solo en
  la ficha.
- **Estado del catálogo entre páginas.** `catalogQuery` y `categoryFilter` viven
  en Zustand sin `persist`: sobreviven a la navegación de cliente y se pierden en
  una recarga completa. Es la razón de que T21 y T26 naveguen con `next/link` y
  `router.push` y no con un `<a>` que fuerce recarga. Un visitante que pegue
  `/#catalogo` en la barra de direcciones verá el catálogo sin filtro, que es
  correcto.
- **Caché de 60 segundos.** Igual que en 004: un cambio de precio desde el panel
  tarda hasta un minuto en verse en la ficha, y el JSON-LD publicado puede ir un
  minuto por detrás del precio real. Aceptable para un catálogo; el día que haya
  invalidación por etiqueta, la ficha es la primera candidata.
- **`imageUrl` de host no permitido.** `ProductMedia` ya degrada a arte SVG por
  `onError`, pero en la ficha la imagen ocupa media pantalla y el `priority` la
  convierte en el LCP. Si degrada, el LCP pasa a ser el SVG. No es un fallo, pero
  conviene saberlo antes de medir.
- **Consulta doble por render.** Sin `cache()` en T3, `generateMetadata` y el
  render harían dos viajes a Neon por cada visita a la ficha. Es el error fácil
  de esta feature.
- **Enlaces anidados.** El patrón de enlace extendido se replica en cuatro
  archivos (T15–T18). Si en alguno se envuelve la tarjeta entera en `<Link>`, el
  botón de añadir queda dentro de un ancla y AC14 se rompe solo ahí.
- **Slugs duplicados.** `products.slug` es `unique` en el esquema, así que
  `limit(1)` no puede ocultar una segunda fila. Si esa restricción cayera, la
  ficha mostraría un producto arbitrario en vez de fallar.
- **Sin límite de tasa.** `GET /api/products/[slug]` hereda la exposición anónima
  de los endpoints del spec 004: una consulta a Neon por petición, protegida en
  el borde y no en el origen.

## 11. Fuera de alcance / deuda aceptada

| Diferido | Cuándo retomarlo |
|---|---|
| Página `/products` (catálogo con filtros en la URL, paginación y estado compartible) | Cuando el catálogo pase de una pantalla de rejilla o cuando haga falta enlazar una búsqueda. Hoy `catalogQuery` vive en memoria y no se puede compartir por URL: esa es la limitación real que lo justificará. |
| `sitemap.xml` y `robots.txt` | Junto con la página `/products`, que es la que da la lista de URLs indexables. |
| Galería de imágenes (`product_images`) y zoom | Cuando exista subida de imágenes; hoy el modelo tiene una sola `image_url`. |
| Valoraciones, reseñas y preguntas sobre el producto | Necesitan tabla, verificación de compra y moderación. Spec propio, ya anotado en 004. |
| «Modelo» o referencia visible en la ficha | Si comercialmente hace falta, se añade un campo propio: el SKU no se publica (D-6). |
| Selector de cantidad y compra directa desde la ficha | Con el checkout. |
| Productos vistos recientemente y recomendaciones que no sean «misma categoría» | Cuando haya datos de comportamiento; hoy sería inventarlos. |
| Índice de texto completo (`pg_trgm` / `tsvector`) para el buscador | A partir de unos miles de productos, igual que en 004. |
| Invalidación de caché por etiqueta al mutar desde el admin | Cuando la ventana de 60 s moleste de verdad; la ficha es el primer sitio donde se notará. |
| Cuerpo del 404 renderizado en el servidor (hoy solo tras hidratar, §12.6) | Cuando Next server-renderice los boundaries `not-found.tsx` de segmento, o si hiciera falta que un visitante sin JavaScript lea el mensaje del 404. |

## 12. Notas de implementación

Dos desviaciones respecto al plan, ambas descubiertas al verificar y ninguna
prevista en §7. Se dejan escritas aquí porque el reviewer tiene que arbitrarlas.

### 12.1 `src/proxy.ts` — punto sin escapar en el matcher (corregido)

§7 dice que esta feature no toca `src/proxy.ts`. Hubo que tocarlo: el matcher
llevaba `'[^?]*\.(?:html?|css|…|ico|…)'` en una **cadena**, donde `\.` se parsea
como `.` y por tanto casa con cualquier carácter. La exclusión de estáticos se
disparaba con cualquier ruta que *contuviera* una de esas extensiones — y
`/products/teclado-mecanico-…` contiene «ico» dentro de «mecan**ico**». Esas
páginas quedaban fuera del proxy, `auth()` no encontraba `clerkMiddleware()` y el
render terminaba en `500`, así que AC1 fallaba para parte del catálogo real.

La corrección es escapar el punto (`\\.`). No se añade lógica de auth: el proxy
sigue siendo `clerkMiddleware()` y su `matcher` (CLAUDE.md regla 9). Es un fallo
preexistente del spec 004 que esta feature es la primera en destapar, porque
hasta ahora ninguna ruta del storefront llevaba el slug en la URL.

### 12.2 AC2 — el cuerpo del 404 es correcto, el status es `200`

`notFound()` renderiza el `not-found.tsx` del storefront con header y footer, y
Next inyecta `<meta name="robots" content="noindex">`. Lo que **no** se cumple es
el código de estado: llega `200`.

Aislado con páginas sonda sobre el build de producción (Next 16.3.3):

| Sonda | Status |
|---|---|
| `notFound()` en `src/app/probe-404` (fuera del grupo) | `404` |
| `notFound()` en `src/app/(storefront)/probe-a` | `200` |
| lo mismo, tras retirar `src/app/(storefront)/loading.tsx` | `404` |

La causa es el `loading.tsx` del segmento: envuelve a sus hijos en un `Suspense`
cuyo *shell* está listo de inmediato, así que la respuesta empieza a emitirse —y
con ella la línea de estado— antes de que el render llame a `notFound()`. Afecta
a los dos: el `loading.tsx` del storefront (spec 004) y el de la ficha (T8).
Resolver AC2 al pie de la letra obliga a retirar ambos y a perder el esqueleto de
carga que T8 pide de forma explícita, así que **T8 y AC2 se contradicen** y la
implementación mantiene T8.

Se descartó por comprobación, no por criterio: llamar a `notFound()` desde
`generateMetadata` tampoco cambia el status, y retirar el `<Suspense>` del
`layout.tsx` del storefront tampoco.

**Arbitraje del reviewer (iteración 1):** falsado con sondas adicionales — hay
un camino que da `404` real **sin** perder el esqueleto de T8: mover la
validación del slug y `notFound()` a un `products/[slug]/layout.tsx` (queda
fuera del `Suspense` de su propio `loading.tsx`) y sustituir
`(storefront)/loading.tsx` por un `<Suspense>` **dentro** de
`(storefront)/page.tsx` (ruta hermana, no abre boundary sobre la ficha). La
contradicción real no era AC2 ↔ T8, sino AC2 ↔ el `loading.tsx` de nivel
storefront heredado del spec 004. Hallazgo bloqueante para la iteración 2.

**Resuelto (iteración 2).** Implementado tal cual lo arbitró el reviewer:

- `src/app/(storefront)/products/[slug]/layout.tsx` valida el slug y llama a
  `getPublicProductBySlug()`; si no hay producto, `notFound()`. Al estar por
  encima del `Suspense` que abre su propio `loading.tsx`, el render bloquea antes
  de emitir la primera línea y el status sale `404`. La consulta no se duplica:
  `cache()` hace que `page.tsx` y `generateMetadata` reutilicen esa promesa.
- `src/app/(storefront)/loading.tsx` se elimina. Su contenido pasa a
  `HomeSkeleton` y la portada abre su propio `<Suspense>` alrededor de
  `HomeContent`, así que el boundary ya no cubre `/products/[slug]`.
- `page.tsx` de la ficha conserva su `notFound()` como red de seguridad.

Verificado sobre el build de producción (`next start -p 3999`):

| Sonda | Status |
|---|---|
| `GET /products/no-existe` | `404`, cuerpo «Este producto no está en el catálogo» con header y footer |
| `GET /products/NO_VALIDO` (slug fuera de patrón) | `404` |
| `GET /products/teclado-mecanico-keychron-k2-rgb` | `200` |
| `GET /` | `200`, con el esqueleto (`animate-pulse`) en el primer flush, antes del contenido real |

### 12.3 Corrección a un hallazgo del reviewer: `globals.css:277-314` no es un no-op

El reviewer (iteración 1) marcó como "menor" el cambio en el selector de
`dialog-overlay`/`sheet-overlay`, afirmando que el bloque «solo declara custom
properties» y que el comentario describe un mecanismo inexistente. Es un
error de lectura: citó el rango 277-285 (comentario + selector), pero la
declaración `background-color: var(--background);` está en la línea 311 del
**mismo** bloque, fuera de ese rango. Verificado con capturas de navegador
antes/después del fix (sesión principal, sin sondas descartables): con
`dialog-overlay` incluido en el selector, `getComputedStyle(overlay)
.backgroundColor` daba `rgb(250, 250, 252)` opaco —el fondo tapaba la portada
entera, que es el bug de foco reportado por el usuario—; retirado del
selector, el overlay vuelve a su `bg-black/10` translúcido. El cambio se
mantiene tal cual; no se revierte en la iteración 2.

### 12.4 AC14 / AC21 — tamaño táctil del stepper (corregido en la iteración 2)

Los dos botones del stepper de `add-to-cart-button.tsx` (rama `quantity > 0`)
pasan de `size-9` (36 px) a `size-11` (44 px), el mismo mínimo que ya usa
`CartLineRow` en el drawer. El contenedor pierde su `h-11` fijo —con botones de
44 px los recortaba— y toma su altura de los botones, conservando borde, `p-0.5`
y `gap-0.5` del patrón del drawer. El stepper no se revierte ni se saca de la
secuencia de tabulación: D-16 lo acepta como grupo de control válido de AC14.

### 12.5 Estado de los hallazgos de la iteración 1

| Hallazgo | Estado |
|---|---|
| BLOQUEANTE — AC2 responde `200` en vez de `404` | Corregido (§12.2, verificado con build de producción) |
| BLOQUEANTE — stepper de 36 px incumple AC21 | Corregido (§12.4) |
| Menor — `globals.css:277-314` sería un no-op | Descartado por error de lectura del reviewer (§12.3); el archivo no se toca |

### 12.6 Verificación del reviewer (iteración 2)

Repetida de cero sobre un build de producción propio (`next start`), sin apoyarse
en el reporte del developer.

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | ✓ (exit 0) |
| `npm run lint` | ✓ 0 errores. 6 avisos preexistentes de `react-hooks/incompatible-library` en las tablas del panel, ajenos a este spec |
| `npm run build` | ✓, con `/products/[slug]` y `/api/products/[slug]` como rutas dinámicas (AC23) |
| `GET /products/<slug real>` | `200`, cuerpo servido desde el servidor: 37 KB de HTML con `h1`, migas, header, footer, 3 pares `dt`/`dd` y JSON-LD (AC1, AC7, AC10, AC11) |
| `GET /products/no-existe`, `/products/NO_VALIDO` y `/products` | `404` los tres (AC2, la mitad del estado) |
| `GET /` | `200`, con `animate-pulse` en el byte 16 584 y el primer producto real en el 83 797: el esqueleto sigue llegando antes que el contenido, sin regresión (§12.2) |
| `GET /api/products/<slug>` | `200` con `public, s-maxage=60, stale-while-revalidate=300` (AC3) |
| `GET /api/products/NO_VALIDO` y con espacio | `400` con `{ message, issues }` (AC4) |
| `GET /api/products/no-existe` | `404` con `{ message }` (AC5) |
| Fuga de campos internos | Ni `sku`, ni `stock`, ni `isActive`, ni `categoryId` en la respuesta de la API ni en el payload RSC de la ficha (AC6) |
| Anidamiento de interactivos | 0 en la ficha (28 anclas, 10 botones) y 0 en la portada (71 anclas, 43 botones), contados sobre el HTML servido (AC14) |
| Tamaño táctil del stepper | `size-11` gana a `size-8` del variant `icon` porque `cn()` pasa por `tailwind-merge`: 44 px reales (AC21, §12.4) |
| Foco visible | La regla `[data-surface='storefront'] :is(a, button):focus-visible` de `globals.css:227` cubre las dos paradas de la tarjeta (AC14) |
| `globals.css` | Sin tocar desde la iteración 1: un solo hunk, el ya aceptado en §12.3 |

**Salvedad sobre AC2.** El estado es `404` real, pero el cuerpo **no** se renderiza
en el servidor: `/products/no-existe` llega con un `<body>` de 58 caracteres y el
`not-found` del storefront —header, footer y mensaje— solo aparece tras hidratar,
desde el payload RSC. No es un defecto de esta implementación: se reprodujo con una
sonda aislada (`src/app/rev-probe2`, un `not-found.tsx` con un `h1` pelado y una
`page.tsx` que solo llama a `notFound()`), que dio el mismo cuerpo vacío fuera del
grupo `(storefront)` y sin `layout.tsx` intermedio. En Next 16.3.3 todo boundary
`not-found.tsx` **de segmento** se entrega así; solo el `/_not-found` de la raíz
—que es una ruta prerenderizada de verdad, no un boundary— se sirve renderizado.
La única alternativa que sí renderizaría es dejar caer el 404 en el de la raíz, que
es justo lo que D-5 descartó. Se acepta como deuda (§11): el rastreador recibe el
`404` y el `noindex`, que es lo que decide la indexación, y el visitante con
JavaScript ve la página completa. La sonda quedó eliminada; el árbol de trabajo no
conserva nada del reviewer.

**No verificado.** El reviewer no dispone de herramientas de navegador en esta
sesión, así que AC15–AC18 (buscador, chip del término, estado vacío), AC19–AC20
(anclas sin recarga) y la ausencia de scroll horizontal de AC21 quedan comprobados
solo por lectura del código, no en ejecución. AC9 tampoco pudo ejercitarse: los 20
productos publicables de la base están en `stockLevel: 'in'`, así que la rama de
agotado —badge `STOCK_LABELS.out` = «Agotado» y `disabled` en el botón— está
trazada en `product-detail.tsx` y `add-to-cart-button.tsx` pero no observada.

### 12.7 [BLOQUEANTE, iteración 3] AC19 — las anclas del chrome no hacen scroll al navegar desde la ficha

Verificado en navegador real (sesión principal, Chrome conectado) lo que el
reviewer no pudo ejercitar en su §12.6. AC15–AC18 y AC13/AC14 en vivo salieron
bien: el buscador muestra el overlay difuminado (no opaco), navega a la ficha
correcta, y el ítem de reserva «Ver «teclado» en el catálogo» aparece. Pero
**AC19 falla de verdad**:

1. Desde `/products/teclado-mecanico-keychron-k2-rgb`, clic en «Catálogo» del
   header → la URL cambia a `/#catalogo` (navegación de cliente confirmada, sin
   recarga) pero la página **no hace scroll**: `window.scrollY` se queda en `0`
   con `document.getElementById('catalogo')` existiendo a `2934px` de la
   parte superior.
2. Control: cargar `http://localhost:3000/#catalogo` de cero (recarga completa)
   sí deja `scrollY: 2839` — el scroll al hash funciona cuando es el navegador
   quien lo hace en la carga inicial.

**Causa.** Las cuatro secciones ancladas por `STOREFRONT_NAV`
(`#ofertas` → `DealsSection`, `#categorias` → `CategoriesSection`,
`#catalogo` → `CatalogSection`, `#ventajas` → `FeaturesSection`) viven dentro
de `HomeContent`, que el propio fix de AC2 (§12.2) envolvió en
`<Suspense fallback={<HomeSkeleton />}>` (`src/app/(storefront)/page.tsx:60-66`).
Al navegar desde otra ruta con `next/link`, el router intenta el scroll al
hash contra lo que hay montado en ese momento —el *fallback*, que no tiene
ninguno de esos `id`— y no reintenta cuando `HomeContent` termina de resolver
y los ids reales aparecen. No es un defecto de `CatalogSection` ni de
`CategoryJumpLink`: afecta a las cuatro anclas por igual y es consecuencia
directa de mover todo `HomeContent` a un único `Suspense`.

**No es el mismo problema que 12.2.** Aquello era sobre el *status* HTTP de un
boundary de ruta (`not-found.tsx`); esto es sobre el *scroll* del router a un
`id` que no existe todavía en el árbol montado. Ambos comparten la causa raíz
(un `<Suspense>` que difiere el montaje real), pero no tienen la misma solución
disponible: aquí no hay body vacío que aceptar como deuda, porque **si** hay
una corrección sin perder el esqueleto — el problema es de *scroll*, no de
*status*, así que no compite con lo que ya se resolvió en la iteración 2.

**Corrección sugerida (a validar por el developer):** un efecto de cliente,
una sola vez, que en el montaje de `HomeContent` (tras resolver el `Suspense`,
es decir con el contenido real ya en el DOM) compruebe `window.location.hash`
y haga `document.getElementById(hash.slice(1))?.scrollIntoView(...)` si hay
coincidencia. Al vivir en un componente que solo se monta cuando el contenido
real está listo (no en el fallback), no compite con el fix de AC2. Un único
componente cliente pequeño alcanza para las cuatro anclas — no hace falta
repetir el efecto por sección. Verificar también que no interfiere con AC20
(el scroll nativo del navegador para anclas *same-page* ya funciona hoy y no
debe duplicarse ni saltar).

### 12.8 AC19 — corregido con `HashScroll` (iteración 3)

Implementada la corrección sugerida en §12.7, en la forma mínima que la resuelve.

**`src/modules/storefront/components/hash-scroll.tsx`** (nuevo, cliente, no
renderiza nada): un `useEffect` sin dependencias que lee `window.location.hash`,
lo contrasta contra los ids derivados de `STOREFRONT_NAV` y hace
`document.getElementById(id)?.scrollIntoView()`.

Tres decisiones dentro del componente:

- **Los ids se derivan de `STOREFRONT_NAV`**, no se escriben a mano
  (`href.replace(/^\/#/, '')`). Es la única fuente que ya declara esos destinos y
  cubre a la vez `CategoryJumpLink`, que apunta al mismo `/#catalogo`. Añadir una
  entrada al menú no obliga a tocar este archivo.
- **Se monta dentro de `HomeContent`**, no en `HomePage` ni en el layout: es
  exactamente el punto donde el `<Suspense>` ya resolvió y las cuatro secciones
  con sus `id` están en el DOM. Montarlo un nivel más arriba lo dejaría corriendo
  contra el mismo fallback que causa el fallo.
- **Sin `behavior: 'smooth'`.** En una carga directa con hash el navegador ya ha
  desplazado y la llamada resulta idempotente; animarla convertiría ese caso en
  un barrido visible. El `scroll-mt-24` de cada sección lo respetan por igual el
  camino nativo y `scrollIntoView`, y por eso los dos aterrizan en el mismo píxel.

**AC20 no se toca**: el efecto corre una única vez por montaje de `HomeContent`.
En la propia portada, pulsar una entrada del header no vuelve a montar nada, así
que el desplazamiento sigue siendo el nativo *same-document* y no hay un segundo
scroll compitiendo.

#### Verificación en navegador (Chrome real, CDP)

El agente no tenía las herramientas MCP de navegador en su contexto, así que se
condujo un Chrome real por el protocolo de DevTools con `chrome-launcher` y `ws`,
ambos ya presentes en `node_modules` (sin instalar nada). Viewport 1400×1000 para
que la navegación `lg:flex` del header esté visible. Servidor `npm run dev` en
`localhost:3000`. Cada fila parte de
`/products/teclado-mecanico-keychron-k2-rgb` con `scrollY = 0`, marca
`window.__probe` y pulsa el enlace con un clic real sobre el `<a>`.

| Caso | `scrollY` | `rect.top` del destino | Marca sobrevive |
|---|---|---|---|
| Header «Ofertas» → `/#ofertas` | 1152 | 96 | sí (navegación de cliente) |
| Header «Categorías» → `/#categorias` | 2095 | 96 | sí |
| Header «Catálogo» → `/#catalogo` | 2840 | 96 | sí |
| Header «Ventajas» → `/#ventajas` | 4695 | 96 | sí |
| Portada → `/#ventajas` (AC20) | 4695 | 96 | sí |
| Portada → `/#ofertas` (AC20) | 1152 | 96 | sí |
| Migas de la ficha, `CategoryJumpLink` «Periféricos» → `/#catalogo` | 2840 | 96 | sí, y el chip activo del catálogo es «Periféricos» |
| Control: carga completa cross-document de `/#catalogo` | 2840 | 96 | no (recarga real) |

`rect.top = 96` en las ocho filas es el `scroll-mt-24` de cada sección: el destino
queda justo bajo el header pegajoso, y el valor coincide con el de la carga
completa, que es el comportamiento de referencia. Antes del fix, la misma sonda
sobre «Catálogo» daba `scrollY: 0` con el elemento a 2934 px (§12.7).

La fila de control valida la sonda: en una navegación cross-document real la
marca `window.__probe` **no** sobrevive, mientras que en las siete anteriores sí,
lo que confirma que las siete fueron navegación de cliente sin recarga (AC19) y
que las dos de la portada siguen siendo *same-document* (AC20). El control de
§12.7 se repitió porque la primera pasada lo hizo yendo de `/#catalogo` a
`/#catalogo`, que el navegador resuelve como salto de hash y no como recarga.

#### Verificación del proyecto

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | ✓ |
| `npm run lint` | ✓ 0 errores, los mismos 6 avisos preexistentes de `react-hooks/incompatible-library` de §12.6 |
| `npm run build` | ✓, con `/products/[slug]` y `/api/products/[slug]` como rutas dinámicas |

### 12.9 Verificación del reviewer (iteración 3) — APROBADO

Repetida desde el Paso 1, sobre un build de producción propio (`next start -p 3999`),
sin apoyarse en el reporte del developer. El delta real de esta iteración son dos
archivos (`hash-scroll.tsx` nuevo y una línea en `page.tsx`, confirmado por mtime);
el resto se re-comprobó solo para descartar roturas de rebote.

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | ✓ exit 0 |
| `npm run lint` | ✓ 0 errores, los mismos 6 avisos preexistentes de `react-hooks/incompatible-library` en las tablas del panel |
| `npm run build` | ✓ con `/products/[slug]` y `/api/products/[slug]` como rutas dinámicas (AC23) |

**AC19 / AC20 verificados en Chrome real.** El reviewer tampoco tenía las
herramientas MCP de navegador en su contexto, así que condujo un Chrome headless
propio por CDP (`chrome-launcher` + `ws`, ya en `node_modules`), con sonda
independiente de la del developer: `window.__probe` para distinguir navegación de
cliente de recarga, y un **control negativo** que la primera pasada del developer
no llegó a tener limpio.

| Caso | `scrollY` | `rect.top` | `probeAlive` |
|---|---|---|---|
| Ficha → header «Catálogo» (`/#catalogo`) | 2840 | 96 | sí |
| Ficha → header «Ofertas» (`/#ofertas`) | 1152 | 96 | sí |
| Portada → header «Ventajas` (AC20) | 4695 | 96 | sí |
| Portada → header «Catálogo» (AC20) | 2840 | 96 | sí |
| Ficha → migas `CategoryJumpLink` «Periféricos» | 2840 | 96 | sí, y el chip `aria-pressed` del catálogo es «Periféricos» |
| Ficha → menú móvil «Ver el catálogo» (390 px) | 3804 | 96 | sí |
| **Control negativo**: carga cross-document ficha → `/#catalogo` | 2840 | 96 | **no** |

El control negativo es lo que valida la sonda: en una recarga real la marca **no**
sobrevive, luego las seis filas con `probeAlive: sí` fueron navegación de cliente
(AC19) y las dos de la portada siguieron siendo *same-document* (AC20). `rect.top = 96`
en las siete es el `scroll-mt-24`, idéntico al del camino nativo: no hay doble scroll
ni salto. La fila de migas añade la prueba de que el filtro de Zustand sobrevive al
salto, que es el motivo de que D-8 use `next/link`.

**Revisión del componente.** `HashScroll` está montado dentro de `HomeContent`
(`page.tsx:118`), no en `HomePage` — que es exactamente donde el fallo reaparecería.
Deriva los ids de `STOREFRONT_NAV` con `href.replace(/^\/#/, '')`, sin segunda lista
que mantener; los cuatro ids resultantes casan con los `id` reales de
`deals-section`, `categories-section`, `catalog-section` y `features-section`, los
cuatro con `scroll-mt-24`. Guarda correcta: hash vacío o desconocido sale por el
`return` sin tocar el scroll. Client Component hoja, sin render, sin `db` ni
repositorio (CLAUDE.md §4 reglas 1 y 7).

**Sin regresión de rebote.**

| Comprobación | Resultado |
|---|---|
| `/products/no-existe`, `/products/NO_VALIDO`, `/products` | `404` los tres (AC2) |
| `/products/<slug real>` y `/` | `200` |
| `globals.css` | Sin tocar desde la iteración 1: un solo hunk, el aceptado en §12.3 |
| Stepper | `size-11` en las dos ramas del `quantity > 0` (AC21, §12.4) |
| `/api/products/<slug>` | `200` con `public, s-maxage=60, stale-while-revalidate=300` (AC3) |
| `/api/products/NO_VALIDO` | `400` con `{ message, issues }`, sin consulta (AC4) |
| `/api/products/no-existe` | `404` con `{ message }` (AC5) |
| Fuga de campos internos | 0 en la API y 0 en el payload RSC de la ficha (AC6) |
| JSON-LD | `Product`, `offers.price: "459.00"`, `PEN`, `InStock` (AC10); `<title>` y `og:title` con el nombre real (AC11); 3 pares `dt`/`dd` (AC7) |
| Anidamiento de interactivos | 0 en el DOM vivo de la ficha (21 anclas, 10 botones) y de la portada (64 anclas, 43 botones) (AC14) |
| Scroll horizontal a 390 px | Ninguno, ni en la ficha ni tras el salto al catálogo (AC21) |
| Cadena de auth tras el fix del matcher (§12.1) | `/api/admin/products` y `/api/admin/users` sin sesión → `401`; `/admin/products` → `307`. El proxy más ancho no abrió ningún recurso protegido |

**Skills.** `superpowers:verification-before-completion` no está instalada en esta
sesión. `security-review` sí lo está y **no** se ejecutó como pase completo: el delta
de la iteración 3 no toca autenticación, autorización, roles, permisos, auditoría ni
datos personales, y la única superficie sensible del spec (el matcher de `proxy.ts`)
se comprobó de forma empírica en la tabla anterior, que es evidencia más fuerte que
una relectura del mismo diff ya arbitrado en la iteración 2.

**Veredicto: APROBADO.** Cero hallazgos bloqueantes y cero mayores. El spec pasa a
`status: done`. La deuda de §11 —cuerpo del 404 sin renderizar en servidor— sigue
aceptada y no cambia.
