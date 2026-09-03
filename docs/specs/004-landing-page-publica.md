---
id: 004
title: Landing page pública y API de catálogo
status: done
module: shared
scope: client
created: 2026-09-02
---

# 004 — Landing page pública y API de catálogo

## 1. Contexto

La raíz del sitio (`src/app/(storefront)/page.tsx`) es hoy un placeholder con un
titular, un botón al panel y la frase «El catálogo público llega en la Fase 2».
El commit `685d9c0` retiró los enlaces del header y de la portada porque
apuntaban a rutas inexistentes: la tienda no tiene cara pública.

Al mismo tiempo la base ya tiene catálogo real: 7 categorías y 8 productos
sembrados, con CRUD de administración cerrado en los specs 001 (categorías) y
003 (productos). Los datos existen y nadie los ve.

`docs/design/` contiene una landing estática completa y aprobada por el usuario
como dirección visual (`index.html`, `mobile.html`, `src/styles.css`,
`src/app.js`). Esta fase la convierte en la portada real del proyecto y abre los
dos primeros endpoints públicos que la alimentan.

## 2. Objetivo

Un visitante sin sesión entra en `/` y ve el catálogo real de Neon —categorías
con su número de productos y fichas con precio, descuento y disponibilidad—,
puede filtrarlo por categoría, buscarlo con `⌘K` y añadir al carrito local, con
la identidad visual de `docs/design/`.

## 3. Alcance

### Incluye

- Landing en la raíz (`/`), portada del grupo `(storefront)`, con datos reales de
  Neon en el primer render (Server Component → repositorio, `docs/SETUP.md` §4).
- Dos Route Handlers **públicos**: `GET /api/products` y `GET /api/categories`,
  validados con Zod y servidos desde los repositorios existentes.
- Capa cliente completa del flujo: schemas → service (axios) → hook (TanStack
  Query) → componentes, para el filtrado y la búsqueda en vivo.
- Porte del sistema de tokens de `docs/design/src/styles.css` a `globals.css`,
  **acotado al storefront**, sin tocar la paleta del panel admin.
- Secciones: barra de avisos, header sticky, hero, marquee de categorías,
  ofertas, categorías, catálogo con filtros, ventajas y footer.
- Overlays: buscador `⌘K`, drawer de carrito y menú móvil.
- Carrito **local** (Zustand + `localStorage`): añadir, cantidades, subtotal,
  barra de envío gratis. Sin checkout.
- Una columna nueva en `products`: `compare_at_price_cents`, y su campo en el
  formulario del admin, para que el precio tachado y el badge de descuento sean
  datos reales.
- Instalación de `motion`. Componente shadcn `command` (arrastra `cmdk`).

### No incluye (explícito)

- **`swiper`**: no se instala. El diseño no tiene ningún carrusel de slides — el
  marquee es una traslación lineal infinita, la fila de filtros es `overflow-x`
  con `scroll-snap` y el catálogo es un CSS grid. Detalle en §8, D-2.
- Página de catálogo `/products` y ficha de producto `/products/[slug]`. La
  landing filtra en su propia sección; el enlace a la ficha no existe todavía.
- Checkout, pedidos y carrito persistido en servidor.
- Newsletter: la sección del diseño se omite. Requiere tabla, endpoint público
  de escritura y control de abuso — spec propio (§11).
- Valoraciones y reseñas (`4,9 ★ (312)` del diseño): no hay tabla ni datos.
- Cuenta atrás de la oferta y barra «quedan 7 de 30 unidades»: no hay vigencia de
  promoción ni stock inicial en el modelo. Se sustituyen por señales reales (§8, D-6).
- Marcas del marquee (APEX, NOVA…): son inventadas. El marquee pasa a mostrar las
  categorías reales.
- Wishlist / favoritos: el corazón de la tarjeta no se implementa (no hay tabla).
- Subida de imágenes de producto. Se usa `imageUrl` tal cual lo guarda el admin.

## 4. Criterios de aceptación

- [ ] **AC1** — Dado un visitante **sin sesión**, cuando abre `/`, entonces ve la
      landing completa con datos de Neon y no se le redirige a `/sign-in`.
- [ ] **AC2** — Dado un visitante sin sesión, cuando hace `GET /api/products`,
      entonces recibe `200` con `{ data, meta }` y ninguna llamada a `authorize()`
      interviene.
- [ ] **AC3** — Dado un producto con `is_active = false`, o cuya categoría tiene
      `is_active = false`, cuando se piden los productos públicos, entonces no
      aparece en `data` ni cuenta en `meta.total`.
- [ ] **AC4** — Dada una categoría **inactiva**, cuando se pide
      `GET /api/categories`, entonces no aparece; y tampoco aparece ninguna
      categoría **activa con 0 productos publicables**, como es hoy el caso de
      `Tablets` y de `cables`.
      > Corregido en revisión: el enunciado original decía que `Tablets` tenía
      > `is_active = false` «en el seed». El seed la declara así, pero la fila en
      > Neon está **activa** con 0 productos. Quien la excluye es el `innerJoin`
      > contra `products` con `products.is_active = true` de
      > `findPublicWithCounts()`: con join interno, una categoría sin productos
      > activos no genera ninguna fila, así que no llega a formar grupo y el
      > `HAVING count > 0` ni siquiera la evalúa —es red de seguridad por si la
      > condición del join cambia, no el mecanismo que la filtra hoy—. Lo mismo
      > le ocurre a `cables`. La exclusión de categorías inactivas la aplica
      > aparte el `where(eq(categories.isActive, true))`.
- [ ] **AC5** — Dado `GET /api/products?page=0` o `?sort=cualquier-cosa`, cuando
      se ejecuta, entonces responde `400` con `{ message, issues }` y no consulta
      la base.
- [ ] **AC6** — Dada la respuesta de `GET /api/products`, cuando se inspecciona un
      elemento de `data`, entonces **no** contiene `sku`, `stock`, `isActive`,
      `specs` ni `categoryId`; la disponibilidad viaja como `stockLevel`.
- [ ] **AC7** — Dado el catálogo de la landing, cuando el usuario pulsa el filtro
      de una categoría, entonces la rejilla se repuebla desde `/api/products` y la
      altura no colapsa mientras carga (`placeholderData`).
- [ ] **AC8** — Dado que el servidor ya renderizó la primera página del catálogo,
      cuando hidrata el cliente, entonces **no** se dispara una segunda petición
      para esos mismos parámetros (`initialData` en el hook).
- [ ] **AC9** — Dado el catálogo con un filtro sin resultados, cuando termina la
      carga, entonces se muestra el estado vacío; y si la petición falla, un
      estado de error con acción de reintento.
- [ ] **AC10** — Dado el buscador, cuando el usuario pulsa `⌘K` / `Ctrl+K`,
      entonces se abre el overlay, el foco entra en el input, `Esc` lo cierra y
      el foco vuelve al disparador.
- [ ] **AC11** — Dado el buscador abierto, cuando el usuario escribe, entonces los
      resultados salen de `/api/products?q=` con debounce y se navegan con `↑ ↓`
      y `Enter`.
