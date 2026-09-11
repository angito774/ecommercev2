---
id: 013
title: Mejoras UI — promociones, categorías, cuenta y móvil (3/3)
status: done
module: storefront
scope: client
created: 2026-09-10
series: mejoras-ui — parte 3 de 3 (011 · 012 · 013)
supersedes: docs/specs/010-mejoras-ui.md (fases 2, 6–8)
depends_on: docs/specs/011-mejoras-ui-header-catalogo.md, docs/specs/012-mejoras-ui-pdp-checkout.md
reference: https://simple.ripley.com.pe/
---

# 013 — Mejoras UI: promociones, categorías, cuenta y móvil

> **Serie «mejoras-ui».** Parte **3 de 3** del documento
> `docs/specs/010-mejoras-ui.md`, partido porque no cabía en un ciclo
> `developer ⇄ reviewer` de 3 iteraciones (CLAUDE.md §3).
>
> | Spec | Decisiones del documento original | Contenido |
> |:---|:---|:---|
> | 011 | D-11 (parcial), D-3, D-4, D-1 | Base CSS, tarjeta, catálogo, header |
> | 012 | D-5, D-6, D-8, D-9 | Ficha de producto, carrito, footer, checkout |
> | **013 (este)** | D-2, D-7, D-10, D-12 | Promociones, categorías, cuenta, móvil |
>
> Va el último porque cierra la pasada móvil sobre componentes que 011 y 012
> acaban de reescribir, y porque es el único que necesita archivos binarios
> (imágenes) que no puede producir el agente `developer`.

## 1. Contexto

Con 011 y 012 implementados, la tienda ya tiene navegación, catálogo, ficha,
carrito y checkout al nivel de referencia. Queda lo que rodea a la compra: la
sensación de actividad comercial en la portada, la puerta de entrada por
categorías, la vista de cuenta y —lo más importante para el mercado peruano— el
comportamiento en móvil.

### Dependencias de los specs anteriores

- **De 011**: `product-card.tsx` (T10) es el archivo donde entra el layout de
  tarjeta horizontal a 1 columna de D-12; `storefront-header.tsx` (T21) es el
  que recibe la búsqueda sticky de móvil; `--nx-fab-bottom` (T4) es la variable
  que hay que redefinir para que el botón «Subir» no quede bajo la barra
  inferior; `.nx-hover-lift` (T3) la reutilizan las tarjetas de categoría.
- **De 012**: el footer crece con la banda de beneficios; la barra inferior de
  móvil no debe taparlo y el `<main>` necesita `padding-bottom`.

Ninguna tarea de 013 debe reescribir esos archivos desde cero: son
modificaciones sobre la versión ya revisada.

### Estado verificado del código (2026-09-10)

- `hero.tsx` es Server Component: dos orbes, rejilla de fondo, badge con pulso,
  título con `nx-grad-text`, dos CTAs, tres `Stat` derivados de la base
  (`productCount`, `categoryCount`, `24`) y `HeroVisual` con el producto
  destacado. **No** admite imagen de fondo.
- `deals-section.tsx` lleva este comentario en cabecera:
  *«Sin cuenta atrás. No existe `discount_ends_at` en el modelo, así que un
  contador sería decoración que miente; la urgencia real la da `stockLevel`
  (spec 004, D-6)»*. Añadir el countdown de D-2 **revierte una decisión
  documentada del spec 004**: ver §8.
- `categories-section.tsx` usa `getCategoryIcon(slug)` de
  `src/modules/storefront/constants.ts` con un contenedor de 42 px, rejilla
  `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` y `<Reveal>` por tarjeta.
  **No** usa `category-art.tsx`: ese archivo solo lo consumen `ProductMedia` y
  el buscador.
- `featured-slider.tsx` es cliente: `translateX` sobre un índice, autoplay de
  4500 ms que se detiene con `paused` o `useReducedMotion` (implementado con
  `useSyncExternalStore` sobre `matchMedia`). No hay gestos táctiles.
- `mobile-menu.tsx` es un `Sheet` con `STOREFRONT_NAV` y un CTA. **No recibe
  categorías**: se monta desde `StorefrontOverlays` sin props. Puede leerlas con
  `useCatalogCategories()`, el mismo hook que usa el mega-menú de 011.
- `account/page.tsx` es Server Component con `auth.protect()`, cuatro secciones
  (`ACCOUNT_SECTIONS`) y `AccountNav`. Monta `AccountProfileCard`,
  `AccountEmpty` (favoritos), `OrderHistory` y `SavedCards`.
- `account-profile-card.tsx` **ya tiene un avatar de 88 px** con `<img>` plano
  (documentado: `AvatarImage` de Radix no emite el `<img>` en el servidor y
  `img.clerk.com` no está en `remotePatterns`). El `AccountProfile` viene de
  Clerk y **no incluye** `stripeCustomerId`.
- `useOrderHistory(range)` exige un rango y `OrderHistory` lo inicializa con
  `currentMonthRange()`: el número de pedidos disponible en cliente es **el del
  mes en curso**, no el histórico total. `useSavedCards()` devuelve
  `{ query, waiting, exhausted }`.
- `public/` solo contiene los cuatro SVG del scaffold de Next
  (`file`, `globe`, `next`, `vercel`, `window`). No hay ninguna imagen propia.
- `next.config.ts` restringe `remotePatterns` a `images.unsplash.com` y
  `cdn.memorykings.pe`. Los archivos servidos desde `public/` son locales y no
  necesitan entrada en esa lista.

## 2. Objetivo

Un visitante que llega desde el móvil puede navegar la tienda entera con una
barra inferior fija y gestos táctiles, encuentra la portada con secciones
promocionales que dan sensación de tienda activa, entra por categoría desde una
rejilla legible, y ve su cuenta resumida en tarjetas en lugar de una lista de
secciones.

## 3. Alcance

### Incluye

- Banner de imagen opcional en el hero, countdown decorativo en ofertas,
  showcase de marcas y banner promocional entre secciones.
