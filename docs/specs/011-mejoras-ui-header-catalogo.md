---
id: 011
title: Mejoras UI — base visual, tarjeta de producto, catálogo y header (1/3)
status: done
module: storefront
scope: client
created: 2026-09-10
series: mejoras-ui — parte 1 de 3 (011 · 012 · 013)
supersedes: docs/specs/010-mejoras-ui.md (fases 1–3)
reference: https://simple.ripley.com.pe/
---

# 011 — Mejoras UI: base visual, tarjeta de producto, catálogo y header

> **Serie «mejoras-ui».** Este spec es la parte **1 de 3** del documento
> `docs/specs/010-mejoras-ui.md`, que se partió porque sus 12 decisiones, 21
> archivos nuevos y 24 modificados no caben en un ciclo `developer ⇄ reviewer`
> de 3 iteraciones (CLAUDE.md §3). El reparto:
>
> | Spec | Decisiones del documento original | Contenido |
> |:---|:---|:---|
> | **011 (este)** | D-11 (parcial), D-3, D-4, D-1 | Base CSS, tarjeta de producto, catálogo, header |
> | 012 | D-5, D-6, D-8, D-9 | Ficha de producto, carrito, footer, checkout |
> | 013 | D-2, D-7, D-10, D-12 | Promociones, categorías, cuenta, mobile |
>
> Cada parte se aprueba, implementa y revisa por separado. 011 va primero
> porque toca los tokens globales y la tarjeta de producto, de los que dependen
> las otras dos.

## 1. Contexto

El storefront tiene identidad visual propia (paleta Nexbyte sobre
`[data-surface="storefront"]`, tokens `nx-*`, dark mode completo, glassmorphism
en el header, orbes decorativos, `@keyframes` para el marquee, `Reveal` con
`motion`) y cumple lo funcional de los specs 004–009. Comparado con tiendas de
referencia del mercado peruano —se inspeccionó `simple.ripley.com.pe` el 9 de
septiembre de 2026—, la densidad de información y varios patrones de navegación
están por debajo de lo que espera un comprador de tecnología.

Esta primera parte ataca lo que se ve antes de entrar a un producto: el pulido
global de bajo riesgo, la tarjeta del catálogo, la propia rejilla del catálogo y
la cabecera.

### Estado verificado del código (2026-09-10)

Todo lo que sigue se comprobó leyendo los archivos, no de memoria:

- `product-card.tsx` es un Server Component: imagen, eyebrow de categoría en
  `text-nx-faint`, nombre con enlace extendido, señal de stock, precio + precio
  tachado + badge `−N %`, y `AddToCartButton` siempre visible. Ya hace
  `group-hover:scale-[1.07]` sobre la imagen y `hover:nx-shadow-lg` sobre la
  tarjeta; **no** hay elevación (`translateY`), rating, marca ni badge de envío.
- `catalog-section.tsx` fija `sort: 'featured'` y `page: 1` en duro, pinta chips
  horizontales de categoría, no muestra el total y no pagina. Su `initialData`
  solo se pasa cuando `category === 'all' && catalogQuery === ''`.
- `catalogQuerySchema` (`src/modules/products/schemas/catalog.schema.ts`) ya
  acepta `sort: 'featured' | 'newest' | 'price_asc' | 'price_desc'`, `page ≥ 1`
  y `pageSize ≤ 48`; la respuesta trae `meta: { page, pageSize, total, totalPages }`.
  El ordenamiento y la paginación de D-4 no necesitan tocar el endpoint.
- `ui.store.ts` es Zustand puro con `categoryFilter` y `catalogQuery`: añadir
  `catalogSort` y `catalogPage` sigue exactamente el patrón existente.
- `MotionProvider` aplica `reducedMotion="user"` a todo el subárbol del
  storefront, y `globals.css` apaga las animaciones CSS con su propia
  `@media (prefers-reduced-motion: reduce)`.
- `src/components/ui/skeleton.tsx` emite `data-slot="skeleton"`: el shimmer se
  puede aplicar desde `globals.css` sin editar el componente de shadcn.
- El foco visible del storefront ya existe en `globals.css`
  (`[data-surface='storefront'] :is(a, button):focus-visible`) con
  `outline-offset: 3px`.
- `storefront-header.tsx` es un Client Component de una sola fila (h-16) con
  logo, nav de anclas, disparador de búsqueda de `min-w-[250px]`, `ThemeToggle`,
  carrito con badge sin animación, `authSlot` y botón de menú móvil.
- `announcement-bar.tsx` usa `bg-foreground text-background` y un marquee CSS.
- Existe `useCatalogCategories()` (`src/modules/categories/hooks/`) sobre el
  endpoint público `GET /api/categories`: el mega-menú puede leer categorías
  reales sin prop drilling desde el layout.
- **No existe la ruta `/products`**: el catálogo vive en la sección `#catalogo`
  de la portada. Todo lo de D-4 se aplica ahí.
- Componentes shadcn ya instalados y utilizables: `select`, `checkbox`,
  `dropdown-menu`, `sheet`, `dialog`, `command`, `badge`, `separator`,
  `skeleton`. **No** están instalados `popover`, `accordion`, `tooltip`,
  `pagination`, `breadcrumb` ni `carousel`.

## 2. Objetivo

Un visitante que llega a la portada encuentra una cabecera de dos niveles con
acceso directo a las categorías reales, y un catálogo que puede ordenar, filtrar
desde un sidebar y recorrer página a página, con tarjetas de producto que
muestran de un vistazo marca, disponibilidad logística y jerarquía de precio.

## 3. Alcance

### Incluye