- [ ] **AC12** — Dado un producto en el carrito, cuando el usuario recarga la
      página, entonces la línea sigue ahí (`localStorage` versionado) y el contador
      del header coincide con la suma de cantidades.
- [ ] **AC13** — Dado un producto con `compare_at_price_cents > price_cents`,
      cuando se pinta su tarjeta, entonces muestra el precio tachado y el badge
      `−N %`, con `N` calculado en el servidor; y si no lo tiene, no muestra
      ninguno de los dos.
- [ ] **AC14** — Dado que ningún producto tiene descuento, cuando se renderiza la
      landing, entonces la sección de ofertas no se muestra (no aparece vacía ni
      con datos de relleno).
- [ ] **AC15** — Dado un producto con `image_url = null` (los 8 del seed), cuando
      se pinta su tarjeta, entonces se muestra el arte SVG que corresponde al slug
      de su categoría, y con `image_url` válida se muestra la foto.
- [ ] **AC16** — Dado `prefers-reduced-motion: reduce`, cuando se carga la landing,
      entonces todo el contenido es visible en su estado final y no se ejecuta
      ninguna animación de entrada, marquee ni parallax.
- [ ] **AC17** — Dada la landing en 390 px de ancho, cuando se navega, entonces
      todo objetivo táctil mide ≥ 44 px de alto, el catálogo va a 2 columnas y no
      hay scroll horizontal en el `body`.
- [ ] **AC18** — Dado el panel `/admin/products`, cuando se abre después de esta
      fase, entonces conserva su paleta neutra actual: los tokens del storefront
      no se filtran fuera de `[data-surface="storefront"]`.
- [ ] **AC19** — Dado el header, cuando el visitante tiene sesión, entonces siguen
      apareciendo `UserButton` y el acceso a administración; sin sesión, los
      botones de Clerk de iniciar sesión y crear cuenta.
- [ ] **AC20** — Dado el proyecto completo, cuando se ejecuta
      `npm run typecheck && npm run lint && npm run build`, entonces los tres pasan.

## 5. Modelo de datos

Reutiliza `categories` y `products` tal como los dejaron los specs 001 y 003.
**Un solo cambio de esquema**, con migración.

### 5.1 Modificada — `products`

| Columna | Tipo | Nota |
|---|---|---|
| `compare_at_price_cents` | `integer` NULL | Precio anterior (PVP) en céntimos. `NULL` = sin descuento. Sin default: la ausencia es significativa. |

Sin índice nuevo: el filtro de ofertas (`compare_at_price_cents > price_cents`)
se resuelve sobre un catálogo de decenas de filas y ya viaja acompañado de
`products_is_active_idx`. Se revisa si el catálogo pasa de unos miles de filas.

```ts
// src/server/db/schema/product.ts — se añade dentro de pgTable('products', {...})
compareAtPriceCents: integer('compare_at_price_cents'),
```

Requiere migración: `npm run db:generate` + `npm run db:migrate`. Es una columna
nullable añadida al final, no reescribe filas existentes ni rompe el seed.

### 5.2 Sin tablas nuevas

Ni marcas, ni valoraciones, ni suscriptores de newsletter, ni carritos. Lo que la
landing muestra y la base no sabe se recorta (§3) o se deriva de datos reales (§8).

### 5.3 Proyección pública (no es una tabla)

El repositorio devuelve una fila recortada; el tipo se infiere del schema Drizzle
y se hace `Pick` sobre él, no se reescribe a mano (CLAUDE.md regla 5):

```ts
// src/modules/products/types/catalog.types.ts
export type CatalogProduct = Pick<
  Product,
  'id' | 'name' | 'slug' | 'description' | 'imageUrl' | 'priceCents' | 'createdAt'
> & {
  compareAtPriceCents: number | null;
  discountPercent: number | null;   // derivado en SQL, null si no hay descuento
  stockLevel: 'out' | 'low' | 'in'; // derivado en SQL, nunca el entero de stock
  categoryName: string;
  categorySlug: string;
};
```

## 6. Contratos de API

Dos Route Handlers nuevos, ambos **públicos**. `src/proxy.ts` no cambia: las
rutas son públicas por defecto y `clerkMiddleware()` sigue resolviendo la sesión
para el header (`docs/SETUP.md` §6).

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/products` | público | query (§6.1) | `CatalogProductListResponse` | 400, 500 |
| GET | `/api/categories` | público | — | `{ data: CatalogCategory[] }` | 500 |

Ambos añaden `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

### 6.1 `GET /api/products`

```ts
// src/modules/products/schemas/catalog.schema.ts
export const catalogQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  category: z.union([z.literal('all'), z.string().regex(SLUG_PATTERN).max(140)]).default('all'),
  sort: z.enum(['featured', 'newest', 'price_asc', 'price_desc']).default('featured'),
  discounted: z.stringbool().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});
```

`category` viaja por **slug**, no por uuid: la URL del filtro es legible y el
slug ya es único en `categories`.

Respuesta `200`:

```ts
type CatalogProductListResponse = {
  data: CatalogProduct[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};
```

`meta` **no** lleva flags de permiso: a diferencia de `/api/admin/products`, aquí
no hay nada que ocultar por rol.

`400` → `{ message: 'Parámetros de consulta inválidos', issues: ZodIssue[] }`
`500` → `{ message: 'No se pudo obtener el catálogo' }`

Filtro invariante, aplicado siempre y no parametrizable desde fuera:
`products.is_active = true AND categories.is_active = true`.

Orden de `featured` (determinista, sin aleatoriedad):
descuento primero → disponibles antes que agotados → `created_at desc` → `id`
como desempate estable para que la paginación no repita filas.

### 6.2 `GET /api/categories`

Sin query params. Devuelve las categorías activas **con al menos un producto
publicable**, ordenadas por nombre.

```ts
type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
};
```

`500` → `{ message: 'No se pudieron obtener las categorías' }`

## 7. Arquitectura y archivos afectados