- Tarjetas de categoría con icono grande, contador en pill, hover animado y
  scroll horizontal en móvil.
- Cuenta con tarjetas KPI, badge de cliente con pago exprés, favoritos con
  ilustración y mini-gráfico de gasto del mes.
- Barra de navegación inferior en móvil, búsqueda sticky, swipe en el carrusel,
  rejilla de 1 columna con tarjeta horizontal bajo 400 px y categorías reales en
  el menú móvil.

### No incluye (explícito)

- **Ninguna dependencia npm nueva.**
- **Ningún cambio de modelo de datos, Route Handler ni repositorio**, con una
  excepción acotada: la page de cuenta hace **una** lectura por repositorio para
  el badge de pago exprés (§7.3), que es la flecha «Server Component →
  repositorio» que `docs/SETUP.md` §4 ya permite.
- **Ninguna imagen generada por IA.** Ver §7.1: los banners salen de bancos
  libres de derechos.
- Base CSS, tarjeta, catálogo y header → **spec 011**.
- Ficha, carrito, footer y checkout → **spec 012**.

## 4. Criterios de aceptación

Renumerados. Entre paréntesis, su equivalente en el documento 010.

- [x] **AC1** (nuevo, D-2) — Dada la sección de ofertas, cuando se carga,
      entonces muestra un countdown en cajas `HH:MM:SS` que corre hacia las 23:59
      del día en curso, sin provocar mismatch de hidratación y sin animación bajo
      `prefers-reduced-motion: reduce`.
- [x] **AC2** (nuevo, D-2) — Dada la portada, cuando se recorre, entonces entre
      secciones aparece un banner promocional con gradiente y CTA a `/#catalogo`,
      y una fila de marcas/categorías con su imagen local.
- [x] **AC3** (nuevo, D-2) — Dado el hero con banner de imagen configurado,
      cuando se carga, entonces la imagen se sirve desde `public/`, lleva
      `priority` y el texto queda legible sobre un overlay con contraste
      suficiente en ambos temas. Si no hay imagen, el hero es exactamente el
      actual con orbes.
- [x] **AC4** (nuevo, D-7) — Dadas las tarjetas de categoría, cuando se
      renderizan, entonces el icono ocupa 64 px sobre fondo de gradiente suave y
      el conteo aparece como pill en la esquina superior derecha.
- [x] **AC5** (nuevo, D-7) — Dado el hover sobre una tarjeta de categoría,
      entonces el icono escala a 1.15, la tarjeta se eleva y el borde pasa a
      `border-primary`, en 300 ms; sin animación bajo reduced-motion.
- [x] **AC6** (nuevo, D-7) — Dada la sección de categorías bajo 640 px, cuando se
      arrastra horizontalmente, entonces las tarjetas se desplazan con scroll-snap
      en una sola fila, sin provocar scroll horizontal en el documento.
- [x] **AC7** (nuevo, D-10) — Dada `/account`, cuando se carga con sesión,
      entonces sobre las secciones hay tres tarjetas KPI con el número de pedidos
      **del mes en curso**, el número de tarjetas guardadas y la fecha de alta,
      cada una con su estado de carga y de error.
- [x] **AC8** (nuevo, D-10) — Dado un usuario con `stripe_customer_id`, cuando
      abre su perfil, entonces ve el badge de pago exprés; un usuario sin él no
      lo ve, y en ningún caso se pinta un badge basado en un dato inventado.
- [x] **AC9** (nuevo, D-10) — Dada la sección de favoritos, cuando está vacía,
      entonces muestra una ilustración SVG decorativa además del texto y conserva
      su CTA al catálogo.
- [x] **AC10** (010-AC11) — Dada la tienda bajo 768 px, cuando se navega,
      entonces hay una barra inferior fija con Inicio, Categorías, Carrito (con
      badge) y Cuenta, con ≥ 44 px por objetivo, marcando la sección activa y sin
      tapar el contenido del `<main>` ni el botón «Subir».
- [x] **AC11** (010-AC12) — Dado `FeaturedSlider` en un dispositivo táctil,
      cuando se hace swipe horizontal, entonces avanza o retrocede una diapositiva
      y el scroll vertical de la página sigue funcionando.
- [x] **AC12** (nuevo, D-12) — Dada la rejilla del catálogo bajo 400 px, cuando
      se carga, entonces las tarjetas pasan a una columna con la imagen a la
      izquierda y la información a la derecha.
- [x] **AC13** (nuevo, D-12) — Dado el menú móvil, cuando se abre, entonces lista
      las categorías reales con su icono y conteo bajo la navegación, con estados
      de carga y de error.
- [x] **AC14** (nuevo, D-12) — Dado el móvil, cuando se hace scroll hacia abajo,
      entonces la búsqueda queda accesible de forma persistente sin ocupar toda la
      cabecera.
- [x] **AC15** (010-AC14) — Dado el tema oscuro, cuando se recorren los
      componentes nuevos, entonces ninguno usa color hardcoded.
- [x] **AC16** (010-AC15) — Dado `prefers-reduced-motion: reduce`, entonces no
      queda ninguna animación nueva en marcha: countdown, hover de categoría,
      swipe y entrada de la barra inferior incluidos.
- [x] **AC17** (010-AC16) — Dado `package.json`, cuando termina la
      implementación, entonces sus dependencias son idénticas a las del inicio.
- [x] **AC18** (heredado de spec 006/008/009) — Dada `/account`, cuando la abre
      alguien sin sesión, entonces sigue devolviendo el `307` a
      `/sign-in?redirect_url=…`, y ninguna sección nueva expone datos de otro
      usuario.

## 5. Modelo de datos

**Sin cambios de esquema.** Ni tablas, ni columnas, ni migraciones.

### Elementos decorativos declarados

Decisión explícita del usuario (2026-09-10): se implementan **tal como los
propuso el documento 010**, sin suavizarlos, y se documentan como decorativos
tanto en el spec como en un comentario del propio componente.