- Utilidades globales en `globals.css` dentro del scope
  `[data-surface="storefront"]`: shimmer de skeletons, elevación de tarjeta,
  refuerzo del anillo de foco.
- Botón flotante de «Subir» y barra de progreso de scroll de la ficha.
- Rediseño de `ProductCard` con marca, rating decorativo, badge de logística y
  jerarquía de precio.
- Sidebar de filtros, ordenamiento, contador de resultados y paginación en la
  sección de catálogo de la portada.
- Header de dos niveles con mega-menú de categorías, búsqueda prominente, badge
  de envío a Lima y animación del contador del carrito.

### No incluye (explícito)

- **Ninguna dependencia npm nueva.** Todo sale de `motion`, `lucide-react`,
  `radix-ui`/shadcn, `zustand` y `@tanstack/react-query`, ya instalados.
- **Ningún cambio de modelo de datos ni de Route Handler.** El endpoint
  `GET /api/products` ya soporta lo que pide D-4.
- **Nada del grupo `(admin)`.** El scope es `[data-surface="storefront"]`.
- Ficha de producto, carrito, footer y checkout → **spec 012**.
- Banners promocionales, categorías, cuenta y mobile → **spec 013**.
- Del D-11 original quedan fuera de esta serie el **toast con mini-preview** y
  las **transiciones de página**: ver §11.
- «Vista rápida» (quick view) de la tarjeta, marcada como opcional en el
  documento original: ver §11.

## 4. Criterios de aceptación

Renumerados. Entre paréntesis, su equivalente en el documento 010.

- [ ] **AC1** (010-AC10) — Dado el fallback de carga de la portada o de la
      rejilla del catálogo, cuando se está esperando datos, entonces cada
      `Skeleton` del storefront muestra un shimmer que se desplaza, no un gris
      plano.
- [ ] **AC2** (010-AC9) — Dado el scroll de cualquier página del storefront,
      cuando se supera 400 px, entonces aparece un botón circular fijo abajo a la
      derecha que devuelve al inicio del documento, con nombre accesible y ≥ 44 px
      de lado.
- [ ] **AC3** (nuevo, D-11) — Dada la ficha de producto, cuando se hace scroll,
      entonces una barra de 2 px en el borde superior del viewport refleja el
      progreso. En el resto de páginas del storefront esa barra no existe.
- [ ] **AC4** (010-AC2) — Dadas las tarjetas de producto, cuando se renderizan,
      entonces muestran la categoría como marca (mayúsculas, `font-bold`, color
      `foreground`), el badge «Envío 24h» en la esquina superior derecha del arte
      salvo si `stockLevel === 'out'`, y la jerarquía de precio con el precio
      anterior tachado encima y el actual debajo en tamaño mayor.
- [ ] **AC5** (010-AC3) — Dado el hover sobre una tarjeta de producto en un
      dispositivo con puntero fino, cuando el cursor entra, entonces la tarjeta
      se eleva `translateY(-4px)`, la sombra pasa a `nx-shadow-lg` y la imagen
      escala a `1.07`. En dispositivos sin hover no se oculta ningún control.
- [ ] **AC6** (010-AC4) — Dada la sección de catálogo en ≥ 1024 px, cuando se
      carga, entonces hay un sidebar izquierdo con la lista de categorías y su
      conteo, y el filtro de disponibilidad; bajo 1024 px se mantienen los chips
      horizontales actuales.
- [ ] **AC7** (nuevo, D-4) — Dado el desplegable de ordenamiento, cuando se elige
      «Precio: menor a mayor», entonces la rejilla se recarga con
      `sort=price_asc` y la primera página, sin recargar el documento.
- [ ] **AC8** (010-AC5) — Dada una consulta con más resultados que
      `CATALOG_PAGE_SIZE`, cuando se pulsa «Siguiente», entonces la rejilla
      muestra la página 2, el contador indica el total de resultados y
      «Anterior» queda habilitado; en la última página «Siguiente» queda
      deshabilitado.
- [ ] **AC9** (010-AC1) — Dado el header en ≥ 1024 px, cuando se carga, entonces
      se ve en dos filas: (1) logo, búsqueda de ≥ 360 px, badge de envío, tema,
      carrito y sesión; (2) mega-menú de categorías y navegación. Bajo 1024 px
      sigue en una sola fila.
- [ ] **AC10** (nuevo, D-1) — Dado el mega-menú, cuando se abre, entonces lista
      las categorías reales que devuelve `GET /api/categories` con su icono y su
      conteo, se cierra con `Esc`, es navegable con teclado y devuelve el foco al
      disparador.
- [ ] **AC11** (nuevo, D-1) — Dado el contador del carrito, cuando se incrementa,
      entonces el badge da un pulso de escala; con `prefers-reduced-motion:
      reduce` el número cambia sin animación.
- [ ] **AC12** (010-AC14) — Dado el tema oscuro, cuando se recorren todos los
      componentes nuevos de este spec, entonces ninguno usa un color hardcoded:
      todos heredan tokens `nx-*` o variables semánticas de shadcn.
- [ ] **AC13** (010-AC15) — Dado `prefers-reduced-motion: reduce`, cuando se
      carga cualquier página del storefront, entonces no queda ninguna animación
      nueva en marcha (shimmer, elevación de tarjeta, pulso del badge, entrada
      del botón «Subir») y todo el contenido se ve en su estado final.
- [ ] **AC14** (010-AC16) — Dado `package.json`, cuando termina la
      implementación, entonces sus dependencias son idénticas a las del inicio.
- [ ] **AC15** (heredado de spec 004, AC10/AC17) — Dado el teclado, cuando se
      tabula por los controles nuevos, entonces todos tienen foco visible, ≥ 44 px
      de objetivo táctil y ninguno provoca scroll horizontal a 390 px.