```
src/server/db/schema/product.ts        + compareAtPriceCents
drizzle/                               + migración generada

src/server/repositories/
  product.repository.ts                + findPublicMany() — join + derivaciones en SQL
  category.repository.ts               + findPublicWithCounts()

src/app/api/
  products/route.ts                    NUEVO — GET público
  categories/route.ts                  NUEVO — GET público

src/modules/products/
  schemas/catalog.schema.ts            NUEVO — query pública
  types/catalog.types.ts               NUEVO — CatalogProduct, respuesta
  services/catalog.service.ts          NUEVO — axios
  hooks/use-catalog-products.ts        NUEVO — TanStack Query
  schemas/product.schema.ts            + compareAtPriceCents (create/update/form)
  components/product-form-dialog.tsx   + campo "precio anterior"
  constants.ts                         + catalogKeys

src/modules/categories/
  types/catalog-category.types.ts      NUEVO
  services/catalog-category.service.ts NUEVO
  hooks/use-catalog-categories.ts      NUEVO

src/modules/cart/
  store/cart.store.ts                  NUEVO — Zustand + persist
  constants.ts                         NUEVO — umbral de envío gratis
  components/cart-drawer.tsx           NUEVO

src/modules/storefront/                MÓDULO NUEVO (composición, no dominio)
  store/ui.store.ts                    NUEVO — searchOpen | cartOpen | menuOpen
  constants.ts                         NUEVO — icono y arte por slug de categoría
  components/
    announcement-bar.tsx               server
    storefront-header.tsx              client (recibe authSlot del servidor)
    theme-toggle.tsx                   client
    hero.tsx                           server
    hero-visual.tsx                    client (tilt + parallax)
    category-marquee.tsx               server (CSS)
    deals-section.tsx                  server
    categories-section.tsx             server
    catalog-section.tsx                client (filtros + hook)
    features-section.tsx               server
    storefront-footer.tsx              server
    product-card.tsx                   server
    product-media.tsx                  client (fallback de imagen)
    search-dialog.tsx                  client (cmdk, carga diferida)
    mobile-menu.tsx                    client (carga diferida)
    reveal.tsx                         client (children pass-through)
    motion-provider.tsx                client (MotionConfig reducedMotion)

src/app/(storefront)/layout.tsx        data-surface="storefront" + fuentes
src/app/(storefront)/page.tsx          REESCRITA — composición + lectura inicial
src/app/layout.tsx                     + Space Grotesk / Inter como variables
src/app/globals.css                    + capa de tokens del storefront
src/components/ui/command.tsx          shadcn add command
next.config.ts                         + images.remotePatterns
package.json                           + motion, cmdk
```

`src/components/shared/site-header.tsx` **no se borra**: lo sigue usando el grupo
admin. El storefront pasa a su propio header.

## 8. Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| D-1 | Datos reales de Neon desde el primer render | Mantener el array `PRODUCTS` del diseño como mock | El CRUD de productos y categorías ya está cerrado (specs 001 y 003) y la base tiene 7 categorías y 8 productos. Un mock obligaría a escribir dos veces las tarjetas y a tirar la primera. |
| D-2 | **No se instala `swiper`** | Instalarlo como pidió el enunciado | Revisado `docs/design/index.html` y `mobile.html`: no hay ni un carrusel de slides. El marquee es `animate(track, { x: ['0%','-50%'] }, { repeat: Infinity })`, los filtros son una fila con scroll horizontal y el catálogo un CSS grid. Una dependencia de ~40 kB sin un solo consumidor. Si más adelante aparece una galería de ficha de producto, se reevalúa. |
| D-3 | `motion` para animaciones | CSS puro / GSAP | El diseño ya está escrito contra la API de Motion (`animate`, `inView`, `stagger`, `scroll`), con las mismas curvas y tiempos; portarlo es traducción, no rediseño. `motion/react` añade `useReducedMotion` y `MotionConfig`. |
| D-4 | Marquee, hover-lift y reveals simples en CSS; Motion solo donde hace falta estado de scroll o puntero (parallax, tilt, magnético, contadores, stagger) | Todo con Motion, como en `app.js` | Un bucle infinito en JS mantiene el hilo principal ocupado toda la sesión. `@keyframes` lo hace el compositor y `prefers-reduced-motion` lo apaga sin código. Regla `rendering-animate-svg-wrapper` de `vercel-react-best-practices`: se anima el `div` contenedor, nunca el `<svg>`. |
| D-5 | Lectura inicial en `page.tsx` vía repositorio, y el mismo dato inyectado como `initialData` del hook | Todo por `useQuery` desde el cliente | `docs/SETUP.md` §4 sanciona explícitamente la flecha `Server Component ──► repositorio` para «lectura inicial, SEO». Sin ella la portada llega vacía al crawler y con un salto de layout. `initialData` evita el refetch duplicado al hidratar (AC8) y elimina la cascada `render → fetch → render`. |
| D-6 | Urgencia real: `stockLevel` derivado (`out` \| `low` ≤ 5 \| `in`) en lugar de la cuenta atrás y del «quedan 7 de 30» | Countdown a medianoche del diseño | No hay `discount_ends_at` ni stock inicial en el modelo; el contador sería decorado que miente. `stockLevel` sale del `stock` real que ya mantiene el admin. La vigencia de promociones se difiere (§11). |
| D-7 | El DTO público excluye `sku`, `stock`, `specs`, `isActive` y `categoryId`; la disponibilidad viaja como enum | Reutilizar `ProductWithCategory` del admin | Publicar el entero de inventario expone la operación del negocio a cualquiera con `curl`, y `sku` es identificador interno. Además reduce el payload serializado a cliente (`server-serialization`). |
| D-8 | Se añade **una** columna, `compare_at_price_cents` | (a) Recortar precio tachado y badge; (b) añadir además rating, reseñas y vigencia | El precio anterior es un campo de comercio estándar, nullable, sin migración de datos, y desbloquea a la vez el badge `−N %`, la sección de ofertas y el orden `featured`. Rating y reseñas necesitan tabla, moderación y volumen: son un spec propio. |
| D-9 | `discountPercent` y `stockLevel` se derivan en el `SELECT` del repositorio | Calcularlos en el Route Handler o en el componente | Mantiene el handler como orquestador (`docs/SETUP.md` regla 3), permite ordenar por descuento en la misma consulta y garantiza que servidor y cliente muestren el mismo número. |
| D-10 | Tokens Nexbyte acotados a `[data-surface="storefront"]`, remapeando ahí las variables semánticas de shadcn (`--primary`, `--background`, `--border`…) | (a) Reescribir la paleta global; (b) importar `docs/design/src/styles.css` con sus clases `.hero`, `.card` | (a) repintaría de violeta el panel admin ya revisado (AC18). (b) trae un CSS de 634 líneas paralelo a Tailwind y rompe la regla de componentes shadcn de CLAUDE.md §6. Con el scope, los mismos `Button`, `Badge` y `Sheet` de shadcn heredan la identidad Nexbyte dentro de la tienda y la neutra fuera. |
| D-11 | El tema sigue en `next-themes` con `attribute="class"` (`.dark`) | Adoptar el `[data-theme]` del diseño | `ThemeProvider` ya está montado en `src/components/providers/index.tsx` y `globals.css` declara `@custom-variant dark (&:is(.dark *))`. Cambiar el atributo obligaría a tocar todos los tokens existentes por un renombrado sin valor. |
| D-12 | Buscador sobre el componente `command` de shadcn (cmdk) | Overlay a mano como en `app.js` | Trae por defecto lo caro de acertar: rol `combobox`, `aria-activedescendant`, navegación `↑ ↓ Enter`, trampa de foco y devolución del foco al cerrar (AC10). CLAUDE.md §6 exige los componentes shadcn vía `npx shadcn@latest add`, no escritos a mano. |
| D-13 | Buscador contra `/api/products?q=` con debounce, no filtrado en cliente | Filtrar el array ya cargado | El cliente solo tiene la primera página (12 productos); buscar sobre ella daría «sin resultados» para productos que sí existen. El `ilike` ya vive en el repositorio. |
| D-14 | Carrito UI-only: Zustand + `persist`, clave versionada `nx-cart:v1`, `try/catch` en el acceso a `localStorage` | Carrito en servidor ya en esta fase | El carrito persistido cruza `carts`, `cart_items`, stock y sesión: es un spec con su propio modelo. La regla `client-localstorage-schema` pide versionar la clave y envolver el acceso (revienta en modo privado de Safari y al superar cuota). |
| D-15 | El header del storefront es un Client Component que recibe el bloque de Clerk como `children`/`authSlot` desde el layout servidor | Header servidor con islas cliente sueltas | El estado «pegado», los tres disparadores de overlay y el conmutador de tema son todos interactivos: el header *es* la isla. Pasar el slot de auth como children mantiene `UserButton` renderizado desde el servidor y no arrastra Clerk al bundle del header (AC19). |
| D-16 | Estado de los overlays en un store Zustand (`ui.store.ts`), no en el header | `useState` en el header y prop drilling | El disparador vive en el header y el panel al final del árbol; sin store, el estado sube al layout y convierte en cliente todo lo que hay en medio, contra CLAUDE.md regla 7. Además es estado de UI puro, que la regla 6 asigna a Zustand. |
| D-17 | `search-dialog`, `cart-drawer` y `mobile-menu` con `next/dynamic` | Import estático | Los tres están detrás de un clic o un atajo. `bundle-dynamic-imports` los saca del chunk inicial, que es justo el que mide el LCP de la portada. |
| D-18 | `next/image` con `remotePatterns` acotado a `images.unsplash.com`; cualquier otra URL cae al arte SVG por `onError` | `remotePatterns: [{ hostname: '**' }]` | El comodín convierte el optimizador de imágenes en un proxy abierto a cualquier URL https, con el coste de cómputo asociado. Hoy el único host en datos es Unsplash (2 categorías del seed); los 8 productos tienen `image_url = null`. Añadir hosts es una línea de config. |
| D-19 | Arte SVG de producto indexado por **slug de categoría**, con figura por defecto | Copiar el mapa `art:` por producto del diseño | En el diseño el arte estaba atado a 10 productos inventados. La categoría sí es un dato real de cada fila, así que el mapa cubre el catálogo entero y los productos futuros sin tocar código. |
| D-20 | El marquee muestra las categorías reales y enlaza al filtro | Las marcas APEX/NOVA/KAIROS del diseño | Son marcas inventadas: publicarlas es afirmar algo falso en la portada. Con categorías, la banda decorativa pasa a ser navegación. |
| D-21 | Precios formateados con `formatPrice()` de `src/modules/products/lib/price.ts` (PEN, `es-PE`) | El `Intl` en euros del diseño | El proyecto ya fijó PEN en el admin; dos monedas en la misma app es un error de datos esperando ocurrir. El helper es puro y no arrastra nada de servidor. |
| D-22 | `Cache-Control: s-maxage=60, stale-while-revalidate=300` puesto a mano en la respuesta | `export const revalidate` / `force-static` | Ambos handlers leen `searchParams`, así que son dinámicos por definición y el caché de ruta completa no aplica. La cabecera es explícita y verificable con `curl -I`. La skill `vercel:next-cache-components` no está instalada, así que no se inventa API de caché. |
| D-23 | Fuentes Space Grotesk e Inter con `next/font/google`, expuestas como `--font-display` y `--font-body` y activadas solo dentro del scope del storefront | `<link>` a Google Fonts como el diseño | `next/font` autohospeda, elimina la petición a un tercero y el FOUT. Mantenerlas en el scope deja Geist intacto en el admin. |