| Elemento | Qué finge | Qué hay detrás |
|:---|:---|:---|
| **Countdown de ofertas** (D-2) | Una promoción que caduca a las 23:59 de hoy | Nada. No existe `discount_ends_at` en `products`. La hora es fija y se recalcula cada día. |
| **Marcas / BrandsShowcase** (D-2) | Marcas representadas en la tienda | Las categorías reales de `GET /api/categories`, con una imagen de banco libre por categoría. |
| **PromoBanner** (D-2) | Una campaña | Texto en constantes, como `FeaturesSection`. |
| **Mini-gráfico de gasto** (D-10) | Evolución del gasto | Los pedidos del **mes en curso** que ya devuelve `GET /api/orders`, agrupados por día. Es dato real, pero parcial: la etiqueta debe decir «este mes». |

El badge de **pago exprés** de D-10 **no** es decorativo: se deriva de
`users.stripe_customer_id`, que existe desde la migración `0005` (spec 009).

## 6. Contratos de API

**Sin endpoints nuevos y sin cambios de contrato.** Se consumen tres existentes:

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/categories` | público | — | `CatalogCategoryListResponse` | 500 |
| GET | `/api/orders` | cliente (`requireActiveUser()`) | `from`, `to` (query) | `{ data: OrderHistoryItem[], meta }` | 400, 401, 403, 500 |
| GET | `/api/payment-methods` | cliente (`requireActiveUser()`) | — | `{ data: SavedCard[] }` | 401, 403, 500 |

Los dos últimos ya se consumen desde `/account` con `useOrderHistory()` y
`useSavedCards()`. Las tarjetas KPI **reutilizan esos mismos hooks y sus claves
de caché**: no se abre ninguna petición adicional.

Lectura de servidor añadida (no es API): `userRepository.findByClerkId(userId)`
desde `account/page.tsx`, para el badge de pago exprés. Es la flecha «Server
Component → repositorio» de `docs/SETUP.md` §4; ningún componente importa el
repositorio (CLAUDE.md, regla 1).

## 7. Arquitectura y archivos afectados

### 7.1 D-2 — Banners promocionales y secciones temáticas

#### Prerequisito bloqueante de una sola tarea: las imágenes

El documento 010 decía que las imágenes «se pueden generar con la herramienta de
generación de imágenes disponible». **Se sustituye por esto:**

- Las imágenes se obtienen de **bancos libres de derechos** (Unsplash, Pexels u
  otro banco CC0 / licencia libre), navegando la web.
- Las **descarga la sesión principal**, no el agente `developer`: sus
  herramientas son Read/Write/Edit/Grep/Glob/Bash/Skill y no tiene navegador.
- Se colocan como **archivos estáticos en `public/`** con las rutas fijadas aquí,
  **antes** de que el developer ejecute T4 y T5.
- Bloquean **solo esas dos tareas**, no el spec: T1–T3 y T6 en adelante se pueden
  implementar sin ellas.

| Ruta | Uso | Formato sugerido |
|:---|:---|:---|
| `public/banners/hero.webp` | Fondo del hero (D-2) | ≥ 1920×1080, ≤ 300 KB |
| `public/brands/laptops.webp` | Tarjeta de marca «Laptops» | 400×300, ≤ 60 KB |
| `public/brands/smartphones.webp` | Tarjeta «Smartphones» | ídem |
| `public/brands/monitores.webp` | Tarjeta «Monitores» | ídem |
| `public/brands/perifericos.webp` | Tarjeta «Periféricos» | ídem |
| `public/brands/componentes-de-pc.webp` | Tarjeta «Componentes de PC» | ídem |
| `public/brands/almacenamiento.webp` | Tarjeta «Almacenamiento» | ídem |
| `public/brands/tablets.webp` | Tarjeta «Tablets» | ídem |

Los nombres de archivo son **slugs de categoría**, los mismos que indexan
`getCategoryIcon()` y `CATEGORY_ART`. `BrandsShowcase` resuelve
`/brands/${slug}.webp` y, si la imagen no existe o falla, **degrada al icono de
la categoría**, exactamente como `ProductMedia` degrada al arte SVG. Así una
categoría creada mañana desde el panel no rompe la fila.

La procedencia y licencia de cada imagen se anota en
`public/banners/CREDITS.md` (creado por la sesión principal junto con las
descargas).

| Elemento | Cambio |
|:---|:---|
| **Hero con banner** | `hero.tsx` acepta el fondo opcional: si la constante `HERO_BANNER` está definida, se pinta con `next/image` `fill` + `priority` y un overlay `bg-gradient-to-r from-background` que garantiza el contraste del texto; los orbes se atenúan. Si no, el hero es el actual, sin ramas muertas en el DOM. |
| **Countdown** | `CountdownTimer`: cliente, cajas `HH:MM:SS`, objetivo las 23:59:59 del día en curso en hora local. **Renderiza `null` (o guiones) en el primer render y arranca en `useEffect`**: calcular el tiempo restante durante el SSR produce un valor distinto al del cliente y React descarta el subárbol al hidratar. Al llegar a cero, se detiene en `00:00:00`, no reinicia. `aria-hidden` + una línea `sr-only` «Oferta del día». |
| **BrandsShowcase** | Fila de tarjetas por categoría con imagen local, nombre y `.nx-hover-lift`; fallback al icono. Server Component: los datos ya los tiene la portada. |
| **PromoBanner** | Banner horizontal con gradiente de acento, tagline en constantes y CTA a `/#catalogo`. Server Component. |

**Archivos**
- `MODIFY` `src/modules/storefront/components/hero.tsx`
- `MODIFY` `src/modules/storefront/components/deals-section.tsx`
- `MODIFY` `src/modules/storefront/constants.ts` (textos de promo y banner)
- `NEW` `src/modules/storefront/components/countdown-timer.tsx`
- `NEW` `src/modules/storefront/components/brands-showcase.tsx`
- `NEW` `src/modules/storefront/components/promo-banner.tsx`
- `MODIFY` `src/app/(storefront)/page.tsx`
- `NEW` (sesión principal, no developer) `public/banners/*`, `public/brands/*`, `public/banners/CREDITS.md`

