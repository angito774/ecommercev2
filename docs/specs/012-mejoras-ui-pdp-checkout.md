---
id: 012
title: Mejoras UI — ficha de producto, carrito, footer y checkout (2/3)
status: done
module: storefront
scope: client
created: 2026-09-10
series: mejoras-ui — parte 2 de 3 (011 · 012 · 013)
supersedes: docs/specs/010-mejoras-ui.md (fases 4–5)
depends_on: docs/specs/011-mejoras-ui-header-catalogo.md
reference: https://simple.ripley.com.pe/
---

# 012 — Mejoras UI: ficha de producto, carrito, footer y checkout

> **Serie «mejoras-ui».** Parte **2 de 3** del documento
> `docs/specs/010-mejoras-ui.md`, partido porque no cabía en un ciclo
> `developer ⇄ reviewer` de 3 iteraciones (CLAUDE.md §3).
>
> | Spec | Decisiones del documento original | Contenido |
> |:---|:---|:---|
> | 011 | D-11 (parcial), D-3, D-4, D-1 | Base CSS, tarjeta, catálogo, header |
> | **012 (este)** | D-5, D-6, D-8, D-9 | Ficha de producto, carrito, footer, checkout |
> | 013 | D-2, D-7, D-10, D-12 | Promociones, categorías, cuenta, mobile |

## 1. Contexto

Con el spec 011 el visitante ya llega bien al producto: header navegable,
catálogo ordenable y tarjetas densas. A partir de ahí, el recorrido hasta el
pago sigue siendo el más austero de la tienda. La ficha es una plantilla de dos
columnas sin control de cantidad ni CTA de compra directa, el cart drawer no
explica de qué se compone cada línea, el footer no da ninguna señal de confianza
y el checkout es un título con un resumen debajo.

Este spec cubre el tramo **producto → carrito → checkout**, que es donde se
decide la conversión y donde las señales de confianza pesan más.

### Dependencia del spec 011

Este spec **requiere 011 implementado** por tres motivos concretos:

1. `product-card.tsx` (011, T10) es el componente que pintan los productos
   relacionados del carrusel de D-5. El carrusel se construye sobre la tarjeta
   nueva, no sobre la vieja.
2. La utilidad `.nx-hover-lift` de `globals.css` (011, T3) la reutilizan las
   tarjetas de método de entrega de D-5.
3. `ScrollProgress` ya está montado en `products/[slug]/layout.tsx` (011, T7):
   la reestructuración de la ficha no debe desmontarlo.

El footer de D-8 y el cart drawer de D-6 no dependen de 011, pero el botón
«Subir» del footer reutiliza el `ScrollToTop` que crea 011 (T4).

### Estado verificado del código (2026-09-10)

- `product-detail.tsx` es un Server Component con dos columnas
  (`min-[900px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]`): arte a la izquierda,
  información a la derecha. Incluye breadcrumb, categoría, título, descripción,
  precio con tachado y badge, línea de stock, `AddToCartButton variant="full"`,
  dos garantías (`Truck`, `ShieldCheck`) y `ProductSpecList`. **No** hay
  selector de cantidad, ni «Comprar ahora», ni sidebar sticky, ni métodos de
  entrega.
- `product-breadcrumb.tsx` ya usa separadores `ChevronRight` y enlaces con
  `min-h-11`. Lo que falta de D-5 es el estilo pill y los estados de hover, no
  los chevrons.
- `related-products.tsx` es un Server Component que pinta una rejilla
  `grid-cols-2 lg:grid-cols-4` de `ProductCard`. Su comentario documenta por qué
  no envuelve las tarjetas en `<Reveal>`: un div intermedio rompe el estirado a
  la misma altura.
- `cart.store.ts` expone `add(product, quantity = 1)` con `clampQuantity` a
  `[1, MAX_LINE_QUANTITY]`, `setQuantity`, `remove`, `clear` y los selectores
  `selectItemCount`, `selectSubtotalCents`, `selectQuantityForProduct`.
- `cart-drawer.tsx` pinta thumbnail en una columna de 74 px, nombre, categoría,
  stepper `−/+` de 44 px, y el **total de línea** (`priceCents × quantity`). No
  muestra el precio unitario. Tiene progreso de envío gratis, subtotal/envío/
  total y CTA a `/checkout`. «Seguir comprando» solo existe en el estado vacío.