## 5. Modelo de datos

**Sin cambios de esquema.** No se crean ni modifican tablas, columnas ni
migraciones. Todo lo que pinta este spec sale de los datos que ya devuelven
`GET /api/products` y `GET /api/categories`.

El rating de estrellas de D-3 es **decorativo**: no hay tabla `reviews` y el
componente se diseña con `value: number | null` para poder conectarse cuando
exista, mostrándose vacío/oculto mientras `value` sea `null`.

## 6. Contratos de API

**Sin endpoints nuevos y sin cambios de contrato.** Se consumen dos existentes:

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/products` | público | `q?`, `category`, `sort`, `discounted`, `page`, `pageSize` (query, `catalogQuerySchema`) | `CatalogProductListResponse` | 400, 500 |
| GET | `/api/categories` | público | — | `CatalogCategoryListResponse` | 500 |

`sort` acepta exactamente `featured | newest | price_asc | price_desc`
(verificado en `catalogQuerySchema`), que es el conjunto que debe ofrecer
`SortSelect`. `pageSize` tiene tope 48; el catálogo seguirá usando
`CATALOG_PAGE_SIZE = 12`.

Ningún componente llama a `axios` directo: el consumo pasa por
`useCatalogProducts()` y `useCatalogCategories()` (CLAUDE.md, regla 2).

## 7. Arquitectura y archivos afectados

Todo vive en la capa de presentación (`src/modules/storefront/`), más un archivo
de estilos globales y un store de UI. **No se toca `src/server/`, `src/app/api/`
ni `src/modules/products/services`.**

### 7.1 D-11 (parcial) — Base de CSS y micro-interacciones

Del D-11 original entran aquí los cinco puntos de bajo riesgo. El toast y las
transiciones de página quedan fuera (§11).

| Elemento | Cambio |
|:---|:---|
| **Skeleton shimmer** | `@keyframes nx-shimmer` + regla sobre `[data-surface='storefront'] [data-slot='skeleton']`: gradiente que se desplaza sobre `--nx-inset`. Alcanza de golpe a `HomeSkeleton`, a los skeletons del catálogo, del historial de compras y del resumen de checkout, sin editar `src/components/ui/skeleton.tsx`. Neutralizado en la media query de reduced-motion que ya existe. |
| **Elevación de tarjeta** | Utilidad `.nx-hover-lift`: `transition: transform, box-shadow`; en `@media (hover: hover)` aplica `translateY(-4px)` y `--nx-shadow-lg` al hover. Fuera de la media query no hay transformación, así que en táctil no queda un estado «pegado». |
| **Focus ring** | Subir `outline-offset` de 3 px a 4 px en la regla existente y usar `var(--ring)`, que ya vale `#6d5ef8` en claro y `#8b7eff` en oscuro. Es un ajuste de una línea, no una regla nueva. |
| **Scroll-to-top** | `ScrollToTop`: botón circular fijo `bottom-right`, aparece pasados 400 px con `motion` (fade + scale). Listener de scroll `passive`. `aria-label="Volver arriba"`, `size-11`. Se reserva la variable de posición `--nx-fab-bottom` para que la barra inferior de móvil del spec 013 pueda desplazarlo sin reescribir el componente. |
| **Scroll progress** | `ScrollProgress`: barra de 2 px, `position: fixed; top: 0`, color `--primary`, ancho por `scaleX` según `scrollY / (scrollHeight - innerHeight)`. Solo en la ficha de producto. `aria-hidden`: es decoración, el progreso ya lo comunica la barra del navegador. |
| **Cursor** | Verificar que toda la superficie clicable de la tarjeta tiene `cursor: pointer`. Hoy lo da el `<a>` extendido; solo hay que comprobarlo, no añadir CSS. |

**Archivos**
- `MODIFY` `src/app/globals.css`
- `NEW` `src/modules/storefront/components/scroll-to-top.tsx`
- `NEW` `src/modules/storefront/components/scroll-progress.tsx`
- `MODIFY` `src/modules/storefront/components/storefront-overlays.tsx` (monta `ScrollToTop`)
- `MODIFY` `src/app/(storefront)/products/[slug]/layout.tsx` (monta `ScrollProgress`)

> `home-skeleton.tsx` **no** se modifica: el shimmer entra por el selector
> `data-slot`, que ya emiten todos sus `<Skeleton>`. El documento 010 lo listaba
> como modificado; es innecesario.

### 7.2 D-3 — Tarjetas de producto con mayor densidad

| Elemento | Cambio |
|:---|:---|
| **Marca / categoría** | La categoría pasa de eyebrow tenue a marca visual: `uppercase`, `font-bold`, `text-foreground`, `tracking-[0.09em]`, tamaño 11 px. Sigue siendo `product.categoryName`; no se inventa un campo `brand`. |
| **Rating decorativo** | `StarRating` con prop `value: number | null`. Con `null` no renderiza nada; con un número pinta 5 estrellas rellenas hasta el valor. En la tarjeta se pasa un valor fijo de 5 — **es decoración declarada, no hay tabla `reviews`**. El bloque va `aria-hidden` y **sin** texto alternativo: anunciar «5 de 5 estrellas» a un lector de pantalla sería afirmar un dato que no existe. |
| **Badge de logística** | `LogisticsBadge`: «Envío 24h» sobre `bg-nx-ok`, esquina superior **derecha** del arte (el de descuento ya ocupa la izquierda), `pointer-events-none` como el existente para no tapar el enlace extendido. Se muestra cuando `stockLevel !== 'out'`. Es coherente con lo que ya afirma la ficha («Envío en 24 h en pedidos antes de las 18:00»), no una promesa nueva. |
| **Jerarquía de precio** | Con descuento: precio anterior tachado en una línea superior pequeña, precio actual debajo mayor y en `text-primary`, badge `−N %` en `bg-nx-sale`. Sin descuento: solo el precio actual en `foreground`. Se conserva la invariante de spec 004/005: badge y precio tachado son la misma condición. |
| **Hover** | `.nx-hover-lift` sobre el `<article>`, manteniendo el `scale-[1.07]` de la imagen que ya existe. |
| **Botón de añadir** | Aparece con transición de opacidad al hover **solo** bajo `@media (hover: hover)` y siempre visible con `group-focus-within`. En táctil y con teclado no desaparece nunca: un control que solo existe en hover es inalcanzable en móvil y para navegación por teclado. |