### 7.2 D-7 — Categorías con más presencia

| Elemento | Cambio |
|:---|:---|
| **Icono grande** | Contenedor de 42 px → 64 px, fondo `linear-gradient` sobre `--nx-accent-soft`, icono a `size-7`. |
| **Contador en pill** | El conteo sale del bloque de texto y pasa a un pill `bg-secondary` en la esquina superior derecha de la tarjeta. Sigue siendo `category.productCount`, el `count` agrupado del repositorio. |
| **Hover** | `scale(1.15)` en el icono, elevación de la tarjeta y `border-primary`, 300 ms `ease-out`, todo bajo `@media (hover: hover)` reutilizando `.nx-hover-lift` de 011. |
| **Móvil** | Bajo 640 px, la rejilla pasa a fila con `overflow-x-auto`, `snap-x` y tarjetas de 140 px, con la misma técnica de márgenes negativos que ya usa la fila de chips del catálogo para sangrar sin romper el contenedor. |

**Archivos**
- `MODIFY` `src/modules/storefront/components/categories-section.tsx`

> `category-art.tsx` **no** se toca. El documento 010 lo listaba en D-7, pero la
> sección de categorías usa `getCategoryIcon()`, no `CategoryArt`; ese archivo
> solo lo consumen `ProductMedia` y el buscador.

### 7.3 D-10 — Cuenta más visual

| Elemento | Cambio |
|:---|:---|
| **Tarjetas KPI** | `AccountSummaryCards`, cliente: (1) pedidos del mes con `useOrderHistory(currentMonthRange())` —misma clave de caché que `OrderHistory`, así que no hay petición extra—, (2) tarjetas guardadas con `useSavedCards()`, (3) «Miembro desde», que llega como prop desde el servidor (`profile.createdAt`). Cada tarjeta tiene skeleton y estado de error propios: son dos consultas independientes y una puede fallar sola. **La etiqueta dice «pedidos este mes»**, no «pedidos», porque el rango es mensual. |
| **Badge de pago exprés** | `AccountProfileCard` recibe `hasStripeCustomer: boolean`. Lo resuelve la page con `userRepository.findByClerkId(userId)`. El texto es «Pago exprés activo», no «Cliente verificado»: tener un Stripe Customer no verifica a nadie, y el badge de «Verificado» del correo ya existe justo al lado. |
| **Avatar** | **Ya son 88 px** con `<img>` plano y su fallback de iniciales. No se toca: cambiarlo a `Avatar` de Radix rompería el HTML inicial (documentado en spec 006, D-7). |
| **Favoritos** | `AccountEmpty` acepta una prop opcional `illustration?: ReactNode` y la pinta sobre el texto. La ilustración es un SVG inline decorativo (`aria-hidden`) que usa las clases `nx-a*` de `globals.css`, como `CategoryArt`, para funcionar en ambos temas. Los otros usos de `AccountEmpty` no pasan la prop y quedan igual. |
| **Gasto del mes** | `MonthlySpendBar`: barras en CSS puro a partir de los pedidos del mes que ya tiene el hook, agrupadas por día con `groupOrdersByDay()`, que ya existe. Etiqueta explícita «Gasto de este mes». Sin Recharts. |

**Archivos**
- `MODIFY` `src/app/(storefront)/account/page.tsx`
- `MODIFY` `src/modules/storefront/components/account-profile-card.tsx`
- `MODIFY` `src/modules/storefront/components/account-empty.tsx`
- `NEW` `src/modules/storefront/components/account-summary-cards.tsx`
- `NEW` `src/modules/storefront/components/monthly-spend-bar.tsx`

### 7.4 D-12 — Móvil

| Elemento | Cambio |
|:---|:---|
| **Bottom nav** | `MobileBottomNav`, cliente, `fixed bottom-0`, visible solo bajo 768 px: Inicio (`/`), Categorías (abre el `MobileMenu` existente), Carrito (abre el drawer, con el badge y su guarda `hydrated`), Cuenta (`/account`). Ítems de 44 px, `aria-current="page"` en la ruta activa vía `usePathname()`, `padding-bottom: env(safe-area-inset-bottom)`. Se monta en el layout del storefront, que añade `pb-[4.5rem] md:pb-0` al `<main>` y redefine `--nx-fab-bottom` para subir el botón «Subir» de 011. |
| **Búsqueda sticky** | Bajo 768 px, cuando el header está `stuck`, se muestra bajo él una fila compacta con el mismo disparador del overlay de búsqueda. No es un `<input>` nuevo: abre el `cmdk` existente, así que sigue habiendo un único buscador (spec 004, D-12). |
| **Swipe en el carrusel** | Gestos con Pointer Events sobre el track de `FeaturedSlider`: `pointerdown` guarda X, `pointerup` compara con un umbral (~50 px) y llama al mismo `setIndex` que las flechas. `touch-action: pan-y` en el track para no secuestrar el scroll vertical. Sin librería de gestos. |
| **Rejilla de 1 columna** | Bajo 400 px, `ProductCard` pasa a `grid-cols-[104px_1fr]` con el arte a la izquierda: es un cambio de clases en la propia tarjeta (011, T10), no un componente nuevo. El `sizes` de `ProductMedia` se ajusta a ese breakpoint. |
| **Menú móvil** | Bajo la navegación actual, una lista de categorías reales con `useCatalogCategories()`, icono y conteo, cerrando el sheet al elegir (`CategoryJumpLink` ya deja el filtro puesto). Con estados de carga y de error. |