Skills consultadas: `vercel-react-best-practices` (D-4, D-5, D-7, D-14, D-17).
`web-design-guidelines` está instalada pero su flujo exige `WebFetch`, que no
está disponible en esta sesión: los criterios de accesibilidad (AC10, AC16, AC17)
salen de la especificación táctil y de movimiento de `docs/design/mobile.html`.
`superpowers:brainstorming`, `superpowers:writing-plans`, `vercel:nextjs`,
`vercel:next-cache-components` y `vercel:vercel-storage` **no están instaladas**
en esta sesión; el spec se redactó sin ellas.

## 9. Tareas

### Fase 0 — Dependencias, tokens y configuración

- [x] **T1** — Instalar `motion` con npm · archivo: `package.json` · verificación: `npm run build`
- [x] **T2** — Añadir el componente `command` de shadcn (`npx shadcn@latest add command`) · archivo: `src/components/ui/command.tsx` · verificación: `npm run typecheck`
- [x] **T3** — Declarar Space Grotesk e Inter con `next/font/google` y exponerlas como `--font-display` y `--font-body` en `<html>` · archivo: `src/app/layout.tsx` · verificación: `npm run build`
- [x] **T4** — Añadir la capa de tokens del storefront: primitivas Nexbyte y bloques `[data-surface="storefront"]` y `.dark [data-surface="storefront"]` que remapean las variables semánticas de shadcn y las dos familias tipográficas · archivo: `src/app/globals.css` · verificación: `npm run build` y el panel `/admin/products` sin cambios de color (AC18)
- [x] **T5** — Configurar `images.remotePatterns` con `images.unsplash.com` · archivo: `next.config.ts` · verificación: `npm run build`

### Fase 1 — Esquema y repositorios

- [x] **T6** — Añadir la columna `compareAtPriceCents` (integer, nullable) · archivo: `src/server/db/schema/product.ts` · verificación: `npm run typecheck`
- [x] **T7** — Generar y aplicar la migración · archivo: `drizzle/` · verificación: `npm run db:generate && npm run db:migrate`
- [x] **T8** — Extender los schemas Zod del admin con `compareAtPriceCents` (create, update y formulario con su conversión a céntimos) · archivo: `src/modules/products/schemas/product.schema.ts` · verificación: `npm run typecheck`
- [x] **T9** — Añadir el campo «precio anterior» al diálogo de producto, opcional y validado contra el precio actual · archivo: `src/modules/products/components/product-form-dialog.tsx` · verificación: crear un producto con y sin precio anterior desde `/admin/products`
- [x] **T10** — Implementar `findPublicMany()`: `innerJoin` a `categories`, filtro invariante `is_active` en ambas tablas, búsqueda `ilike` sobre `name`, filtro por slug de categoría, `discounted`, los cuatro órdenes con desempate por `id`, derivación en SQL de `discountPercent` y `stockLevel`, paginación y `count` · archivo: `src/server/repositories/product.repository.ts` · verificación: `npm run typecheck`
- [x] **T11** — Implementar `findPublicWithCounts()`: categorías activas con `count` de productos activos, `HAVING count > 0`, orden por nombre · archivo: `src/server/repositories/category.repository.ts` · verificación: `npm run typecheck`

### Fase 2 — API pública