- `storefront-footer.tsx` es un Server Component con dos zonas (columnas de
  enlaces + barra de copyright) sobre `bg-nx-inset`. Su comentario advierte que
  el commit `685d9c0` ya retiró una vez enlaces que llevaban a «no encontrada»:
  **no se introducen destinos inexistentes**.
- `checkout/page.tsx` hace `await auth.protect()`, tiene `robots: { index: false }`
  y renderiza `<CheckoutSummary />`.
- `checkout-summary.tsx` **ya tiene el layout de dos columnas**
  (`lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]`): líneas a la izquierda,
  resumen a la derecha. Ese punto de D-9 está hecho.
- Componentes shadcn instalados y utilizables: `sheet`, `select`, `checkbox`,
  `separator`, `badge`, `dialog`. **No** están instalados `tooltip`, `carousel`
  ni `breadcrumb`.

## 2. Objetivo

Un cliente puede elegir cuántas unidades quiere desde la propia ficha y pasar a
pagar en un clic, y ve en el carrito y en el checkout de qué se compone el
importe y con qué garantías paga, de modo que el abandono no venga de falta de
información.

## 3. Alcance

### Incluye

- Reestructuración de la ficha de producto en tres zonas con panel de compra
  sticky, selector de cantidad, «Comprar ahora», métodos de entrega decorativos,
  breadcrumb estilado y bloque de highlights.
- Carrusel horizontal de productos relacionados.
- Cart drawer con precio unitario, estimación de envío, medios de pago y
  «Seguir comprando».
- Footer con banda de beneficios, medios de pago, redes sociales placeholder,
  botón «Subir» y campo de newsletter decorativo.
- Checkout con stepper visual de tres pasos, señales de seguridad y enlaces a
  políticas.

### No incluye (explícito)

- **Ninguna dependencia npm nueva.**
- **Ningún cambio de modelo de datos, de Route Handler ni de repositorio.** En
  particular no se toca `POST /api/checkout` ni el webhook de Stripe: el importe
  lo sigue releyendo el servidor y el request sigue transportando solo
  `(productId, quantity)`.
- **Ningún cambio en la verificación de sesión.** `checkout/page.tsx` conserva
  su `await auth.protect()` y su ausencia de `loading.tsx` (spec 007, AC2).
- Galería de miniaturas de producto: no existe `product_images`.
- Checkout multi-paso real: el stepper es decorativo.
- Base CSS, tarjeta de producto, catálogo y header → **spec 011**.
- Promociones, categorías, cuenta y móvil → **spec 013**.

## 4. Criterios de aceptación

Renumerados. Entre paréntesis, su equivalente en el documento 010.

- [x] **AC1** (010-AC6) — Dada la ficha de producto en ≥ 1024 px, cuando se
      carga, entonces se ve en tres zonas —medios, información y panel de compra
      sticky a la derecha—; bajo 900 px colapsa a una sola columna, como hoy.
- [x] **AC2** (nuevo, D-5) — Dado el panel de compra, cuando se sube la cantidad
      a 3 y se pulsa «Agregar al carrito», entonces el carrito contiene 3
      unidades de ese producto y el contador del header muestra 3.
- [x] **AC3** (nuevo, D-5) — Dado el botón «Comprar ahora», cuando se pulsa,
      entonces el producto se añade con la cantidad elegida y el navegador queda
      en `/checkout` sin pasos intermedios.
- [x] **AC4** (nuevo, D-5) — Dado un producto con `stockLevel === 'out'`, cuando
      se abre su ficha, entonces «Comprar ahora» y «Agregar al carrito» están
      deshabilitados y el selector de cantidad no permite subir de 1.
- [x] **AC5** (nuevo, D-5) — Dados los productos relacionados, cuando hay más de
      los que caben, entonces el carrusel se desplaza con las flechas, estas se
      deshabilitan en los extremos y la lista sigue siendo recorrible con Tab.
- [x] **AC6** (010-AC8) — Dado el cart drawer con una línea de 2 unidades,
      cuando se abre, entonces muestra el precio unitario y la cantidad
      (`S/ X × 2`) además del total de la línea, y bajo el CTA aparecen los
      iconos de medios de pago.
- [x] **AC7** (nuevo, D-6) — Dado el cart drawer con al menos un producto,
      cuando se mira bajo el botón de finalizar, entonces hay un enlace
      secundario «Seguir comprando» que cierra el panel sin vaciar el carrito.
- [x] **AC8** (010-AC7) — Dado el footer, cuando se carga cualquier página del
      storefront, entonces sobre él aparece una banda con cuatro beneficios sobre
      fondo de acento, y en la barra de copyright los iconos de medios de pago.