**Archivos**
- `MODIFY` `src/modules/storefront/components/product-card.tsx`
- `MODIFY` `src/modules/storefront/components/add-to-cart-button.tsx`
- `NEW` `src/modules/storefront/components/star-rating.tsx`
- `NEW` `src/modules/storefront/components/logistics-badge.tsx`
- `MODIFY` `src/app/globals.css` (la utilidad `.nx-hover-lift` de §7.1)

### 7.3 D-4 — Catálogo con sidebar, orden y paginación

| Elemento | Cambio |
|:---|:---|
| **Layout de dos columnas** | En ≥ 1024 px: `grid-cols-[240px_minmax(0,1fr)]`, sidebar a la izquierda. Bajo 1024 px el sidebar no se renderiza y quedan los chips horizontales actuales, que ya funcionan con scroll-snap. |
| **Sidebar** | `CatalogSidebar`: (1) «Categorías» como lista vertical de botones con nombre + conteo, marcando la activa con `aria-pressed`; (2) «Disponibilidad» con checkboxes (`En stock` / `Últimas unidades`) que **filtran en cliente sobre la página cargada**, porque `catalogQuerySchema` no tiene parámetro de stock; (3) «Precio» como placeholder deshabilitado con la leyenda «Próximamente». Secciones colapsables con `<details>`/`<summary>` estilado: shadcn `accordion` no está instalado y no hace falta traerlo. |
| **Ordenamiento** | `SortSelect` sobre el `Select` de shadcn ya instalado. Opciones ↔ valores del schema: Relevancia → `featured`, Más recientes → `newest`, Precio menor a mayor → `price_asc`, Precio mayor a menor → `price_desc`. |
| **Contador** | «N productos encontrados» a partir de `query.data.meta.total`. Con `isPending`, un skeleton en su sitio para no saltar el layout. |
| **Paginación** | `CatalogPagination`: «Anterior» / «Siguiente» + números, sobre `meta.page` y `meta.totalPages`. Es `<nav aria-label="Paginación del catálogo">`; la página actual lleva `aria-current="page"`. Al cambiar de página, `scrollIntoView` al inicio de la sección. |
| **Estado** | `catalogSort` y `catalogPage` en `ui.store.ts`, igual que `categoryFilter` y `catalogQuery`. Cambiar categoría, término u orden **resetea `catalogPage` a 1** dentro del propio setter del store: si el reset viviera en el componente, cualquier otro disparador (marquee, buscador, mega-menú) dejaría una página fuera de rango. |

**Archivos**
- `MODIFY` `src/modules/storefront/store/ui.store.ts`
- `MODIFY` `src/modules/storefront/components/catalog-section.tsx`
- `NEW` `src/modules/storefront/components/catalog-sidebar.tsx`
- `NEW` `src/modules/storefront/components/sort-select.tsx`
- `NEW` `src/modules/storefront/components/catalog-pagination.tsx`

### 7.4 D-1 — Header de dos niveles y mega-menú

| Elemento | Cambio |
|:---|:---|
| **Barra de avisos** | `bg-primary text-primary-foreground` en lugar de `bg-foreground text-background`. Se mantiene el marquee CSS y la copia `aria-hidden`. Comprobar contraste en ambos temas: `--primary` es `#6d5ef8` en claro sobre `--primary-foreground` blanco, y `#8b7eff` sobre `#0a0a0f` en oscuro. |
| **Dos filas** | En ≥ 1024 px: fila 1 (h-16) con logo, búsqueda, badge de envío, tema, carrito, sesión; fila 2 (h-11) con el mega-menú y `STOREFRONT_NAV`. Bajo 1024 px se conserva la fila única actual. El estado `stuck` y el glassmorphism siguen aplicándose al `<header>` completo. |
| **Búsqueda prominente** | El disparador pasa de `min-w-[250px]` a `min-w-[360px]`, fondo `bg-card` con borde marcado, lupa a la izquierda y `AnimatedSearchPlaceholder` rotando frases. Sigue siendo el mismo `<button>` que abre el overlay `cmdk` y conserva `⌘K` y la devolución de foco (spec 004, AC10). |
| **Placeholder rotativo** | `AnimatedSearchPlaceholder`: rota entre frases fijas con `setInterval`. **No arranca hasta después del montaje** (primer render = primera frase) para no provocar mismatch de hidratación, y se detiene con `useReducedMotion()` de `motion/react`, dejando la primera frase fija. |
| **Mega-menú** | `CategoryMegaMenu` sobre `DropdownMenu` de shadcn (ya instalado; `popover` no lo está). Botón «Categorías» con icono hamburguesa, panel en rejilla con `getCategoryIcon(slug)` + nombre + conteo. Los datos vienen de `useCatalogCategories()`, no de props: el header es cliente y está en el layout, y el hook ya cachea la lista en TanStack Query con el mismo `staleTime` del catálogo. Solo desktop (`hidden lg:flex`). Cada ítem usa `CategoryJumpLink`, que ya deja el filtro puesto al aterrizar en `#catalogo`. |
| **Badge del carrito** | Pulso de escala al cambiar `itemCount`, con `motion` (`key={itemCount}` + `initial/animate`). `MotionProvider` ya lo neutraliza bajo reduced-motion. Se mantiene la guarda `hydrated` que evita el mismatch de hidratación. |
| **Envío a Lima** | `DeliveryLocationBadge`: icono `MapPin` + «Enviar a Lima». **Estático y decorativo**, sin modelo de ubicaciones detrás. Se renderiza como `<span>`, no como botón: no debe parecer que se puede cambiar. |