**Archivos**
- `NEW` `src/modules/storefront/components/mobile-bottom-nav.tsx`
- `MODIFY` `src/app/(storefront)/layout.tsx`
- `MODIFY` `src/modules/storefront/components/storefront-header.tsx` *(depende de 011, T21)*
- `MODIFY` `src/modules/storefront/components/featured-slider.tsx`
- `MODIFY` `src/modules/storefront/components/product-card.tsx` *(depende de 011, T10)*
- `MODIFY` `src/modules/storefront/components/mobile-menu.tsx`
- `MODIFY` `src/app/globals.css` (redefinir `--nx-fab-bottom` bajo 768 px)

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **El countdown revierte spec 004, D-6, y se documenta como tal** | Mantener la sección sin cuenta atrás | Decisión explícita del usuario (2026-09-10): quiere todos los elementos decorativos tal como los propuso el documento 010. El comentario de cabecera de `deals-section.tsx` que dice «Sin cuenta atrás… sería decoración que miente» **debe reescribirse** para reflejar la decisión nueva y su motivo; dejarlo contradiría al código que hay justo debajo. |
| Imágenes de banco libre en `public/`, descargadas por la sesión principal | Generarlas con una herramienta de imágenes; usar `images.unsplash.com` en caliente | No se asume ninguna herramienta de generación. Y servir desde `public/` evita depender de un host externo en el LCP de la portada, aunque `images.unsplash.com` ya esté en `remotePatterns`. |
| `BrandsShowcase` degrada al icono si falta la imagen | Asumir que los siete archivos existen siempre | Es el mismo criterio que `ProductMedia` y que `getCategoryIcon()`: una categoría nueva creada desde el panel no puede romper la portada. |
| El countdown no calcula nada durante el SSR | Calcular el tiempo restante en el render inicial | El servidor y el cliente renderizarían números distintos y React descartaría el subárbol al hidratar. Es el mismo fallo que ya evitan la guarda `hydrated` del badge del carrito y el `getServerSnapshot` de `useCartHydrated`. |
| Las KPI reutilizan `useOrderHistory` y `useSavedCards` con sus claves actuales | Un endpoint `/api/account/summary` nuevo | Las claves ya están en caché porque `OrderHistory` y `SavedCards` viven en la misma página: el KPI se sirve de la caché sin una petición más. Un endpoint agregado sería contrato nuevo para un número que ya está en el cliente. |
| El KPI dice «pedidos este mes» | «X pedidos» a secas | `useOrderHistory` exige rango y la sección se inicializa en el mes en curso. Poner «X pedidos» presentaría un total mensual como histórico. |
| El badge se llama «Pago exprés activo» y sale de `stripe_customer_id` | «Cliente verificado» | Tener un Stripe Customer no verifica nada, y «Verificado» ya se usa dos líneas más arriba para el correo: dos badges con el mismo lenguaje y significados distintos. |
| Gráfico de gasto en CSS puro | Recharts (ya instalado) | Recharts pesa lo que pesa y hoy solo vive en el panel admin. Meterlo en el storefront por una tira decorativa de barras añade un chunk grande a la única página de cliente autenticado. |
| El botón «Categorías» de la barra inferior abre el `MobileMenu` existente | Una vista de categorías nueva | El sheet ya existe, y con las categorías reales de D-12 pasa a ser justo esa vista. Un overlay más pelearía con el pestillo de montaje de `ui.store.ts`, que ya cierra los otros dos al abrir uno. |
| Swipe con Pointer Events sobre el track existente | Instalar `swiper` o `embla`; usar `drag` de `motion` | AC17 prohíbe dependencias nuevas. `motion` sí podría (`drag="x"`), pero obligaría a convertir el track en `motion.div` y a reconciliar su transform con el `translateX` por índice que ya existe y está revisado. |
| La búsqueda sticky de móvil reabre el overlay `cmdk` | Un `<input>` de búsqueda inline | Habría dos buscadores con dos comportamientos. El overlay ya resuelve foco, `Esc`, teclado y resultados contra la API (spec 004, D-12/D-13). |
| `--nx-fab-bottom` se redefine en `globals.css`, no en el componente | Cambiar el `bottom` de `ScrollToTop` | 011 ya dejó la variable preparada justo para esto: 013 no reabre un componente revisado. |

### Correcciones al documento 010

- D-7 listaba `category-art.tsx` entre los archivos afectados. No lo está: la
  sección de categorías usa `getCategoryIcon()`.
- D-10 pedía «avatar grande (80 px)». Ya son **88 px**.
- D-10 hablaba de «X pedidos» e «Y tarjetas» como si fueran totales históricos:
  el hook trabaja por rango mensual (§8).
- D-2 asumía una herramienta de generación de imágenes: sustituido por el
  procedimiento de §7.1.

## 9. Tareas

Ordenadas por dependencia. Cada una toca un archivo y una capa.

> **T4 y T5 están bloqueadas** hasta que la sesión principal deje las imágenes en
> `public/` según §7.1. El resto no depende de ellas.

**Promociones (D-2)**

- [x] **T1** — `CountdownTimer`: cliente, objetivo 23:59:59 local del día en
      curso, primer render sin cálculo y arranque en `useEffect`, parada en cero,
      `aria-hidden` + línea `sr-only`, sin animación bajo reduced-motion ·
      archivo: `src/modules/storefront/components/countdown-timer.tsx` ·
      verificación: `npm run build` sin warning de hidratación (AC1, AC16)
- [x] **T2** — Montar el countdown en la cabecera de ofertas y **reescribir el
      comentario «Sin cuenta atrás»** para que documente la decisión nueva y su
      naturaleza decorativa · archivo:
      `src/modules/storefront/components/deals-section.tsx` · verificación:
      `npm run build`; el comentario ya no contradice al código (AC1)
- [x] **T3** — Añadir a constantes los textos del banner promocional y del
      showcase, más la constante opcional del banner del hero · archivo:
      `src/modules/storefront/constants.ts` · verificación: `npm run typecheck`