- [x] **AC9** (nuevo, D-8) — Dado el campo de newsletter del footer, cuando se
      intenta usar, entonces está inequívocamente marcado como no operativo
      (`disabled` + texto «Próximamente») y no envía nada a ninguna parte.
- [x] **AC10** (010-AC13) — Dado `/checkout` con el carrito lleno, cuando se
      carga, entonces se ve un stepper de tres pasos con el segundo activo, y
      junto al botón de pago un candado y la mención «Pago procesado por Stripe».
- [x] **AC11** (nuevo, D-9) — Dado el footer y el checkout, cuando se pulsa
      cualquier enlace nuevo, entonces todos apuntan a rutas o anclas que existen
      de verdad (`/#ventajas`, `/#catalogo`, `/sign-in`…): ninguno lleva a «no
      encontrada» ni a `#`, salvo los iconos sociales, que van explícitamente
      inertes.
- [x] **AC12** (010-AC14) — Dado el tema oscuro, cuando se recorren los
      componentes nuevos, entonces ninguno usa color hardcoded: todos heredan
      tokens `nx-*` o variables semánticas de shadcn.
- [x] **AC13** (010-AC15) — Dado `prefers-reduced-motion: reduce`, entonces no
      queda ninguna animación nueva en marcha: ni la entrada de la línea del
      carrito, ni el desplazamiento del carrusel, ni el hover de las tarjetas de
      entrega.
- [x] **AC14** (010-AC16) — Dado `package.json`, cuando termina la
      implementación, entonces sus dependencias son idénticas a las del inicio.
- [x] **AC15** (heredado de spec 007) — Dado `/checkout`, cuando lo abre alguien
      sin sesión, entonces sigue devolviendo el `307` a
      `/sign-in?redirect_url=…` antes del primer flush, y el importe que cobra
      Stripe lo sigue calculando el servidor.

## 5. Modelo de datos

**Sin cambios de esquema.** Ni tablas, ni columnas, ni migraciones.

Los tres bloques informativos nuevos son decorativos y así se documentan:

- **Métodos de entrega** (D-5): «Despacho a domicilio» y «Retiro en tienda» con
  badge verde **«Disponible» fijo**. No hay modelo de tiendas ni de cobertura
  logística detrás. Decisión explícita del usuario (2026-09-10): se mantiene tal
  como lo propuso el documento 010.
- **Estimación de envío** (D-6): «Envío estimado: 1–2 días hábiles a Lima».
  Texto fijo, sin cálculo.
- **Stepper de checkout** (D-9): tres pasos con el segundo activo. No hay
  máquina de estados detrás; el pago sigue siendo un salto único a la página
  alojada de Stripe.

Los **highlights** de D-5 (`ProductHighlights`) sí salen de datos reales:
`product.specs` (`Record<string,string> | null`, ya en `CatalogProductDetail`) y,
si no hay specs, de las dos garantías que la tienda ya afirma. **No** se
«extraen ventajas de la descripción» partiendo texto libre: eso produciría
frases cortadas.

## 6. Contratos de API

**Sin endpoints nuevos y sin cambios de contrato.**

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| POST | `/api/checkout` | cliente (`requireActiveUser()`) | `{ lines: [{ productId, quantity }] }` | `{ url }` | 400, 401, 403, 409, 502 |

Se consume igual que hoy, vía `useCreateCheckout()` desde `CheckoutSummary`. El
botón «Comprar ahora» de la ficha **no** llama a este endpoint: añade al carrito
y navega a `/checkout`, donde el flujo existente sigue siendo el único que crea
la Checkout Session. Duplicar la creación de sesión desde la ficha abriría un
segundo camino al pago con su propia validación.

## 7. Arquitectura y archivos afectados

Solo capa de presentación: `src/modules/storefront/components/`,
`src/modules/cart/components/`, `src/modules/orders/components/` y dos pages.

### 7.1 D-5 — Ficha de producto enriquecida