**Archivos**
- `MODIFY` `src/modules/storefront/components/storefront-header.tsx`
- `MODIFY` `src/modules/storefront/components/announcement-bar.tsx`
- `NEW` `src/modules/storefront/components/category-mega-menu.tsx`
- `NEW` `src/modules/storefront/components/delivery-location-badge.tsx`
- `NEW` `src/modules/storefront/components/animated-search-placeholder.tsx`

> `mobile-menu.tsx` **no** se toca en este spec. El documento 010 lo listaba en
> D-1 y en D-12; se implementa una sola vez, en el **spec 013** (D-12), junto con
> el resto del trabajo de móvil.

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Shimmer por selector `[data-slot='skeleton']` dentro de `[data-surface='storefront']` | Editar `src/components/ui/skeleton.tsx` o añadir una clase en cada `<Skeleton>` | CLAUDE.md §6 prohíbe editar a mano los componentes de shadcn salvo tokens. Una regla CSS alcanza a los cuatro sitios que ya usan `Skeleton` en la tienda, y el panel admin —que no lleva `data-surface`— se queda intacto. |
| El sidebar filtra disponibilidad **en cliente** | Añadir `stock` al `catalogQuerySchema` y al repositorio | El alcance dice explícitamente que no se tocan Route Handlers ni repositorios, y `stockLevel` ya viaja en cada `CatalogProduct`. Se documenta como deuda: con paginación de servidor, el filtro solo aplica a la página visible (§10). |
| `catalogPage` se resetea dentro de los setters del store | Resetear en un `useEffect` de `catalog-section` | Hay cuatro disparadores del filtro repartidos por la página (chips, sidebar, marquee, buscador, mega-menú). En el setter el invariante es imposible de saltarse; en un efecto se olvida en cuanto aparece un quinto. |
| `initialData` solo cuando `category==='all' && catalogQuery==='' && sort==='featured' && page===1` | Dejar la condición actual de dos términos | El Server Component siembra exactamente esa combinación. Si no se amplía la guarda al añadir `sort` y `page`, TanStack Query sembraría la caché de `price_asc` con la respuesta de `featured` (spec 004, AC8). |
| Mega-menú sobre `DropdownMenu` de shadcn | `Popover` (no instalado) o un panel a mano | Trae de serie foco atrapado, `Esc`, navegación con flechas y devolución del foco, que es la mitad de AC10. `radix-ui` ya es dependencia: `npx shadcn add popover` no añadiría paquete npm, pero tampoco aporta nada sobre `DropdownMenu` aquí. |
| El mega-menú lee categorías con `useCatalogCategories()` | Pasarlas desde el layout como prop al header | El header es un Client Component montado en el layout; el layout ya evita bloquear en Neon metiendo la lectura del footer en `<Suspense>`. Prop-drillear la lista obligaría a `await` en el layout, que es justo lo que spec 004 quitó de ahí. El hook ya existe, tiene su endpoint público y comparte `staleTime`. |
| Secciones colapsables con `<details>/<summary>` | Instalar el `accordion` de shadcn | Es un elemento nativo, accesible sin JavaScript, y evita añadir un componente más al árbol de cliente por tres bloques estáticos. |
| El botón de añadir solo se oculta bajo `@media (hover: hover)` y reaparece con `focus-within` | Ocultarlo siempre y mostrarlo con `group-hover` a secas | Un control que solo aparece en hover no existe en táctil (el 100 % del tráfico móvil) ni para quien navega con teclado. |
| El rating decorativo va `aria-hidden` y sin texto | Exponerlo con `role="img"` y `aria-label="5 de 5"` | No hay reseñas: etiquetarlo sería afirmar un dato falso ante un lector de pantalla. Como decoración visual es coherente con el resto de placeholders del proyecto. |
| `.nx-hover-lift` como utilidad CSS en `globals.css` | Repetir las clases de Tailwind en cada tarjeta | El efecto lo usan la tarjeta de producto (011), la de categoría (013) y las de método de entrega (012). Tres consumidores: es exactamente el umbral de extracción de CLAUDE.md §6. |
| `--nx-fab-bottom` como variable para el botón «Subir» | Fijar `bottom-6` y corregirlo en el spec 013 | La barra inferior de móvil de 013 tapará el botón. Reservar la variable ahora evita que 013 tenga que reabrir un componente ya revisado. |

### Corrección al documento 010

- D-11 afirmaba «al añadir al carrito, el toast actual (Sonner)». **No hay
  toast en el storefront**: `AddToCartButton` da feedback con estado local
  (`justAdded` → «Añadido» + `Check` durante 1400 ms). `Toaster` está montado en
  el layout raíz, pero solo lo usan los hooks de mutación del panel admin, del
  checkout y de tarjetas. Introducir un toast en la tienda es una decisión nueva,
  no una mejora de algo existente, y se difiere a §11.

## 9. Tareas

Ordenadas por dependencia. Cada una toca un archivo y una capa.