- [x] **T4** — *(bloqueada por las imágenes de §7.1)* `BrandsShowcase`: fila de
      tarjetas por categoría con `/brands/${slug}.webp`, degradando al icono si
      la imagen falla · archivo:
      `src/modules/storefront/components/brands-showcase.tsx` · verificación:
      `npm run build` y una categoría sin imagen pintando su icono (AC2)
- [x] **T5** — *(bloqueada por las imágenes de §7.1)* Banner de imagen opcional
      en el hero con `priority` y overlay de contraste; sin la constante, el hero
      queda idéntico al actual · archivo:
      `src/modules/storefront/components/hero.tsx` · verificación: texto legible
      sobre la imagen en claro y oscuro (AC3)
- [x] **T6** — `PromoBanner`: banner con gradiente, tagline de constantes y CTA a
      `/#catalogo` · archivo:
      `src/modules/storefront/components/promo-banner.tsx` · verificación:
      `npm run typecheck` (AC2)
- [x] **T7** — Montar `PromoBanner` y `BrandsShowcase` en la portada, sin tocar
      el `Promise.all` de lecturas ni el `<Suspense>` · archivo:
      `src/app/(storefront)/page.tsx` · verificación: `npm run build`; una sola
      tanda de consultas a Neon (AC2)

**Categorías (D-7)**

- [x] **T8** — Tarjeta de categoría: icono a 64 px sobre gradiente, conteo en
      pill, hover con `scale(1.15)` y elevación, y fila con scroll-snap bajo
      640 px · archivo:
      `src/modules/storefront/components/categories-section.tsx` ·
      verificación: `npm run build`; sin scroll horizontal del documento a
      390 px (AC4, AC5, AC6)

**Cuenta (D-10)**

- [x] **T9** — `MonthlySpendBar`: barras CSS por día sobre los pedidos del mes,
      reutilizando `groupOrdersByDay()`, con etiqueta «Gasto de este mes» ·
      archivo: `src/modules/storefront/components/monthly-spend-bar.tsx` ·
      verificación: `npm run typecheck` (AC7)
- [x] **T10** — `AccountSummaryCards`: tres KPI sobre `useOrderHistory` y
      `useSavedCards`, con skeleton y error por tarjeta y la etiqueta «pedidos
      este mes» · archivo:
      `src/modules/storefront/components/account-summary-cards.tsx` ·
      verificación: sin peticiones adicionales en la pestaña de red (AC7)
- [x] **T11** — `AccountEmpty`: prop opcional `illustration` pintada sobre el
      texto, sin cambiar los usos existentes · archivo:
      `src/modules/storefront/components/account-empty.tsx` · verificación:
      `npm run typecheck` (AC9)
- [x] **T12** — `AccountProfileCard`: prop `hasStripeCustomer` y badge «Pago
      exprés activo», dejando el avatar de 88 px como está · archivo:
      `src/modules/storefront/components/account-profile-card.tsx` ·
      verificación: `npm run typecheck` (AC8)
- [x] **T13** — Cuenta: leer `userRepository.findByClerkId()`, pasar
      `hasStripeCustomer` y `profile.createdAt`, montar `AccountSummaryCards` y
      la ilustración de favoritos, conservando `auth.protect()` y sin
      `loading.tsx` · archivo: `src/app/(storefront)/account/page.tsx` ·
      verificación: sin sesión sigue llegando el `307` (AC7, AC8, AC9, AC18)

**Móvil (D-12)**

- [x] **T14** — `MobileBottomNav`: cuatro destinos, badge del carrito con guarda
      `hydrated`, `aria-current` por `usePathname()`, `safe-area-inset-bottom`,
      oculta desde 768 px · archivo:
      `src/modules/storefront/components/mobile-bottom-nav.tsx` ·
      verificación: `npm run typecheck` (AC10)
- [x] **T15** — Redefinir `--nx-fab-bottom` bajo 768 px para que el botón
      «Subir» quede sobre la barra inferior · archivo: `src/app/globals.css` ·
      verificación: los dos controles no se solapan a 390 px (AC10)
- [x] **T16** — Montar `MobileBottomNav` y añadir el `padding-bottom` del
      `<main>` bajo 768 px · archivo: `src/app/(storefront)/layout.tsx` ·
      verificación: el footer y su banda de beneficios quedan alcanzables (AC10)
- [x] **T17** — Añadir la fila de búsqueda compacta bajo el header cuando está
      `stuck` en móvil, reabriendo el overlay existente · archivo:
      `src/modules/storefront/components/storefront-header.tsx` ·
      verificación: `⌘K` y la devolución de foco siguen funcionando (AC14)
- [x] **T18** — Swipe con Pointer Events y `touch-action: pan-y` en el track del
      carrusel, reutilizando el `setIndex` de las flechas · archivo:
      `src/modules/storefront/components/featured-slider.tsx` ·
      verificación: swipe cambia de slide y el scroll vertical sigue vivo (AC11)
- [x] **T19** — Tarjeta horizontal bajo 400 px con su `sizes` recalculado ·
      archivo: `src/modules/storefront/components/product-card.tsx` ·
      verificación: rejilla de una columna a 390 px (AC12)
- [x] **T20** — Categorías reales en el menú móvil con `useCatalogCategories()`,
      icono, conteo y estados de carga y error · archivo:
      `src/modules/storefront/components/mobile-menu.tsx` · verificación:
      elegir una categoría cierra el sheet y aplica el filtro (AC13)

**Cierre**

- [x] **T21** — `npm run typecheck && npm run lint && npm run build` en verde y
      `git diff package.json` vacío · verificación: AC17

## 10. Riesgos y consideraciones

- **Contradicción documental del countdown.** El spec 004 D-6 decidió lo
  contrario y el código lo dice en un comentario. Si T2 no reescribe ese
  comentario, el repositorio queda afirmando dos cosas opuestas en el mismo
  archivo. Es el hallazgo que más probablemente levante el reviewer.
- **Peso de la portada.** El banner del hero es candidato a LCP: sin `priority`
  y sin comprimir por debajo de ~300 KB, empeora justo la métrica que spec 004
  cuidó con `HeroVisual` y con `priority` en las cuatro primeras tarjetas.