| Elemento | Cambio |
|:---|:---|
| **Tres zonas** | ≥ 1024 px: `grid-cols-[minmax(0,6fr)_minmax(0,4fr)_minmax(0,3fr)]` — medios / información / panel de compra. Entre 900 y 1024 px se mantienen dos columnas con el panel bajo la información. Bajo 900 px, una columna, como hoy. El arte conserva `aspect-[4/3]`, `object-contain` y su `priority` (spec 005). Se deja el hueco de miniaturas bajo el arte como comentario, sin marcado vacío. |
| **Panel de compra sticky** | `ProductPurchasePanel`, componente **cliente nuevo**: precio, señal de stock, selector de cantidad, «Comprar ahora», «Agregar al carrito» y las dos garantías. `position: sticky; top: calc(var(--nx-header-h) + 1rem)` solo en la zona de tres columnas. |
| **Selector de cantidad** | `QuantitySelector` controlado (`value`, `onChange`, `max`), botones de 44 px, `output` con `tabular-nums`, tope en `MAX_LINE_QUANTITY`. Es el mismo lenguaje visual del stepper del drawer. |
| **Añadir con cantidad** | El panel llama a `add(product, quantity)` — la firma del store **ya acepta cantidad**. No se usa `setQuantity`, como sugería 010: el producto puede no estar todavía en el carrito y `setQuantity` no lo crearía. |
| **Comprar ahora** | CTA primario: `add(product, quantity)` y `router.push('/checkout')`. «Agregar al carrito» pasa a `variant="outline"`. Ambos deshabilitados con `stockLevel === 'out'`. |
| **Métodos de entrega** | `DeliveryMethods`: dos tarjetas con icono y badge verde **«Disponible» fijo**, decorativas (§5). `.nx-hover-lift` de 011. |
| **Breadcrumb** | Estilo pill: fondo `bg-secondary` al hover, radio completo, chevrons ya existentes. Se conserva `CategoryJumpLink` y el último escalón sin enlace con `aria-current="page"`. |
| **Highlights** | `ProductHighlights`: hasta cuatro bullets construidos desde `product.specs`; si `specs` es `null`, cae a las dos garantías de la tienda. Si no hay nada que decir, no renderiza (mismo criterio que `ProductSpecList` y `DealsSection`). |
| **Relacionados en carrusel** | `related-products.tsx` sigue siendo **Server Component** y envuelve la lista en `CarouselTrack`, un cliente pass-through (mismo patrón que `Reveal`) que aporta el `overflow-x` con scroll-snap y las dos flechas. Las tarjetas se siguen renderizando en el servidor. |

**Archivos**
- `MODIFY` `src/modules/storefront/components/product-detail.tsx`
- `MODIFY` `src/modules/storefront/components/product-breadcrumb.tsx`
- `MODIFY` `src/modules/storefront/components/related-products.tsx`
- `NEW` `src/modules/storefront/components/product-purchase-panel.tsx`
- `NEW` `src/modules/storefront/components/quantity-selector.tsx`
- `NEW` `src/modules/storefront/components/delivery-methods.tsx`
- `NEW` `src/modules/storefront/components/product-highlights.tsx`
- `NEW` `src/modules/storefront/components/carousel-track.tsx`

> `product-purchase-panel.tsx` y `carousel-track.tsx` **no** estaban en el
> documento 010. Son consecuencia de mantener `product-detail.tsx` y
> `related-products.tsx` como Server Components: el estado de cantidad y el
> desplazamiento del carrusel necesitan cliente, y aislarlos evita arrastrar toda
> la ficha al bundle del navegador (§8).

### 7.2 D-6 — Cart drawer con más señales de confianza

| Elemento | Cambio |
|:---|:---|
| **Thumbnail** | Columna de 74 px → 90 px (`grid-cols-[90px_1fr]`), radio más suave. Actualizar también el `sizes` de `ProductMedia` a `90px`, o el navegador seguirá pidiendo la variante pequeña. |
| **Resumen por línea** | Bajo el nombre, `S/ X × N` con el precio unitario. El total de línea sigue a la derecha, donde ya está. |
| **Estimación de envío** | Línea fija bajo la barra de progreso: «Envío estimado: 1–2 días hábiles a Lima». Decorativa (§5). |
| **Medios de pago** | `PaymentIcons`: SVG inline de Visa, Mastercard y AMEX, monocromo sobre `currentColor` para no pelearse con el dark mode. **Sin imágenes externas ni logos a color**: son marcas registradas y un SVG monocromo genérico basta como señal. |
| **Seguir comprando** | Enlace secundario bajo el CTA que hace `setCartOpen(false)`. El texto del estado vacío no cambia. |
| **Entrada de línea** | Cada `<li>` entra con `motion.li` (fade + desplazamiento corto). `MotionProvider` ya lo neutraliza bajo reduced-motion. La lista se anima por `key={line.productId}`, no por índice. |