- [x] **T12** — Definir `catalogQuerySchema` y sus tipos de salida · archivo: `src/modules/products/schemas/catalog.schema.ts` · verificación: `npm run typecheck`
- [x] **T13** — Definir `CatalogProduct` (por `Pick` sobre el tipo inferido de Drizzle) y `CatalogProductListResponse` · archivo: `src/modules/products/types/catalog.types.ts` · verificación: `npm run typecheck`
- [x] **T14** — Implementar `GET /api/products`: sin `authorize()`, valida con Zod antes de tocar datos, delega en el repositorio, arma `meta` y añade `Cache-Control` · archivo: `src/app/api/products/route.ts` · verificación: `curl` a `/api/products`, `?page=0` devuelve 400 (AC2, AC5)
- [x] **T15** — Definir el tipo `CatalogCategory` · archivo: `src/modules/categories/types/catalog-category.types.ts` · verificación: `npm run typecheck`
- [x] **T16** — Implementar `GET /api/categories` con la misma cabecera de caché · archivo: `src/app/api/categories/route.ts` · verificación: `curl` y comprobar que `Tablets` no aparece (AC4)

### Fase 3 — Cliente de datos

- [x] **T17** — Service axios del catálogo (`fetchCatalogProducts`) · archivo: `src/modules/products/services/catalog.service.ts` · verificación: `npm run typecheck`
- [x] **T18** — Añadir `catalogKeys` a las constantes del módulo · archivo: `src/modules/products/constants.ts` · verificación: `npm run typecheck`
- [x] **T19** — Hook `useCatalogProducts(params, { initialData })` con `placeholderData: keepPreviousData` · archivo: `src/modules/products/hooks/use-catalog-products.ts` · verificación: `npm run typecheck`
- [x] **T20** — Service y hook de categorías públicas · archivos: `src/modules/categories/services/catalog-category.service.ts`, `src/modules/categories/hooks/use-catalog-categories.ts` · verificación: `npm run typecheck`

### Fase 4 — Cimientos de la UI

- [x] **T21** — Layout del storefront con `data-surface="storefront"`, las clases de fuente y el slot de header/footer · archivo: `src/app/(storefront)/layout.tsx` · verificación: `npm run build`
- [x] **T22** — `MotionProvider` con `MotionConfig reducedMotion="user"` · archivo: `src/modules/storefront/components/motion-provider.tsx` · verificación: `npm run typecheck`
- [x] **T23** — `<Reveal>`: cliente con `children` pass-through, `whileInView`, `once`, sin animación bajo `useReducedMotion()` · archivo: `src/modules/storefront/components/reveal.tsx` · verificación: `npm run typecheck` (AC16)
- [x] **T24** — Store de UI de overlays (`searchOpen`, `cartOpen`, `menuOpen` y sus acciones) · archivo: `src/modules/storefront/store/ui.store.ts` · verificación: `npm run typecheck`
- [x] **T25** — Mapa de icono lucide y de arte SVG por slug de categoría, con entradas para los 7 slugs del seed y un valor por defecto · archivo: `src/modules/storefront/constants.ts` · verificación: `npm run typecheck`
- [x] **T26** — `ThemeToggle` sobre `next-themes`, sin parpadeo al hidratar · archivo: `src/modules/storefront/components/theme-toggle.tsx` · verificación: alternar tema y recargar
- [x] **T27** — Header del storefront: marca, navegación de anclas, disparadores de buscador, carrito y menú, `ThemeToggle` y `authSlot` · archivo: `src/modules/storefront/components/storefront-header.tsx` · verificación: `npm run build` (AC19)
- [x] **T28** — Barra de avisos con marquee en CSS · archivo: `src/modules/storefront/components/announcement-bar.tsx` · verificación: inspección visual
- [x] **T29** — `ProductMedia`: `next/image` cuando hay `imageUrl`, arte SVG de la categoría cuando no o cuando la carga falla · archivo: `src/modules/storefront/components/product-media.tsx` · verificación: los 8 productos del seed pintan arte (AC15)
- [x] **T30** — `ProductCard`: media, categoría, nombre, precio, precio tachado, badge `−N %`, señal de `stockLevel` y botón de añadir · archivo: `src/modules/storefront/components/product-card.tsx` · verificación: inspección visual (AC13)

### Fase 5 — Secciones

- [x] **T31** — Hero: copia, CTA a `#catalogo` y `#ofertas`, y contadores de la fila de estadísticas · archivo: `src/modules/storefront/components/hero.tsx` · verificación: inspección visual
- [x] **T32** — Visual del hero: tarjeta del producto destacado con tilt, orbes con parallax y tarjetas flotantes · archivo: `src/modules/storefront/components/hero-visual.tsx` · verificación: inspección visual y con `reduced-motion` activo
- [x] **T33** — Marquee de categorías reales enlazadas al filtro · archivo: `src/modules/storefront/components/category-marquee.tsx` · verificación: inspección visual
- [x] **T34** — Sección de ofertas: destacada + secundarias a partir de productos con descuento; no se renderiza si no hay ninguno · archivo: `src/modules/storefront/components/deals-section.tsx` · verificación: AC14
- [x] **T35** — Rejilla de categorías con icono, nombre y `productCount` · archivo: `src/modules/storefront/components/categories-section.tsx` · verificación: los recuentos coinciden con `db:studio`
- [x] **T36** — Sección de catálogo: fila de filtros con scroll-snap, rejilla, `useCatalogProducts` con `initialData`, y estados de carga, error con reintento y vacío · archivo: `src/modules/storefront/components/catalog-section.tsx` · verificación: AC7, AC8, AC9
- [x] **T37** — Sección de ventajas (contenido estático de marca) · archivo: `src/modules/storefront/components/features-section.tsx` · verificación: inspección visual
- [x] **T38** — Footer con enlaces solo a anclas y rutas existentes · archivo: `src/modules/storefront/components/storefront-footer.tsx` · verificación: ningún enlace lleva a `not-found`

### Fase 6 — Overlays e interacción

- [x] **T39** — Constantes del carrito: umbral de envío gratis y coste de envío en céntimos PEN · archivo: `src/modules/cart/constants.ts` · verificación: `npm run typecheck`
- [x] **T40** — Store del carrito con `persist`, clave `nx-cart:v1`, acceso a `localStorage` protegido y selectores de cantidad y subtotal · archivo: `src/modules/cart/store/cart.store.ts` · verificación: AC12
- [x] **T41** — Drawer del carrito sobre `Sheet`: líneas, cantidades, borrado, barra de envío gratis, resumen y estado vacío · archivo: `src/modules/cart/components/cart-drawer.tsx` · verificación: AC12
- [x] **T42** — Buscador sobre `Command` en diálogo, atajo `⌘K`/`Ctrl+K`, consulta con debounce a `/api/products?q=` y salto al catálogo · archivo: `src/modules/storefront/components/search-dialog.tsx` · verificación: AC10, AC11
- [x] **T43** — Menú móvil sobre `Sheet` con las anclas y el CTA · archivo: `src/modules/storefront/components/mobile-menu.tsx` · verificación: AC17
- [x] **T44** — Cargar los tres overlays con `next/dynamic` desde el layout del storefront · archivo: `src/app/(storefront)/layout.tsx` · verificación: no aparecen en el chunk inicial de `npm run build`