**Base visual (D-11)**

- [x] **T1** — Añadir `@keyframes nx-shimmer` y la regla
      `[data-surface='storefront'] [data-slot='skeleton']` con el gradiente
      desplazándose, más su neutralización en el bloque
      `@media (prefers-reduced-motion: reduce)` existente · archivo:
      `src/app/globals.css` · verificación: `npm run build` y los skeletons de la
      portada con brillo (AC1, AC13)
- [x] **T2** — Subir el `outline-offset` del foco del storefront de 3 px a 4 px ·
      archivo: `src/app/globals.css` · verificación: tabular por los chips del
      catálogo (AC15)
- [x] **T3** — Añadir la utilidad `.nx-hover-lift` bajo `@media (hover: hover)` ·
      archivo: `src/app/globals.css` · verificación: `npm run build` (AC5)
- [x] **T4** — `ScrollToTop`: cliente, listener `passive`, umbral 400 px, entrada
      con `motion`, `size-11`, `aria-label`, posición sobre `--nx-fab-bottom` ·
      archivo: `src/modules/storefront/components/scroll-to-top.tsx` ·
      verificación: `npm run typecheck` (AC2)
- [x] **T5** — Montar `ScrollToTop` junto a los overlays diferidos · archivo:
      `src/modules/storefront/components/storefront-overlays.tsx` ·
      verificación: aparece pasados 400 px en portada y ficha (AC2)
- [x] **T6** — `ScrollProgress`: cliente, barra de 2 px `fixed top-0`,
      `aria-hidden`, `scaleX` sobre el progreso de scroll · archivo:
      `src/modules/storefront/components/scroll-progress.tsx` · verificación:
      `npm run typecheck` (AC3)
- [x] **T7** — Montar `ScrollProgress` encima de `children` en el layout de la
      ficha · archivo: `src/app/(storefront)/products/[slug]/layout.tsx` ·
      verificación: la barra existe en `/products/[slug]` y no en `/` (AC3)

**Tarjeta de producto (D-3)**

- [x] **T8** — `StarRating`: Server Component, `value: number | null`, `null` →
      `null`, contenedor `aria-hidden` · archivo:
      `src/modules/storefront/components/star-rating.tsx` · verificación:
      `npm run typecheck` (AC4)
- [x] **T9** — `LogisticsBadge`: «Envío 24h» sobre `bg-nx-ok`,
      `pointer-events-none` · archivo:
      `src/modules/storefront/components/logistics-badge.tsx` · verificación:
      `npm run typecheck` (AC4)
- [x] **T10** — Rediseñar la tarjeta: marca en mayúsculas bold, `StarRating`,
      `LogisticsBadge` arriba a la derecha si `stockLevel !== 'out'`, jerarquía de
      precio en dos líneas y `.nx-hover-lift` · archivo:
      `src/modules/storefront/components/product-card.tsx` · verificación:
      `npm run build` y la rejilla de la portada (AC4, AC5)
- [x] **T11** — Revelar el botón de añadir con opacidad solo bajo
      `@media (hover: hover)`, forzando `opacity-100` con `group-focus-within` ·
      archivo: `src/modules/storefront/components/add-to-cart-button.tsx` ·
      verificación: el botón sigue siendo alcanzable con Tab y en 390 px (AC5, AC15)

**Catálogo (D-4)**

- [x] **T12** — Añadir `catalogSort` y `catalogPage` con sus setters, y resetear
      `catalogPage` a 1 dentro de `setCategoryFilter`, `setCatalogQuery` y
      `setCatalogSort` · archivo:
      `src/modules/storefront/store/ui.store.ts` · verificación:
      `npm run typecheck` (AC7, AC8)
- [x] **T13** — `SortSelect` sobre el `Select` de shadcn con las cuatro opciones
      del schema · archivo:
      `src/modules/storefront/components/sort-select.tsx` · verificación:
      `npm run typecheck` (AC7)
- [x] **T14** — `CatalogPagination`: `<nav>` con Anterior/Siguiente y números,
      `aria-current="page"`, extremos deshabilitados · archivo:
      `src/modules/storefront/components/catalog-pagination.tsx` ·
      verificación: `npm run typecheck` (AC8)
- [x] **T15** — `CatalogSidebar`: categorías con conteo, disponibilidad con
      checkbox, precio como placeholder deshabilitado, secciones en
      `<details>` · archivo:
      `src/modules/storefront/components/catalog-sidebar.tsx` · verificación:
      `npm run typecheck` (AC6)
- [x] **T16** — Integrar en el catálogo: rejilla de dos columnas ≥ 1024 px,
      `sort`/`page` desde el store hacia `useCatalogProducts`, contador con
      `meta.total`, paginación al pie y la guarda de `initialData` ampliada a
      `sort==='featured' && page===1` · archivo:
      `src/modules/storefront/components/catalog-section.tsx` · verificación:
      `npm run build`, cambiar orden y página sin refetch espurio de la primera
      combinación (AC6, AC7, AC8)

**Header (D-1)**

- [x] **T17** — Cambiar el fondo de la barra de avisos a `bg-primary
      text-primary-foreground` · archivo:
      `src/modules/storefront/components/announcement-bar.tsx` ·
      verificación: contraste legible en claro y oscuro (AC12)
- [x] **T18** — `DeliveryLocationBadge`: `<span>` con `MapPin` y «Enviar a Lima»,
      decorativo · archivo:
      `src/modules/storefront/components/delivery-location-badge.tsx` ·
      verificación: `npm run typecheck` (AC9)