- **Mismatch de hidratación del countdown.** Es el fallo clásico de este
  componente y el proyecto ya lo sufrió una vez con `reduced-motion` (commit
  `6f20f2a`).
- **Barra inferior contra otros elementos fijos.** Compite con el botón «Subir»
  (011), con el CTA de la ficha (012) y con el footer nuevo. Hay que comprobar
  los cuatro juntos a 390 px, no por separado.
- **Doble consulta en la cuenta.** Si `AccountSummaryCards` llama a
  `useOrderHistory` con un rango construido en el render (`currentMonthRange()`
  sin memoizar), cada render generará un objeto nuevo, la clave de caché
  cambiará y habrá refetch en bucle. `OrderHistory` ya resuelve esto con un
  inicializador perezoso de `useState`: hay que hacer lo mismo.
- **Lectura extra en `/account`.** `findByClerkId()` añade un viaje a Neon en una
  página que hoy no consulta la base. Es una consulta por PK y la página ya es
  dinámica, pero conviene no encadenarla con otro `await`.
- **Privacidad de la cuenta.** Ningún componente nuevo puede recibir datos de
  otro usuario: los dos endpoints filtran por `user_id` en el `WHERE` y las KPI
  se limitan a contar lo que ya devuelven.
- **Scroll horizontal.** Las dos filas nuevas con `overflow-x` (categorías y
  marcas) deben usar la técnica de márgenes negativos que ya emplea el catálogo,
  o romperán el `overflow-x: hidden` del `body` a 390 px.

### Notas de compatibilidad

- Retrocompatible: cada tarea deja la tienda funcionando; ninguna elimina
  funcionalidad.
- Dark mode: solo tokens `nx-*` y variables semánticas. Las imágenes de banner
  necesitan un overlay que funcione en ambos temas, no un color fijo.
- Accesibilidad: se mantienen los criterios del spec 004 — AC10, AC16 y AC17 — y
  los de las páginas privadas de los specs 006, 008 y 009.
- La skill `web-design-guidelines` está instalada pero requiere `WebFetch`, no
  disponible en la sesión del agente `spec`.

## 11. Fuera de alcance / deuda aceptada

Con este spec se cierra la serie **mejoras-ui**. No hay una parte 4.

### Desviaciones de implementación (2026-09-10)

Tres decisiones se apartan de la letra de §7 y §9. Ninguna deja trabajo pendiente;
se anotan aquí porque el spec fija los archivos exactos de cada tarea y el
repositorio no debe contradecirse a sí mismo.

1. **T16 — el `padding-bottom` va en el contenedor del layout, no en `<main>`.**
   `StorefrontFooter` se renderiza *después* de `<main>`, así que un
   `padding-bottom` allí solo habría separado el contenido del pie y habría dejado
   igual de tapada la banda de beneficios al llegar al final del documento. El
   hueco se pone en el `div[data-surface="storefront"]`, que envuelve a los dos.
   El valor es el mismo: `calc(3.5rem + env(safe-area-inset-bottom))`, `md:pb-0`.
2. **T4 — `BrandsShowcase` decide el fallback con un conjunto de slugs declarado**
   (`getBrandImage()` en `constants.ts`), no con un `onError`. El spec pedía Server
   Component y un Server Component no puede degradar en tiempo de ejecución como
   `ProductMedia`; la comprobación tiene que poder hacerse antes de emitir el HTML.
   El efecto buscado se conserva: una categoría creada desde el panel no está en el
   conjunto y cae al icono, sin romper la fila.
3. **T19 — además de `product-card.tsx` se tocó `catalog-section.tsx`.** AC12 pide
   «la rejilla del catálogo bajo 400 px … a una columna», y las columnas las fija
   la sección, no la tarjeta: con `grid-cols-2` intacto, la tarjeta tumbada habría
   quedado en dos columnas de 180 px. Se cambió la rejilla y su esqueleto a
   `grid-cols-1 min-[400px]:grid-cols-2`. Es el único archivo tocado fuera de la
   lista de §7.

### Hallazgos de review corregidos — iteración 1 (2026-09-10)

Los tres hallazgos de la primera auditoría quedaron corregidos. Ningún otro
archivo se tocó y `package.json` sigue intacto (AC17).

- [x] **[MAYOR] Contraste del `PromoBanner` bajo WCAG AA en tema claro** —
      `promo-banner.tsx`: los textos usaban `text-nx-on-accent/85` (3.76:1) y
      `/80` (3.51:1) sobre `--primary`, por debajo del 4.5:1 exigido; en oscuro
      pasaba solo porque el token se invierte. Se quitaron los modificadores de
      alfa y los tres textos van a plena opacidad (4.56:1). La jerarquía la dan
      el tamaño y el peso, el patrón que ya siguen `logistics-badge.tsx` y
      `product-card.tsx`. (AC15, AC3)
- [x] **[MENOR] Color literal en el `PromoBanner`** — `promo-banner.tsx`: el
      orbe de fondo usaba `bg-white/10`, un color hardcoded que AC15 prohíbe en
      los componentes nuevos. Pasa a `bg-nx-on-accent/10`, que se invierte con
      el tema. (AC15)
- [x] **[MENOR] División por cero en `MonthlySpendBar`** — `monthly-spend-bar.tsx`:
      con todos los pedidos `paid` del mes sumando 0, `max` quedaba en 0 y
      `(day.cents / max) * 100` daba `NaN`, colapsando el carril de barras. El
      máximo lleva suelo de 1: `Math.max(1, ...days.map((d) => d.cents))`. (AC7)

### Hallazgos de review corregidos — iteración 2 (2026-09-11)

El único hallazgo de la segunda auditoría quedó corregido. Además de
`promo-banner.tsx` se tocó `globals.css` para exponer un token que ya existía;
`package.json` sigue intacto (AC17).