### Fase 7 — Composición y cierre

- [x] **T45** — Reescribir la portada: lectura de productos y categorías en un único `Promise.all`, composición de las secciones y `metadata` con `openGraph` · archivo: `src/app/(storefront)/page.tsx` · verificación: AC1
- [x] **T46** — Pasada de accesibilidad: `skip link`, foco visible, `aria-*` de los overlays, objetivos táctiles ≥ 44 px y sin scroll horizontal a 390 px · archivos: componentes del storefront · verificación: AC10, AC16, AC17
- [x] **T47** — Verificación final · verificación: `npm run typecheck && npm run lint && npm run build` (AC20)

## 10. Riesgos y consideraciones

- **Caché contra el admin.** Con `s-maxage=60`, un cambio de precio publicado
  desde el panel tarda hasta un minuto en verse en la portada. Es aceptable para
  un catálogo, pero hay que decirlo: no hay invalidación por etiqueta todavía.
- **`imageUrl` es texto libre del admin.** Si alguien guarda una URL de un host
  fuera de `remotePatterns`, `next/image` lanza en tiempo de ejecución. Por eso
  `ProductMedia` degrada a arte SVG en el `onError` (T29) en lugar de confiar en
  la validación de entrada.
- **Precios en el `localStorage` del carrito.** La instantánea guardada envejece:
  un producto que sube de precio se sigue mostrando barato en el drawer hasta que
  se recarga la línea. Sin checkout no hay daño económico, pero el carrito de
  servidor tendrá que recalcular contra la base y no fiarse del cliente.
- **`stockLevel` sigue siendo una filtración parcial.** `low` revela que quedan
  ≤ 5 unidades. Es información comercial deliberada, no un descuido; el umbral
  vive en una constante y se puede subir sin tocar el contrato.
- **Endpoints públicos sin límite de tasa.** `GET /api/products?q=` acepta
  peticiones anónimas ilimitadas y cada una hace dos consultas a Neon (datos y
  conteo). El `Cache-Control` protege el borde, no el origen. Si aparece abuso,
  el siguiente paso es limitar por IP en el handler.
- **`ilike '%q%'` no usa índice.** Con decenas de productos es irrelevante; a
  partir de unos miles hace falta `pg_trgm` o `tsvector`. Anotado, no resuelto.
- **Peso del hilo principal.** Motion, cmdk, TanStack Query y Clerk conviven en
  la portada. Las cargas diferidas (T44) son lo que evita que el LCP lo pague el
  visitante que nunca abre un overlay; si se importan estáticamente por descuido,
  la decisión se pierde en silencio.
- **Regresión visual del admin.** El remapeo de tokens es lo único de este spec
  que puede romper trabajo ya revisado. AC18 existe para eso y se comprueba a
  ojo en `/admin/products` y `/admin/categories`.
- **Migración.** `compare_at_price_cents` es nullable y va al final: revertirla es
  un `DROP COLUMN` y ninguna fila existente cambia de valor.
- **Catálogo vacío.** Si alguien desactiva todos los productos, la landing debe
  seguir renderizando sin romperse: secciones de ofertas y categorías ocultas y
  catálogo en estado vacío (AC9, AC14).

## 11. Fuera de alcance / deuda aceptada

| Diferido | Cuándo retomarlo |
|---|---|
| `/products` y ficha `/products/[slug]` | Spec siguiente del storefront. La tarjeta ya sale con `slug`, así que solo hay que envolverla en un `<Link>`. |
| Vigencia de promociones (`discount_ends_at`) y la cuenta atrás real | Cuando exista gestión de promociones en el admin. |
| Valoraciones y reseñas | Necesita tabla, verificación de compra y moderación. Spec propio. |
| Newsletter (tabla, endpoint, doble opt-in, anti-abuso) | Spec propio; es un endpoint público de escritura, no un adorno. |
| Wishlist / favoritos | Depende de usuario autenticado y tabla propia. |
| Carrito en servidor (`carts`, `cart_items`) con stock y precio en vivo | Junto con el checkout. Sustituye al store local sin cambiar la UI del drawer. |
| Subida de imágenes de producto a un blob store | Mientras `imageUrl` sea texto libre, la lista blanca de hosts se queda corta. |
| Invalidación de caché por etiqueta al mutar desde el admin | Cuando la ventana de 60 s moleste de verdad. |
| Datos estructurados JSON-LD (`ItemList`, `Product`) y `sitemap.xml` | Al abrir la ficha de producto, que es la página que de verdad quiere indexarse. |
| Índice de texto completo para la búsqueda | A partir de unos miles de productos. |
| **Página de error sin JavaScript durante una caída de Neon.** Con `loading.tsx` presente, Next envuelve el segmento en Suspense y descarga la cabecera con `200` antes de saber si la lectura falla; el estado de error viaja luego por el stream RSC y lo pinta el boundary al hidratar. Un visitante con JavaScript deshabilitado se queda en el esqueleto de carga. | Aceptado en la revisión de la iteración 3: es el comportamiento inherente del streaming del App Router, no un defecto introducido aquí, y quitar `loading.tsx` lo empeoraría (nada renderizado hasta que Neon responda o falle). El storefront ya depende de JavaScript para el catálogo, el buscador, el carrito y los overlays. Se revisa si aparece SSR sin JS como requisito o si un rastreador llega a indexar el esqueleto. |

## 12. Decisiones tomadas durante la implementación

Puntos que el spec no fijaba y que hubo que resolver al construir. Se dejan
escritos para que la revisión los juzgue como tales y no como desviaciones mudas.