**Archivos**
- `MODIFY` `src/modules/cart/components/cart-drawer.tsx`
- `NEW` `src/modules/storefront/components/payment-icons.tsx`

### 7.3 D-8 — Footer profesional

| Elemento | Cambio |
|:---|:---|
| **Banda de beneficios** | `TrustBand` sobre el footer: cuatro iconos con label — Envío 24 h, Garantía 2 años, 30 días de devolución, Pago seguro. `bg-primary text-primary-foreground`. Son exactamente las cuatro afirmaciones que la tienda ya hace en `FeaturesSection` y en la barra de avisos: no se inventa ninguna promesa nueva. |
| **Medios de pago** | `PaymentIcons` (de D-6) en la barra de copyright. |
| **Redes sociales** | Tres iconos en `<span aria-hidden>` con la leyenda «Pronto en redes». **No** se pintan como enlaces a `#`: un ancla que no navega es una trampa para teclado y lector de pantalla, y el footer ya arrastra la lección del commit `685d9c0`. |
| **Botón «Subir»** | Enlace/botón en el footer que reutiliza el mismo `scrollTo({ top: 0, behavior: 'smooth' })` del `ScrollToTop` de 011. |
| **Newsletter** | Campo `disabled` + botón `disabled` + texto visible «Próximamente». Sin `tooltip` (no instalado) y sin `aria-disabled` sobre un control operativo: se deshabilita de verdad. |

**Archivos**
- `MODIFY` `src/modules/storefront/components/storefront-footer.tsx`
- `NEW` `src/modules/storefront/components/trust-band.tsx`
- `REUSE` `src/modules/storefront/components/payment-icons.tsx` (D-6)
- `REUSE` `src/modules/storefront/components/scroll-to-top.tsx` (spec 011)

### 7.4 D-9 — Checkout con más contexto y confianza

| Elemento | Cambio |
|:---|:---|
| **Stepper** | `CheckoutStepper`: tres pasos —Carrito ✓, Pago (activo), Confirmación—. Decorativo (§5). Marcado como `<ol>` con `aria-current="step"` en el activo; los pasos no son clicables. |
| **Layout de dos columnas** | **Ya existe** en `checkout-summary.tsx`. No se toca la rejilla; solo se le añaden las señales de seguridad dentro de la columna del resumen. |
| **Señales de seguridad** | Candado `Lock` junto al botón de pago (el icono **ya está importado** en `checkout-summary.tsx`) y la leyenda «Pago procesado por Stripe». Sin logo de Stripe descargado ni badge de SSL falso: se afirma lo que es cierto. |
| **Políticas** | Bajo el CTA, enlaces a `/#ventajas` y `/#catalogo`, que existen. |

**Archivos**
- `MODIFY` `src/app/(storefront)/checkout/page.tsx`
- `MODIFY` `src/modules/orders/components/checkout-summary.tsx`
- `NEW` `src/modules/storefront/components/checkout-stepper.tsx`

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Extraer `ProductPurchasePanel` como isla cliente | Poner `"use client"` en `product-detail.tsx` | La ficha es Server Component a propósito (spec 005, §10): solo bajan al cliente `ProductMedia` y `AddToCartButton`. Marcar el archivo entero enviaría al navegador specs, descripción y todo el marcado, y contradice CLAUDE.md regla 7. |
| `add(product, quantity)` en vez de `setQuantity` | Lo que sugería 010 | `setQuantity` solo actualiza una línea existente; si el producto no está en el carrito, no hace nada. `add` ya acepta cantidad y aplica `clampQuantity`. |
| «Comprar ahora» añade y navega a `/checkout` | Llamar a `POST /api/checkout` desde la ficha | Habría dos caminos hacia la Checkout Session, cada uno con su manejo de error y su estado de carga. El de `/checkout` ya está revisado (spec 007) y es el único que debe crear sesiones. |
| `CarouselTrack` como wrapper cliente pass-through | Convertir `related-products.tsx` en `"use client"` | Arrastraría `ProductCard` —y con él el arte SVG de categoría— al bundle del cliente en una página cuyo objetivo es SEO. El patrón pass-through ya está probado en `Reveal`. |
| Carrusel con `overflow-x` + `scroll-snap` + `scrollBy()` | `translateX` con índice, como `FeaturedSlider` | El scroll nativo es accesible por defecto: rueda, trackpad, arrastre táctil y Tab funcionan sin código. Las flechas solo llaman a `scrollBy`. `FeaturedSlider` usa `translateX` porque es un slider de una diapositiva a la vez; aquí son tarjetas. |
| Iconos de pago como SVG inline monocromo | `<img>` a logos oficiales a color | Sin peticiones externas, sin hosts nuevos en `remotePatterns`, y el color se resuelve con `currentColor` en ambos temas. Los logos a color de Visa/Mastercard tienen condiciones de uso de marca. |
| Redes sociales inertes (`<span aria-hidden>`), no `<a href="#">` | Enlaces vacíos «para cuando se configuren» | Un ancla a `#` es una parada de tabulación que no lleva a ninguna parte. El propio footer ya documenta que se retiraron enlaces rotos una vez. |
| Newsletter con `disabled` real y texto «Próximamente» | `aria-disabled` + tooltip | `tooltip` no está instalado, y `aria-disabled` sobre un control que sigue siendo enfocable y enviable es peor que deshabilitarlo. El texto visible informa a todo el mundo, no solo a quien pasa el ratón. |
| El stepper es `<ol>` con `aria-current="step"` y pasos no clicables | Botones o enlaces por paso | Es decoración de proceso: si fueran clicables prometerían una navegación multi-paso que no existe. |
| `checkout-summary.tsx` conserva su rejilla de dos columnas | Rehacerla según D-9 | Ya está implementada (`lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]`). Reescribirla sería riesgo sin beneficio. |