- [x] **[MAYOR] El contraste del `PromoBanner` solo se sostenía en la mitad
      izquierda** — la corrección de la iteración 1 quitó los modificadores de
      alfa y midió 4.56:1, pero ese número solo vale sobre `--primary` sólido. El
      fondo real era `from-primary via-primary to-nx-accent-2`, que rampa hacia el
      turquesa desde el 50% del ancho: el blanco caía a 4.19:1 al 70%, 3.88:1 al
      80% y 3.16:1 al final en tema claro, y el orbe `bg-nx-on-accent/10` lo
      dejaba en 3.85:1 donde solapaba. Con el flex envuelto el párrafo llega a
      ~93% del ancho, así que la mayor parte del texto quedaba bajo AA. En oscuro
      no había problema porque el token de texto se invierte y el turquesa sube el
      ratio (6.14:1 → 10.93:1).

      **Corrección**: el degradado remata ahora en `--nx-accent-hover` y el orbe
      usa ese mismo token (`bg-nx-accent-hover/70`) en vez de un velo blanco. Es
      el único acento de la paleta que se separa de `--primary` hacia el lado
      seguro en los dos temas —`#5b4be8` es más oscuro que el morado en claro,
      `#a79cff` más claro en oscuro—, así que la mezcla es monótona creciente y el
      ratio mínimo del banner es el del propio `--primary`: **4.56:1 en claro y
      6.14:1 en oscuro en cualquier punto del ancho y bajo cualquier opacidad del
      orbe**, subiendo hasta 5.81:1 y 8.32:1 en el extremo. Se descartó el fondo
      plano porque dejaba el banner sin profundidad, y se descartó conservar el
      turquesa porque no hay forma de anclarlo fuera de la columna de texto cuando
      el flex se envuelve. El comentario de cabecera del componente se reescribió:
      el anterior afirmaba un 4.56:1 que no cubría todo el ancho. (AC15, AC3)
- [x] **Token expuesto como utilidad** — `globals.css`: se añadió
      `--color-nx-accent-hover: var(--nx-accent-hover)` al bloque `@theme inline`,
      junto a los demás `--color-nx-*`. La variable ya existía en los dos temas
      desde el spec 004; solo faltaba la clave del namespace de color de Tailwind
      para poder usarla como `to-nx-accent-hover` / `bg-nx-accent-hover`. No
      cambia ningún valor ni repinta el panel admin, que no lleva
      `data-surface="storefront"` (AC18).

### Verificación de review — iteración 3 (2026-09-11)

Auditoría de cierre: **sin hallazgos**. El delta de esta iteración se limitó a
`promo-banner.tsx` y `globals.css`; ningún archivo con superficie de auth, RBAC o
PII se tocó.

- **Contraste recalculado de forma independiente** sobre los hex reales de
  `globals.css`, muestreando 201 puntos del degradado × 71 opacidades del orbe, en
  interpolación sRGB y OKLab: mínimo **4.56:1** en claro y **6.14:1** en oscuro,
  máximos 5.81:1 y 8.32:1. La rampa es estrictamente monótona creciente en los dos
  temas y en los dos espacios de color: **no hay valle intermedio**. Los números del
  comentario de cabecera y de la entrada de la iteración 2 son exactos.
- **Utilidades verificadas en el CSS compilado**, no solo en el fuente:
  `.to-nx-accent-hover{--tw-gradient-to:var(--nx-accent-hover)}` y
  `.bg-nx-accent-hover/70{background-color:color-mix(in oklab,var(--nx-accent-hover) 70%,transparent)}`
  se generan. El degradado compila con `to right in oklab`, contemplado en el cálculo.
- **Panel admin sin cambios**: no usa ninguna clase `nx-*` y no lleva
  `data-surface="storefront"`. La clave de `@theme inline` queda inerte fuera de la
  tienda (AC18).
- `npm run typecheck`, `npm run lint` (0 errores) y `npm run build` en verde;
  `package.json` sin dependencias de este spec (AC17).

**Deuda nueva que deja la implementación**

- **Badge «Envío 24h» oculto bajo 400 px** en `ProductCard`: no cabe en el marco de
  104 px de la tarjeta tumbada sin montarse sobre el de descuento. La promesa sigue
  en la ficha y en la banda del pie. Se recupera el día que la tarjeta horizontal
  tenga una segunda fila de metadatos.
- **`--nx-header-h` no contempla la fila de búsqueda sticky de móvil** (T17): la
  fila se pinta en `absolute top-full` justo para no alterar la altura del header
  ni provocar un salto de 2.75 rem al pegarse, así que flota sobre el contenido
  durante ~44 px. Si algún día esa fila pasa al flujo, hay que sumarla a la
  variable y revisar los `scroll-mt` de las secciones ancladas.

**Deuda que deja la serie**

- **Countdown sin dato**: se conecta el día que `products` tenga
  `discount_ends_at`. Hasta entonces es decoración declarada en §5 y en el
  código.
- **Badge «Enviar a Lima»** (011) y **«Disponible»** de métodos de entrega
  (012): estáticos, a la espera de un modelo de ubicaciones y de cobertura.
- **Rating de estrellas** (011): listo para una tabla `reviews`.
- **Favoritos**: la sección y la ilustración quedan preparadas para una tabla
  `wishlists` con sus endpoints.
- **Newsletter** (012): slot listo, falta tabla `subscribers` y `POST`.
- **Galería de producto** (012): falta `product_images`.
- **Toast con preview y transiciones de página** (D-11 original, ver spec 011 §11).
- **Quick view** de la tarjeta (D-3 original, ya opcional en 010).
- **Filtro de disponibilidad y de precio en el servidor** (spec 011 §11).
- **Ruta `/products` dedicada**: con el sidebar, el orden y la paginación de 011
  ya construidos, extraer el catálogo a su propia URL es trabajo pequeño y
  aislado. Es el candidato natural al siguiente spec de storefront.
- **Historial de pedidos con URL propia** (`/orders`, `/orders/[id]`), pendiente
  desde el spec 008.