| # | Punto | Qué se hizo y por qué |
|---|---|---|
| I-1 | `CatalogProduct.createdAt` | §5.3 lo incluía en el `Pick`, lo que lo tipa como `Date`; `Date` no sobrevive a JSON, así que `initialData` y la respuesta fetcheada habrían tenido tipos distintos y AC8 sería falso. Primero se emitió como `string` ISO. **En revisión se retiró del todo**: ningún componente lo consume, el orden por fecha lo resuelve el `ORDER BY` del repositorio, y mantenerlo solo añadía peso al payload serializado (regla `server-serialization`). |
| I-2 | Orden de T13 y T15 | Los tipos se escribieron antes que los repositorios que los consumen (T10, T11). Alternativa era declarar la forma dos veces; hay precedente en el repo de que `src/server` importe tipos de `modules/` (`user-access.service.ts`), así que se importan y no se duplican (CLAUDE.md regla 5). |
| I-3 | `CATALOG_CACHE_CONTROL` | La comparten los dos handlers, de dos módulos distintos, así que vive en `src/lib/constants.ts` y no en el módulo de productos. |
| I-4 | Arte SVG en archivo aparte | T25 lo situaba en `constants.ts`, que es `.ts` y no admite JSX. El mapa de iconos lucide se queda en `constants.ts`; el arte pasa a `components/category-art.tsx`. Ambos siguen indexados por slug y con valor por defecto. |
| I-5 | Pestillo de montaje de los overlays | Montarlos solo mientras están abiertos los desmonta antes de que Radix devuelva el foco al disparador (rompe AC10); montarlos siempre descarga los tres chunks al hidratar (rompe D-17). Se resuelve con `searchMounted`/`cartMounted`/`menuMounted` en el store de UI, que además evita leer un ref durante el render. |
| I-6 | `ThemeToggle` sin estado de montaje | El patrón `mounted` habitual incumple `react-hooks/set-state-in-effect`. Se renderizan los dos iconos y decide el CSS con la clase `.dark`, como hacía `docs/design`: mismo HTML en servidor y cliente, sin parpadeo ni mismatch. |
| I-7 | `staleTime` explícito en los hooks | **Corregido en revisión.** La redacción original decía «en lugar de depender del default global», dando a entender que sin esto el `staleTime` sería 0. Es falso: `src/lib/query-client.ts` ya fija `staleTime: 60 * 1000` para todas las queries, así que AC8 se cumpliría igual sin tocar nada. `CATALOG_STALE_TIME_MS` se **mantiene** como fijación deliberada y local: AC8 es un criterio de aceptación de este spec y no debe depender de un default global que otro spec pueda bajar a 0 sin enterarse de que rompe la portada. La constante documenta además el porqué del valor —coincide con el `s-maxage=60` del endpoint—, que el default global no explica. |
| I-8 | Filtro de categoría en el store de UI | El marquee, la rejilla de categorías y el buscador tienen que poder fijarlo, y los tres están fuera de `catalog-section`. Es estado de UI, que la regla 6 asigna a Zustand. |
| I-9 | Marca de la tienda | Se usa `APP_NAME` y no «Nexbyte»: el spec porta el sistema visual del diseño, y D-20 ya rechaza publicar nombres inventados. |
| I-10 | Umbral de envío gratis | El diseño usaba 59 €. Se fija en 250,00 PEN (`FREE_SHIPPING_THRESHOLD_CENTS = 25_000`) por coherencia con D-21; es una constante y se ajusta sin tocar código. |
| I-11 | Botón de checkout | Deshabilitado con nota, en vez de enlazar a una ruta que no existe. El checkout está diferido en §11. |

## 13. Correcciones de la revisión (iteración 1)

Los 5 hallazgos MAYOR y los 8 menores de la primera pasada del `reviewer`.