### Correcciones al documento 010

- D-9 pedía «resumen lateral: layout de 2 columnas en desktop». **Ya existe** en
  `checkout-summary.tsx`. Solo quedan stepper, señales de seguridad y políticas.
- D-5 pedía «breadcrumb con separadores chevron». **Ya los tiene**
  (`ChevronRight` en `product-breadcrumb.tsx`). Lo que falta es el estilo pill.
- D-5 proponía extraer los highlights «de la descripción». Se sustituye por
  `product.specs`, que es dato estructurado real (§5).
- D-9 mencionaba «badges de SSL» y «logo mini de Stripe». Se reducen a una
  mención textual: un badge de SSL dibujado a mano es una afirmación de seguridad
  sin nada que la respalde.

## 9. Tareas

Ordenadas por dependencia. Cada una toca un archivo y una capa.

**Ficha de producto (D-5)**

- [x] **T1** — `QuantitySelector`: cliente controlado, `value`/`onChange`/`max`,
      botones de 44 px, `output` con `tabular-nums` · archivo:
      `src/modules/storefront/components/quantity-selector.tsx` · verificación:
      `npm run typecheck` (AC2)
- [x] **T2** — `DeliveryMethods`: dos tarjetas decorativas con badge
      «Disponible» y `.nx-hover-lift` · archivo:
      `src/modules/storefront/components/delivery-methods.tsx` · verificación:
      `npm run typecheck` (AC1)
- [x] **T3** — `ProductHighlights`: hasta 4 bullets desde `product.specs`, con
      fallback a las dos garantías y `null` si no hay nada · archivo:
      `src/modules/storefront/components/product-highlights.tsx` ·
      verificación: `npm run typecheck` con un producto sin specs (AC1)
- [x] **T4** — `ProductPurchasePanel`: cliente, estado de cantidad, `add(product,
      quantity)`, «Comprar ahora» con `router.push('/checkout')`, ambos CTAs
      deshabilitados sin stock · archivo:
      `src/modules/storefront/components/product-purchase-panel.tsx` ·
      verificación: `npm run typecheck` (AC2, AC3, AC4)
- [x] **T5** — Estilo pill y hover del breadcrumb, conservando
      `CategoryJumpLink` y `aria-current` · archivo:
      `src/modules/storefront/components/product-breadcrumb.tsx` ·
      verificación: `npm run build` (AC1)
- [x] **T6** — Reestructurar la ficha en tres zonas y montar panel, highlights y
      métodos de entrega, manteniendo el archivo como Server Component ·
      archivo: `src/modules/storefront/components/product-detail.tsx` ·
      verificación: `npm run build`; la ficha sigue sin `"use client"` (AC1)
- [x] **T7** — `CarouselTrack`: cliente pass-through con `overflow-x`,
      `scroll-snap`, flechas que llaman a `scrollBy` y se deshabilitan en los
      extremos · archivo:
      `src/modules/storefront/components/carousel-track.tsx` · verificación:
      `npm run typecheck` (AC5)