- [x] **T19** — `AnimatedSearchPlaceholder`: rotación por `setInterval` iniciada
      tras el montaje y detenida con `useReducedMotion()` · archivo:
      `src/modules/storefront/components/animated-search-placeholder.tsx` ·
      verificación: sin warning de hidratación en consola (AC13)
- [x] **T20** — `CategoryMegaMenu` sobre `DropdownMenu`, alimentado por
      `useCatalogCategories()`, con icono y conteo por categoría y estados de
      carga y error · archivo:
      `src/modules/storefront/components/category-mega-menu.tsx` ·
      verificación: abre, cierra con `Esc` y devuelve el foco (AC10)
- [x] **T21** — Reestructurar el header en dos filas ≥ 1024 px, ampliar el
      disparador de búsqueda a `min-w-[360px]` con el placeholder rotativo, montar
      el mega-menú y el badge de envío, y animar el contador del carrito ·
      archivo: `src/modules/storefront/components/storefront-header.tsx` ·
      verificación: `npm run build`, `⌘K` sigue funcionando y el foco vuelve al
      disparador correcto (AC9, AC11, AC15)

**Cierre**

- [x] **T22** — `npm run typecheck && npm run lint && npm run build` en verde y
      `git diff package.json` sin dependencias nuevas de este spec · verificación:
      AC14. La única línea que aparece en el diff es `stripe`, que la introdujo el
      spec 007 y ya estaba antes de empezar 011.

### 9.1 Correcciones de la revisión — iteración 1

Hallazgos del `reviewer` sobre la implementación de T1–T22, corregidos sin abrir
alcance nuevo.

- [x] **R1** (bloqueante) — El `{...rest}` de `CategoryJumpLink` iba **después**
      del `onClick`, así que el manejador que `DropdownMenuItem asChild` inyecta
      vía Radix Slot pisaba al de `setCategoryFilter` y el mega-menú saltaba a
      `#catalogo` con la categoría anterior. `onClick` pasa a prop declarada y se
      compone: primero el filtro, luego el manejador del padre · archivo:
      `src/modules/storefront/components/category-jump-link.tsx` · los otros cuatro
      consumidores (`categories-section`, `category-marquee`, `product-breadcrumb`,
      `storefront-footer`) no pasan `onClick`, así que no cambian de comportamiento
      (AC10)
- [x] **R2** (mayor) — `DeliveryLocationBadge` pasa de `xl:inline-flex` (1280 px) a
      `lg:inline-flex`: AC9 lo exige desde 1024 px, el mismo ancho en el que el
      header se despliega en dos filas · archivo:
      `src/modules/storefront/components/delivery-location-badge.tsx` (AC9)
- [x] **R3** (mayor) — El `sticky top-24` del sidebar (96 px) no cubría el header
      de dos filas (~109 px). Se introduce `--nx-header-h` en `globals.css`
      (`4rem`, y `6.8125rem` desde `min-width: 64rem`) y el sidebar usa
      `top-[calc(var(--nx-header-h)+1rem)]`. Es variable y no número fijo porque
      012 y 013 vuelven a necesitar la misma medida · archivos:
      `src/app/globals.css`, `src/modules/storefront/components/catalog-sidebar.tsx`
      (AC6)
- [x] **R4** (menor) — Las cuatro secciones ancladas pasan de `scroll-mt-24` a
      `scroll-mt-[calc(var(--nx-header-h)+1.5rem)]`, derivado de la variable de R3:
      con el header nuevo quedaban ~13 px por debajo de la cabecera al saltar ·
      archivos: `catalog-section.tsx`, `deals-section.tsx`, `categories-section.tsx`,
      `features-section.tsx` (+ comentario de `hash-scroll.tsx`, que citaba la clase
      vieja)
- [x] **R5** (menor) — El contador de resultados no anunciaba la primera carga: el
      `aria-live="polite"` nacía junto al texto, sustituyendo al `Skeleton`. Ahora
      la región viva envuelve a los dos y solo cambia su contenido · archivo:
      `src/modules/storefront/components/catalog-section.tsx` (AC15)
- [x] **R6** (menor) — `--nx-ok` en la paleta clara pasa de `#4f8b00` a `#417000`:
      con `--nx-on-accent` blanco daba ≈4.18:1, por debajo de AA para texto
      pequeño; ahora ≈5.9:1. Se cambia en los dos bloques claros (raíz del
      storefront y overlays de Radix). Los otros tres consumidores lo usan como
      color de texto (`cart-drawer`, `product-detail`, `order-confirmation`) y
      también mejoran · archivo: `src/app/globals.css` (AC12)
- [x] **R7** (menor) — El badge de descuento cambia `text-white` literal por
      `text-nx-on-accent`, el mismo patrón que el resto de badges de acento ·
      archivo: `src/modules/storefront/components/product-card.tsx` (AC12)
- [x] **R8** (menor) — El comentario del bloque de reduced-motion decía «banda
      clara fija»; el gradiente va de `--nx-inset` a `--nx-sunken`, que es más
      oscuro en ambos temas · archivo: `src/app/globals.css`

### 9.2 Correcciones de la revisión — iteración 2

- [x] **R9** (mayor) — Quedaban dos residuos del offset viejo (96 px) en la vista
      `/account`, que usa el mismo header pegajoso de dos filas: el rail lateral
      con `sticky top-24` —visible justo desde `lg`, el breakpoint en el que el
      header crece a 109 px— y las secciones con `scroll-mt-24`, cuyas anclas
      (`#perfil`, `#favoritos`, `#compras`, `#tarjetas`) aterrizaban ~13 px por
      debajo de la cabecera. Ambos pasan a derivar de `--nx-header-h`, igual que
      R3 y R4: `top-[calc(var(--nx-header-h)+1rem)]` y
      `scroll-mt-[calc(var(--nx-header-h)+1.5rem)]`. Los dos archivos cuelgan de
      `[data-surface='storefront']`, así que la variable ya estaba en su ámbito y
      no se redefine · archivos:
      `src/modules/storefront/components/account-nav.tsx`,
      `src/modules/storefront/components/account-section.tsx` (+ comentario de
      `account-section.tsx`, que citaba la clase vieja) (AC6, AC10)