| Hallazgo | Corrección | Verificación |
|---|---|---|
| MAYOR 1 — `Reveal` deja el contenido invisible con reduced-motion | `useReducedMotion()` es `false` en el servidor, así que el HTML salía con `opacity:0` inline pase lo que pase. `Reveal` emite ahora `data-reveal` en **las dos** ramas y la media query de `globals.css` neutraliza el estilo inline con `opacity:1!important; transform:none!important`, sin depender de que corra JavaScript. | Build de producción: **16 de 16** bloques con `opacity:0` llevan `data-reveal`; la regla está en el CSS compilado. |
| MAYOR 2 — sin frontera de error en el servidor | Nuevo `src/app/(storefront)/error.tsx` (Client Component) con `reset()`, identidad visual del storefront y `digest`. **Insuficiente en la primera pasada**: ver iteración 2. | Ver iteración 2. |
| MAYOR 3 — `findPublicWithCounts()` dos veces por render | Nuevo `src/server/services/catalog.service.ts` con `getPublicCategories = cache(...)`. Lo consumen el layout (footer) y la portada; la segunda llamada reutiliza la promesa de la primera. | Layout y `page.tsx` ya no importan el repositorio directamente. |
| MAYOR 4 — invariante de precio solo en el formulario | El `.refine()` pasa a `createProductSchema`, que es el que valida el Route Handler. `updateProductSchema` no puede hacerlo por ser parcial, así que el PATCH comprueba `isValidComparePrice()` sobre la **fila combinada** (`{...before, ...body}`) dentro de la transacción. Predicado y mensaje compartidos con el formulario. | `createProductSchema` rechaza anterior `==` y `<` actual con `path=compareAtPriceCents`; acepta anterior `>` actual y `null`. Cross-check del PATCH probado sobre fila combinada. |
| MAYOR 5 — AC13 nunca verificado con datos reales | Se fijó «precio anterior» a dos productos (IdeaPad S/ 2 899,00 y Keychron S/ 549,00) y **se dejaron puestos** para que la revisión pueda verlo. | HTML de producción: badges `−24 %` y `−16 %`, **5** precios tachados renderizados (3× `S/ 549.00` del Keychron y 2× `S/ 2,899.00` del IdeaPad, en el formato de `formatPrice()`: coma de miles y punto decimal), sección de ofertas presente, y orden `featured` con los dos descuentos primero y el agotado al final. |
| menor 1 — badge del destacado sin guarda | Guarda inline `discountPercent !== null && compareAtPriceCents !== null`, simétrica con `product-card.tsx`; inline y no por booleano auxiliar para que TypeScript estreche el tipo. | `npm run typecheck`. |
| menor 2 — tarjetas secundarias sin badge | Badge `−N %` añadido sobre el arte de las tarjetas secundarias. | Visible en el HTML renderizado. |
| menor 3 — `ilike` no escapaba `%` ni `_` | Nueva `escapeLikePattern()`: escapa `\`, `%` y `_`, con la barra invertida primero. | En vivo: `?q=%` → `total=0`; `?q=_` → `total=0`; `?q=keychron` → 1 resultado. |
| menor 4 — pulso congelado con reduced-motion | `.nx-pulse::after` pasa a `display: none` en vez de `animation: none`, que lo dejaba como punto sólido. | Regla en el CSS compilado. |
| menor 5 — `createdAt` era peso muerto | Retirado del DTO y del `SELECT`. Ver I-1. | `npm run typecheck`. |
| menor 6 — justificación falsa en I-7 | Corregida: el default global ya es 60 s. La constante se mantiene como fijación deliberada y local, con el motivo escrito. | — |
| menor 7 — enunciado de AC4 incorrecto | Corregido: en Neon `Tablets` está **activa** con 0 productos, así que la excluye el `HAVING`, no el `is_active`. | Consulta directa a Neon sobre las 8 categorías. |
| menor 8 — sin `loading.tsx` | Nuevo `src/app/(storefront)/loading.tsx` con esqueleto que imita la silueta real (hero + rejilla), para que Next envuelva el segmento en Suspense y envíe cabecera y pie antes de que responda Neon. | `npm run build`. |

## 14. Correcciones de la revisión (iteración 2)

| Hallazgo | Corrección | Verificación |
|---|---|---|
| MAYOR — `error.tsx` no cubría el `layout.tsx` de su propio segmento | Next solo usa el `error.tsx` de un segmento para lo que cuelga **por debajo** de su layout, no para lo que lanza el layout mismo. El layout hacía `await getPublicCategories()` para el footer, así que un fallo de Neon devolvía `500` con el cuerpo vacío. Ahora el layout es **síncrono y sin un solo `await`**: la lectura del footer baja a un componente hijo `FooterSlot` envuelto en `<Suspense>` y usa `getPublicCategoriesForChrome()`, que captura el fallo, lo registra y devuelve `[]` —el footer tolera la lista vacía—. `page.tsx` sigue usando `getPublicCategories()`, que sí puede lanzar, y ahí `error.tsx` sí es el boundary. De paso el layout deja de bloquear en Neon, con lo que el comentario de `loading.tsx` pasa a ser cierto. | Reproducida la prueba del reviewer: build de producción con `DATABASE_URL` a un host inalcanzable. Antes: `500` con cuerpo vacío. Ahora: **`200` con 61 KB**, con barra de avisos, header, footer y skip link renderizados, y el error entregado al boundary por el stream RSC (`E{"digest":…}`). Sin regresión con la base real: portada completa, badges `−24 %`/`−16 %` y footer con categorías reales. |
| menor — AC4 atribuía la exclusión al `HAVING` | Corregido: a `Tablets` la excluye el `innerJoin` con `products.is_active = true`; el `HAVING` es red de seguridad. El spec contradecía al comentario del propio repositorio. | Consulta directa a Neon sobre las 8 categorías. |
| menor — evidencia de M5 decía «7 precios tachados» | Corregido a **5**, con el formato real de `formatPrice()` (`S/ 2,899.00`). El 7 contaba apariciones de la clase `line-through` en todo el documento, incluido el payload RSC, no los precios renderizados. | Extracción de los nodos con `line-through` del HTML sin `<script>`: 5 exactos (3× `S/ 549.00`, 2× `S/ 2,899.00`). |

## 15. Verificación de la revisión (iteración 3 — cierre)

Tercera y última pasada. Se re-verificó desde el Paso 1 y **no se encontró ningún
hallazgo bloqueante ni mayor**. Veredicto: **APROBADO**.

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | ✓ sin errores |
| `npm run lint` | ✓ 0 errores (5 warnings preexistentes de `useReactTable`, ajenos a este spec) |
| `npm run build` | ✓ 21 rutas; `/`, `/api/products` y `/api/categories` como dinámicas |
| Fallo de Neon (build de producción, `DATABASE_URL` a host inalcanzable) | `200` con 61 843 bytes: barra de avisos, header, skip link y footer. Confirmado el fin del `500` con cuerpo vacío de la iteración 2. |
| El layout ya no puede lanzar | Confirmado: `StorefrontLayout` es síncrono, sin `await`. La lectura del footer vive en `FooterSlot` bajo `<Suspense>`. |
| `page.tsx` sigue lanzando | Confirmado en el log del servidor: `⨯ Error: Failed query… digest: '3829843824'`, y el mismo digest en el stream RSC (`21:E{"digest":"3829843824"}`). No se pierde visibilidad de fallos reales de Neon. |
| El boundary está registrado sobre la portada | Payload del router: dentro de `<main id="contenido">`, `"error":"$18"` (referencia cliente real); el layout raíz lleva `"error":"$undefined"`. |
| El fallo del footer se traga **pero se registra** | Log: `No se pudieron leer las categorías del footer Error: Failed query…`. No es un `catch {}` mudo. |
| Sin regresión con Neon respondiendo | Footer streameado con las 4 categorías reales (Almacenamiento, Componentes de PC, Laptops, Monitores). |
| Fallback del `Suspense` sin salto de layout | La columna «Tienda» ya fija 4 filas de `min-h-11`; «Categorías» creciendo de 0 a 4 cabe en el alto que la fila ya tenía. |
| AC4 — corrección de redacción | Confirmada contra Neon: `Tablets` y `cables` están **activas** con **0** productos. Las excluye el `innerJoin`, no el `where` ni el `HAVING`. `GET /api/categories` devuelve 6 de 8. |
| AC13 / M5 — corrección de la cifra | Confirmado: **5** nodos `line-through` en el HTML sin `<script>` (3× `S/ 549.00`, 2× `S/ 2,899.00`). En el documento completo hay 7 ocurrencias, que es de donde salía el número erróneo. |
| AC2 / AC3 / AC5 / AC6 | `GET /api/products` anónimo `200`, `meta.total = 7` (excluye el producto inactivo de Periféricos); `?page=0` y `?sort=xxx` → `400` con `issues`; el DTO no expone `sku`, `stock`, `isActive`, `specs` ni `categoryId`; `Cache-Control` correcto. |
| Reglas duras de arquitectura | Sin componentes importando `db`, Drizzle ni repositorios (los `*.types.ts` usan `import type` del schema, que es la regla 5); sin `axios`/`fetch` en componentes; sin consultas fuera de `repositories/` (salvo `seed.ts`); sin `any` ni `@ts-ignore` en el diff. |

Único punto abierto, **aceptado como deuda y registrado en §11**: sin JavaScript,
una caída de Neon deja al visitante en el esqueleto de carga en vez de en el
mensaje de error. Es inherente al streaming del App Router y consistente con el
resto de la arquitectura del storefront; no incumple ningún criterio de
aceptación de este spec.

## 16. Correcciones posteriores a la aprobación (verificación con navegador)

Dos fallos reales que solo aparecieron al verificar con Chrome los criterios que
las tres rondas de revisión no pudieron comprobar sin navegador. Correcciones
puntuales, fuera del bucle formal.

| Criterio | Fallo | Causa y corrección |
|---|---|---|
| **AC10** | Tras `Esc`, `document.activeElement` era `<body>` en vez del botón que abrió el buscador. | Radix solo restaura el foco cuando el disparador y el contenido están unidos por `Dialog.Trigger`. El pestillo de carga diferida (I-5) monta el diálogo **ya abierto**, así que Radix nunca registró el elemento previo. El header guarda ahora en `ui.store` el disparador real —`event.currentTarget` al hacer clic, o el único visible según el breakpoint cuando se abre con `⌘K`— y `search-dialog` lo reenfoca en el frame siguiente al cerrar, con `preventScroll` para no deshacer el salto al catálogo. Cubre las tres salidas: `Esc`, clic fuera y elegir un resultado. |
| **AC12** | El icono del carrito no mostraba ninguna insignia con el número de unidades. | La insignia existía, pero colgaba de una bandera `hydrated` que **nunca se levantaba**. `onRehydrateStorage` hacía `useCartStore.setState(...)`, y ese callback corre dentro de `create()`, cuando el `const useCartStore` sigue en su zona muerta temporal: la `ReferenceError` la absorbía la cadena de promesas de `persist`, que además marcaba la rehidratación como fallida (`hasHydrated()` se quedaba en `false` para siempre). Explica por qué el drawer sí funcionaba —lee `lines`— y la insignia no. Se elimina la bandera propia y se lee el estado de la API de `persist` con `useSyncExternalStore` (`useCartHydrated()`), cuyo `getServerSnapshot` devuelve `false` y evita el mismatch de hidratación. |

Reproducido y verificado con un `localStorage` simulado y una vuelta real de
`persist`: antes `hasHydrated() === false` con las líneas ya restauradas; después
`true`, con lo que la insignia se pinta. Queda pendiente la confirmación final en
Chrome de ambos criterios.