- [x] **T8** — Envolver la lista de relacionados en `CarouselTrack` sin
      convertir el archivo en cliente · archivo:
      `src/modules/storefront/components/related-products.tsx` · verificación:
      `npm run build`; las tarjetas siguen en el HTML inicial (AC5)

**Carrito (D-6)**

- [x] **T9** — `PaymentIcons`: SVG inline monocromo de Visa, Mastercard y AMEX
      sobre `currentColor`, contenedor `aria-hidden` con texto alternativo
      «Aceptamos Visa, Mastercard y American Express» en `sr-only` · archivo:
      `src/modules/storefront/components/payment-icons.tsx` · verificación:
      `npm run typecheck` (AC6, AC8)
- [x] **T10** — Cart drawer: thumbnail a 90 px con su `sizes`, precio unitario ×
      cantidad, estimación de envío, `PaymentIcons` bajo el CTA, «Seguir
      comprando» y entrada animada de línea · archivo:
      `src/modules/cart/components/cart-drawer.tsx` · verificación:
      `npm run build` y el drawer con dos líneas (AC6, AC7, AC13)

**Footer (D-8)**

- [x] **T11** — `TrustBand`: cuatro beneficios sobre `bg-primary`, los mismos que
      ya afirma `FeaturesSection` · archivo:
      `src/modules/storefront/components/trust-band.tsx` · verificación:
      `npm run typecheck` (AC8)
- [x] **T12** — Footer: montar `TrustBand`, `PaymentIcons` en el copyright,
      iconos sociales inertes, botón «Subir» y newsletter deshabilitado con
      «Próximamente» · archivo:
      `src/modules/storefront/components/storefront-footer.tsx` ·
      verificación: `npm run build`; ningún destino nuevo devuelve 404 (AC8, AC9, AC11)

**Checkout (D-9)**

- [x] **T13** — `CheckoutStepper`: `<ol>` de tres pasos con `aria-current="step"`
      en el activo, sin controles clicables · archivo:
      `src/modules/storefront/components/checkout-stepper.tsx` ·
      verificación: `npm run typecheck` (AC10)
- [x] **T14** — Añadir el candado y «Pago procesado por Stripe» junto al CTA, y
      los enlaces de políticas bajo él, sin tocar la rejilla existente ni
      `startPayment` · archivo:
      `src/modules/orders/components/checkout-summary.tsx` · verificación:
      `npm run build`; el flujo de pago sigue funcionando (AC10, AC11)
- [x] **T15** — Montar `CheckoutStepper` bajo el encabezado del checkout, sin
      tocar `auth.protect()` ni `robots` · archivo:
      `src/app/(storefront)/checkout/page.tsx` · verificación: sin sesión sigue
      llegando el `307` a `/sign-in` (AC10, AC15)

**Cierre**

- [x] **T16** — `npm run typecheck && npm run lint && npm run build` en verde y
      `git diff package.json` vacío · verificación: AC14

## 10. Riesgos y consideraciones

- **Regresión del pago (spec 007).** `checkout-summary.tsx` calcula los totales
  con `calculateOrderTotals`, los mismos helpers que usa el servidor, y el
  request solo transporta `(productId, quantity)`. Cualquier cambio visual debe
  dejar `startPayment` intacto: si el resumen y el importe cobrado divergen, es
  porque hay dos aritméticas.
- **Regresión de la ficha (spec 005).** El arte lleva `priority` porque es el
  LCP de la página; reorganizar las tres zonas no debe quitárselo ni cambiar el
  `sizes` sin recalcularlo. El layout de la ficha además hace `notFound()` por
  encima del `<Suspense>`: no se toca.
- **Ficha convertida en cliente por accidente.** Es el riesgo principal de T6.
  Si `product-detail.tsx` acaba con `"use client"`, se pierde el HTML inicial que
  sostiene el SEO y el JSON-LD del producto.
- **Cantidad vs. stock real.** El selector topa en `MAX_LINE_QUANTITY`, no en el
  stock: el entero de stock **no sale del servidor** a propósito (spec 004, D-7),
  solo `stockLevel`. Añadir 10 unidades de un producto con 3 disponibles seguirá
  siendo posible; lo corta el servidor al crear la Checkout Session, como hoy.
  No se intenta arreglar aquí.
- **Sticky y header de dos filas.** El header de 011 es más alto: el `top` del
  panel sticky debe salir de una variable, no de un número copiado.