### 9.3 Corrección puntual fuera del bucle — post iteración 3

- [x] **R10** (mayor) — El barrido de R9 no llegó a `src/modules/orders/`: el panel
      de resumen de `/checkout` seguía en `lg:top-24` (96 px), mismo defecto que R3,
      R4 y R9 sobre el header de 109 px. La afirmación de que el spec 012 lo cubría
      era incorrecta (012 T14 prohíbe explícitamente tocar esa rejilla). Corregido
      igual que los casos anteriores: `lg:top-[calc(var(--nx-header-h)+1rem)]` ·
      archivo: `src/modules/orders/components/checkout-summary.tsx`. Verificado
      solo con `npm run build` (cambio mecánico de una clase, sin lógica), según
      autorizó la opción A del reviewer en la iteración 3/3.

## 10. Riesgos y consideraciones

- **Regresión de spec 004/005.** El header concentra cuatro comportamientos ya
  revisados: estado `stuck`, `⌘K`, devolución de foco a `desktopSearchRef` /
  `mobileSearchRef`, y la guarda `hydrated` del badge. Reestructurar en dos filas
  puede romper cualquiera de ellos: la referencia del disparador visible se elige
  con `offsetParent === null`, y un cambio de breakpoint altera cuál está oculto.
- **`initialData` y la caché.** Es el fallo más fácil de esta feature: si la
  guarda no se amplía con `sort` y `page`, el catálogo sembrará la clave
  equivocada y habrá un refetch inmediato o, peor, datos de otra consulta.
- **Filtro de disponibilidad sobre página paginada.** Al filtrar en cliente,
  «En stock» solo esconde tarjetas de la página visible: el contador seguirá
  mostrando el total del servidor. Hay que redactar el texto para que no mienta
  («N productos encontrados», no «N en stock»).
- **Contraste de la barra de avisos.** `bg-primary` con `text-primary-foreground`
  en el tema oscuro es violeta claro sobre casi negro: se ve, pero conviene
  comprobarlo, porque en claro la pareja se invierte.
- **Peso del cliente.** El mega-menú añade un `DropdownMenu` al bundle del
  header, que ya es cliente. `ProductCard` sigue siendo Server Component y debe
  seguir siéndolo: `StarRating` y `LogisticsBadge` no llevan `"use client"`.
- **Rendimiento del scroll.** Ya hay un listener de scroll en el header. Los dos
  nuevos (`ScrollToTop`, `ScrollProgress`) deben registrarse `passive` y el de
  progreso escribir por `requestAnimationFrame`, no en cada evento.

### Notas de compatibilidad

- Todos los cambios son retrocompatibles: el storefront sigue funcionando entre
  tarea y tarea, y ninguno elimina funcionalidad.
- Dark mode: solo tokens `nx-*` y variables semánticas de shadcn. Ningún color
  literal en los componentes nuevos.
- Accesibilidad: se mantienen los criterios ya establecidos en el spec 004 —
  AC10 (foco y overlays), AC16 (reduced-motion) y AC17 (objetivo táctil ≥ 44 px,
  sin scroll horizontal a 390 px).
- La skill `web-design-guidelines` está instalada pero requiere `WebFetch` para
  descargar sus reglas y esa herramienta no está disponible en la sesión del
  agente `spec`. Los criterios de accesibilidad de este documento salen del
  propio spec 004 y del código verificado, no de la skill.

## 11. Fuera de alcance / deuda aceptada

**Se difiere dentro de la serie mejoras-ui**

- Ficha de producto, cart drawer, footer y checkout → **spec 012**.
- Banners y countdown, categorías, cuenta y todo lo móvil → **spec 013**.
- El menú móvil (`mobile-menu.tsx`) no se toca aquí aunque D-1 lo mencionara:
  su única modificación (categorías reales) se hace en 013 junto a D-12.
- La barra inferior de móvil de 013 tapará el botón «Subir». Por eso este spec
  deja `--nx-fab-bottom` preparada; 013 solo redefine la variable.

**Se difiere fuera de la serie**

- **Toast con mini-preview al añadir al carrito** (D-11 original). Requiere
  introducir Sonner en el storefront, donde hoy no se usa, y sustituir el
  feedback local de `AddToCartButton`. Se retoma si aparece la necesidad de
  confirmar acciones fuera del viewport del botón.
- **Transiciones de página con `AnimatePresence`** (D-11 original). En App
  Router obliga a envolver el `children` del layout en un componente cliente, lo
  que arrastra al bundle todo lo que hoy se sirve desde el servidor. Se retoma
  con `ViewTransition` cuando sea estable.
- **Quick view** de la tarjeta (D-3, ya marcado como opcional en 010). Necesita
  un `Dialog` con carga de datos por producto; con la ficha completa del spec
  012 el valor incremental es bajo.
- **Filtro de stock y de rango de precio en el servidor.** Requiere ampliar
  `catalogQuerySchema` y el repositorio: cambio de contrato, spec propio.
- **Rating real.** `StarRating` queda listo para recibir un `value` de una tabla
  `reviews` que hoy no existe.
- **Ruta `/products` dedicada.** Con el sidebar y la paginación ya construidos,
  extraer el catálogo a su propia URL pasa a ser trivial; sigue sin ser parte de
  esta serie.