- **Marcas de terceros.** Los SVG de medios de pago son representaciones
  monocromas simplificadas, no los logos oficiales.
- **Carrusel y teclado.** Con `overflow-x`, el contenedor debe ser enfocable
  (`tabindex="0"`) o contener elementos enfocables para que se pueda recorrer sin
  ratón; las tarjetas ya llevan enlaces, así que basta con no atrapar el foco.

### Notas de compatibilidad

- Retrocompatible: cada tarea deja la tienda funcionando.
- Dark mode: solo tokens `nx-*` y variables semánticas de shadcn.
- Accesibilidad: se mantienen los criterios del spec 004 — AC10 (foco y
  overlays), AC16 (reduced-motion) y AC17 (≥ 44 px, sin scroll horizontal a
  390 px) — y los del spec 007 para el checkout.
- La skill `web-design-guidelines` está instalada pero necesita `WebFetch`, no
  disponible en la sesión del agente `spec`; los criterios de este documento
  salen del código verificado y de los specs previos.

## 11. Fuera de alcance / deuda aceptada

**Se difiere dentro de la serie mejoras-ui**

- Banners promocionales y countdown, sección de categorías, cuenta del usuario y
  todo el trabajo móvil → **spec 013**. En particular, la barra inferior de móvil
  de 013 convivirá con el CTA de la ficha: 013 redefine `--nx-fab-bottom` y
  añade el `padding-bottom` del `<main>`.
- El footer de este spec crece en alto; 013 debe comprobar que la barra inferior
  de móvil no lo tapa.

**Se difiere fuera de la serie**

- **Galería de miniaturas** en la ficha: necesita la tabla `product_images`. El
  hueco queda documentado en el marcado como comentario, sin div vacío.
- **Checkout multi-paso real** (dirección, método de envío, revisión). Hoy la
  dirección la recoge la página alojada de Stripe; un checkout propio es un spec
  con modelo de datos, no una mejora visual.
- **Newsletter operativa**: requiere tabla `subscribers` y un `POST`.
- **Redes sociales reales**: cuando existan las cuentas, los `<span>` inertes
  pasan a `<a>` con `rel="noopener"`.
- **Selector de cantidad limitado por stock real**: exige publicar el entero de
  stock o un endpoint de disponibilidad; contradice spec 004 D-7 y necesita su
  propia decisión.

## 12. Correcciones de revisión

### Iteración 1 — 1 hallazgo MAYOR, corregido

- [x] **[MAYOR] Duplicación de la lógica de `prefers-reduced-motion`.** El par
  `matchMedia(...).matches` + `behavior: reduced ? 'auto' : 'smooth'` estaba
  escrito en `carousel-track.tsx`, `scroll-to-top.tsx` y `catalog-section.tsx`
  (tercera repetición, CLAUDE.md §6), y `featured-slider.tsx` había extraído por
  su cuenta una constante local con el mismo nombre y valor.
  **Fix:** nuevo `src/modules/storefront/lib/motion.ts` con
  `REDUCED_MOTION_QUERY`, `prefersReducedMotion()` y `scrollBehavior()`. Los tres
  manejadores de scroll llaman a `scrollBehavior()` y `featured-slider` importa
  la constante compartida y usa `prefersReducedMotion` como snapshot de
  `useSyncExternalStore`, en lugar de su copia local. Extracción pura: el
  comportamiento de las flechas del carrusel, el botón «Subir» y el salto al
  cambiar de página del catálogo no cambia.
  **Verificación:** `npm run typecheck && npm run lint && npm run build` en verde.

Los 4 hallazgos MENOR de la misma iteración quedaron aceptados como no
bloqueantes o registrados como deuda para el spec 013.

### Iteración 2 — sin hallazgos, APROBADO

Revisión completa desde el Paso 1. La corrección del MAYOR es una extracción
pura: `src/modules/storefront/lib/motion.ts` concentra `REDUCED_MOTION_QUERY`,
`prefersReducedMotion()` y `scrollBehavior()`, y sus cuatro consumidores
—`carousel-track.tsx`, `scroll-to-top.tsx`, `catalog-section.tsx` y
`featured-slider.tsx`— son todos islas cliente. En `featured-slider.tsx` el
`getServerSnapshot` de `useSyncExternalStore` sigue siendo `() => false`, así
que la mecánica anti-mismatch de hidratación del commit `6f20f2a` queda intacta.

`npm run typecheck` ✓ · `npm run lint` ✓ (0 errores) · `npm run build` ✓.
