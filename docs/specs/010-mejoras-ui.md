---
id: 010
title: Mejoras UI/UX del storefront — patrones de e-commerce premium
status: superseded
module: storefront
scope: client
created: 2026-09-09
superseded_by: docs/specs/011-mejoras-ui-header-catalogo.md, docs/specs/012-mejoras-ui-pdp-checkout.md, docs/specs/013-mejoras-ui-promo-cuenta-mobile.md
superseded_on: 2026-09-10
reference: https://simple.ripley.com.pe/
---

> ## ⛔ REEMPLAZADO — no implementar desde este documento
>
> **Este spec fue sustituido el 2026-09-10 por la serie 011 / 012 / 013.**
>
> Sus 12 decisiones de diseño, 21 archivos nuevos y 24 modificados no caben en
> un ciclo `developer ⇄ reviewer` de 3 iteraciones (CLAUDE.md §3), así que el
> alcance se repartió en tres specs secuenciales, cada uno con su propia puerta
> de aprobación humana:
>
> | Spec | Decisiones | Contenido |
> |:---|:---|:---|
> | [011 — base, tarjeta, catálogo y header](011-mejoras-ui-header-catalogo.md) | D-11 (parcial), D-3, D-4, D-1 | CSS global, `ProductCard`, catálogo con sidebar/orden/paginación, header de dos niveles |
> | [012 — ficha, carrito, footer y checkout](012-mejoras-ui-pdp-checkout.md) | D-5, D-6, D-8, D-9 | PDP de 3 zonas, cart drawer, footer con trust band, checkout con stepper |
> | [013 — promociones, categorías, cuenta y móvil](013-mejoras-ui-promo-cuenta-mobile.md) | D-2, D-7, D-10, D-12 | Banners y countdown, categorías, cuenta, bottom nav y swipe |
>
> Los tres specs conservan el contenido de este documento (contexto, decisiones
> de diseño, archivos afectados y criterios de aceptación, renumerados), y
> además:
>
> - **corrigen** lo que este documento afirmaba y no coincide con el código
>   verificado el 2026-09-10 —el toast de Sonner que el storefront no usa, el
>   layout de dos columnas del checkout que ya existía, el avatar de la cuenta
>   que ya mide 88 px, `category-art.tsx` que la sección de categorías no
>   consume, y los chevrons del breadcrumb que ya estaban puestos—;
> - **documentan** que el countdown de D-2 revierte una decisión explícita del
>   spec 004 (D-6), que sigue escrita en un comentario de `deals-section.tsx`;
> - **sustituyen** la nota de §10 sobre «generar imágenes con la herramienta de
>   generación de imágenes» por imágenes de bancos libres de derechos
>   (Unsplash/Pexels u otro banco CC0) descargadas a `public/` por la sesión
>   principal antes de la tarea que las usa (spec 013, §7.1).
>
> Este archivo se conserva como referencia histórica del análisis de
> `simple.ripley.com.pe`. **Ninguna tarea se ejecuta desde aquí.**

# 010 — Mejoras UI/UX del storefront: patrones de e-commerce premium

## 1. Contexto

El storefront tiene una identidad visual sólida (paleta Nexbyte, tokens `nx-*`,
dark mode, glassmorphism en el header, orbes decorativos, animaciones
`@keyframes`) y cumple los requisitos funcionales de los specs 004–009. Sin
embargo, comparado con tiendas de referencia como Ripley Perú
(`simple.ripley.com.pe`), varios patrones de interacción y densidad de
información están por debajo de lo que el visitante espera de un e-commerce
de tecnología en el mercado peruano.

### Referencia visual analizada

Se inspeccionó `simple.ripley.com.pe` el 9 de septiembre de 2026 y se
identificaron los patrones clave que elevan la experiencia de compra:

- **Header de dos niveles**: barra primaria oscura con logo, barra de búsqueda
  pill-shaped prominente, selector de ubicación de envío, cuenta, carrito con
  badge; barra secundaria con enlaces de servicio.
- **Mega-menú de categorías** desplegable con icono hamburguesa.
- **Banners promocionales** full-width con carrusel, countdown de flash sales y
  secciones temáticas tipo «me fascina la tecnología» con logos de marca.
- **Tarjetas de producto con más densidad**: marca en uppercase, rating con
  estrellas, múltiples líneas de precio (normal, internet, tarjeta), badge de
  logística («Llega mañana»), badge de cupón, botón floating de quick-add.
- **Grid de búsqueda/catálogo con sidebar de filtros**: categorías jerárquicas,
  filtros accordion, chips de despacho, ordenamiento.
- **PDP de 3 columnas**: galería con miniaturas, columna de opciones (variantes
  de color/talla, tabla de precios), columna sticky de compra con quantity
  selector, botones «Comprar ahora» / «Agregar al carro» y tarjetas de método
  de entrega con badge de disponibilidad.
- **Footer con banda de valor**: iconos de beneficios (retiro en tienda, soporte,
  devolución), logos de medios de pago, botón «Subir» y redes sociales.

### Lo que ya está construido y no se reinventa

Next.js 16 con Turbopack, Tailwind v4, shadcn (radix-ui), `motion`, Clerk,
Zustand, TanStack Query, axios, cmdk, drizzle-orm + Neon, Stripe, Zod.

La paleta `[data-surface="storefront"]`, el sistema de tokens `nx-*`, los
componentes de shadcn (`Sheet`, `Dialog`, `Command`, `Button`, `Card`, etc.),
el carrito local, el buscador `⌘K`, el carrusel de destacados, la barra de
avisos marquee y el sistema de iconos por categoría ya existen y se mantienen.

## 2. Objetivo

Elevar la interfaz pública del storefront al nivel visual y de interacción de
un e-commerce premium peruano, **sin cambiar el stack tecnológico**, añadiendo
patrones que aumentan la conversión: mayor densidad de información en las
tarjetas de producto, navegación por categorías más accesible, página de detalle
más completa, checkout y carrito más confiables visualmente, y footer con
señales de marca y confianza.

## 3. Alcance

### Incluye

- Mejoras visuales y de interacción en **todos los componentes del storefront**
  que tienen contacto con el visitante.
- Nuevos componentes presentacionales donde sea necesario.
- Ajustes a tokens CSS dentro de `[data-surface="storefront"]`.
- Nuevas animaciones y micro-interacciones con `@keyframes` o `motion`.
- Mejoras de accesibilidad y rendimiento percibido.

### No incluye (explícito)

- **Cambio de stack**: no se instala ninguna librería que no esté en
  `package.json`. Si se necesita una nueva, se declara como prerequisito.
- **Cambio de modelo de datos**: no se añaden tablas ni columnas. Las mejoras
  usan los datos que ya devuelven los endpoints existentes.
- **Cambio en Route Handlers o repositorios**: solo se tocan componentes del
  lado cliente y Server Components del storefront.
- **Admin panel**: no se toca nada del grupo `(admin)`.

---

## 4. Decisiones de diseño detalladas

### D-1 — Header: dos niveles + mega-menú de categorías

**Estado actual**: header de un solo nivel, sticky con glassmorphism, que
contiene logo, navegación inline (Ofertas, Categorías, Catálogo, Ventajas),
barra de búsqueda expandida, toggle de tema, carrito y auth.

**Propuesta**:

| Elemento | Cambio |
|:---|:---|
| **Barra superior (announcement)** | Mantener la marquee actual, pero añadir un fondo de acento `bg-primary` con `text-primary-foreground` en vez de `bg-foreground text-background`. Más atractivo y coherente con la paleta Nexbyte. |
| **Header principal** | Dividir en dos filas visuales en desktop: (1) logo + búsqueda prominente + iconos de cuenta/carrito; (2) navegación horizontal de categorías reales (no solo anclas a secciones). Colapsados en una sola fila en mobile. |
| **Barra de búsqueda** | Hacerla más prominente: ancho mínimo de `360px` en desktop, fondo blanco contrastado contra el header, icono de lupa a la izquierda, placeholder dinámico que rote frases («Busca laptops...», «Busca monitores...»). |
| **Mega-menú** | Nuevo componente `CategoryMegaMenu`: botón hamburguesa «Categorías» que abre un dropdown/popover con las categorías reales (misma lectura memoizada) + icono + conteo de productos. Solo desktop. En mobile se integra en el sheet existente (`MobileMenu`). |
| **Badge del carrito** | Añadir animación de pulso/scale al incrementar el contador. Actualmente solo muestra el número sin feedback visual. |
| **Ubicación de envío** | Nuevo componente decorativo `DeliveryLocationBadge`: muestra «Enviar a Lima» con icono de pin. Es estático por ahora (no hay modelo de ubicaciones), pero da señal de confianza logística. |

**Archivos afectados**:
- `MODIFY` [`storefront-header.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/storefront-header.tsx)
- `MODIFY` [`announcement-bar.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/announcement-bar.tsx)
- `NEW` `src/modules/storefront/components/category-mega-menu.tsx`
- `NEW` `src/modules/storefront/components/delivery-location-badge.tsx`
- `NEW` `src/modules/storefront/components/animated-search-placeholder.tsx`
- `MODIFY` [`mobile-menu.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/mobile-menu.tsx)

---

### D-2 — Banners promocionales y secciones temáticas

**Estado actual**: el hero tiene texto + producto destacado + estadísticas. El
`FeaturedSlider` muestra ofertas con autoplay. No hay banners promocionales
de imagen completa ni secciones de marca.

**Propuesta**:

| Elemento | Cambio |
|:---|:---|
| **Hero con banner de imagen** | Añadir soporte para un banner de imagen de fondo opcional en el hero. Si existe, se superpone el texto sobre un overlay semitransparente con gradiente. Si no, se mantiene el layout actual con orbes. Controlado por una constante o un componente condicional. |
| **Sección «Flash Sale»** | Evolucionar `DealsSection` para incluir un componente de countdown visual con cajas de horas:minutos:segundos (CSS puro, decorativo). Aunque no hay `discount_ends_at`, se puede fijar a las 23:59 del día actual como señal de urgencia. Documentar que es decorativo. |
| **Sección de marcas** | Nuevo componente `BrandsShowcase`: fila de logos/iconos de las marcas que representen las categorías principales (derivado de las categorías existentes). Usa los mismos iconos de `getCategoryIcon()` en versión grande, dentro de tarjetas con el nombre de la categoría. |
| **Banner entre secciones** | Nuevo componente `PromoBanner`: banner horizontal entre secciones con gradiente de acento, texto tipo tagline y CTA. Contenido estático en constantes, como `FeaturesSection`. |

**Archivos afectados**:
- `MODIFY` [`hero.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/hero.tsx)
- `MODIFY` [`deals-section.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/deals-section.tsx)
- `NEW` `src/modules/storefront/components/countdown-timer.tsx`
- `NEW` `src/modules/storefront/components/brands-showcase.tsx`
- `NEW` `src/modules/storefront/components/promo-banner.tsx`
- `MODIFY` [`page.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/app/(storefront)/page.tsx) (incorporar nuevas secciones)

---

### D-3 — Tarjetas de producto con mayor densidad de información

**Estado actual**: las tarjetas muestran imagen, categoría (eyebrow), nombre,
precio, precio tachado, badge de descuento, señal de stock y botón de
añadir al carrito. No tienen rating, ni marca, ni badge de envío.

**Propuesta**:

| Elemento | Cambio |
|:---|:---|
| **Marca / Categoría** | Mostrar la categoría en uppercase bold como «marca» visual, más prominente que el eyebrow actual (color `foreground` en vez de `nx-faint`, `font-bold`). |
| **Rating decorativo** | Añadir un rating estático `★★★★★` de 5 estrellas debajo del nombre. Aunque no hay reseñas, sirve como placeholder visual que se puede conectar cuando exista la tabla. Se renderiza como componente `StarRating` con prop `value` (default: `null` → se oculta). |
| **Badge de logística** | Nuevo badge `Envío 24h` en la esquina superior derecha de la imagen (opuesto al badge de descuento). Aparece en todos los productos con `stockLevel !== 'out'`. Color `bg-nx-ok` sobre el arte. |
| **Precio más jerarquizado** | Si hay descuento: precio normal tachado arriba, precio actual más grande y en color de acento abajo, badge de descuento en rojo. Si no hay descuento: solo precio actual en negro/blanco. Inspirado en la triple línea de precios de Ripley pero simplificado a dos líneas. |
| **Hover effect mejorado** | Al hacer hover: elevar la tarjeta con `translateY(-4px)`, aumentar la sombra a `nx-shadow-lg`, y mostrar el botón de añadir al carrito con transición de opacidad (actualmente siempre visible). |
| **Quick view** | Considerar un botón de «vista rápida» (icono de ojo) que abra un `Dialog` con la info esencial del producto sin navegar. Se detalla como **fase opcional** porque requiere un componente nuevo con carga de datos. |

**Archivos afectados**:
- `MODIFY` [`product-card.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/product-card.tsx)
- `MODIFY` [`add-to-cart-button.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/add-to-cart-button.tsx)
- `NEW` `src/modules/storefront/components/star-rating.tsx`
- `NEW` `src/modules/storefront/components/logistics-badge.tsx`
- `MODIFY` [`globals.css`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/app/globals.css) (nuevas clases de hover)

---

### D-4 — Sección de catálogo con sidebar de filtros

**Estado actual**: filtros horizontales con chips de categoría (`FilterChip`),
sin sidebar. El catálogo muestra un grid de 2/3/4 columnas.

**Propuesta**:

| Elemento | Cambio |
|:---|:---|
| **Layout de dos columnas (desktop)** | En pantallas ≥ 1024px: sidebar izquierdo de ~240px + grid de productos a la derecha. En mobile: mantener chips horizontales actuales. |
| **Sidebar de filtros** | Contiene: (1) sección «Categorías» con lista vertical clicable mostrando nombre + conteo de productos, (2) sección «Disponibilidad» con checkboxes (En stock / Últimas unidades), (3) sección «Precio» con rango visual (futuro, placeholder). Cada sección colapsable con `motion` animate. |
| **Chip de filtro activo** | Cuando hay categoría o búsqueda activa, mostrar chips removibles encima del grid (ya existe para búsqueda, extender a categoría). |
| **Ordenamiento** | Nuevo dropdown `SortSelect` encima del grid: opciones «Relevancia», «Precio: menor a mayor», «Precio: mayor a menor», «Más recientes». Usa los valores de `sort` que ya acepta el endpoint. |
| **Contador de resultados** | Mostrar «X productos encontrados» usando `meta.total` de la respuesta. |
| **Paginación** | Añadir paginación al pie del grid con botones «Anterior» / «Siguiente» y números de página. Actualmente solo se muestra la primera página. |

**Archivos afectados**:
- `MODIFY` [`catalog-section.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/catalog-section.tsx)
- `NEW` `src/modules/storefront/components/catalog-sidebar.tsx`
- `NEW` `src/modules/storefront/components/sort-select.tsx`
- `NEW` `src/modules/storefront/components/catalog-pagination.tsx`
- `MODIFY` [`ui.store.ts`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/store/ui.store.ts) (nuevo estado: `catalogSort`, `catalogPage`)

---

### D-5 — Página de detalle de producto (PDP) enriquecida

**Estado actual**: layout de 2 columnas (imagen + info), imagen única sin
galería, precio, descuento, stock, botón de añadir, garantías y specs.

**Propuesta**:

| Elemento | Cambio |
|:---|:---|
| **Layout de 3 zonas** | Inspirado en Ripley: (1) columna de medios (imagen grande + preparar espacio para miniaturas futuras), (2) columna de información (categoría, nombre, descripción, specs), (3) **sidebar sticky de compra** (precio, stock, botón de añadir, cantidad, garantías). En screens < 900px colapsar a una columna como hoy. |
| **Selector de cantidad** | Añadir control `−/+` en la ficha antes del botón de añadir. Actualmente solo se ajusta en el drawer del carrito. Misma lógica de `setQuantity` del cart store. |
| **Botón «Comprar ahora»** | Nuevo botón primario que añade al carrito Y navega a `/checkout` en un solo clic. Es el CTA principal, más prominente que «Agregar al carrito» (que pasa a ser el secundario `variant="outline"`). |
| **Métodos de entrega** | Nuevo componente decorativo `DeliveryMethods`: dos tarjetas con icono y badge verde «Disponible» — «Despacho a domicilio» y «Retiro en tienda». Estático, señal de confianza. |
| **Breadcrumb mejorado** | Añadir separadores con chevron, estilizado con fondo pill y hover states. El breadcrumb actual es funcional pero visualmente austero. |
| **Sección «Lo que debes saber»** | Nuevo bloque entre specs y productos relacionados: lista de bullet points con las ventajas del producto extraídas de la descripción. Componente `ProductHighlights`. |
| **Productos relacionados mejorados** | Convertir la tira actual en un carrusel horizontal con flechas de navegación, no solo un grid estático. Usar `translateX` con controles, como `FeaturedSlider` pero más simple. |

**Archivos afectados**:
- `MODIFY` [`product-detail.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/product-detail.tsx)
- `MODIFY` [`product-breadcrumb.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/product-breadcrumb.tsx)
- `NEW` `src/modules/storefront/components/quantity-selector.tsx`
- `NEW` `src/modules/storefront/components/delivery-methods.tsx`
- `NEW` `src/modules/storefront/components/product-highlights.tsx`
- `MODIFY` [`related-products.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/related-products.tsx)

---

### D-6 — Cart drawer con más señales de confianza

**Estado actual**: drawer lateral con lista de líneas, progreso de envío gratis,
subtotal/envío/total, botón de finalizar compra. Funcional pero austero.

**Propuesta**:

| Elemento | Cambio |
|:---|:---|
| **Imagen de producto mejorada** | Aumentar tamaño del thumbnail de 74px a 90px. Borde redondeado más suave. |
| **Resumen por línea** | Mostrar precio unitario × cantidad debajo del nombre (ej. `S/ 1,299 × 2`). |
| **Estimación de envío** | Nuevo texto debajo del progreso: «Envío estimado: 1–2 días hábiles a Lima». Estático, señal de confianza. |
| **Medios de pago** | Fila de iconos de tarjetas aceptadas (Visa, Mastercard, AMEX) debajo del botón de finalizar. Iconos SVG inline, no imágenes externas. |
| **Botón «Seguir comprando»** | Ya existe en el estado vacío. Añadirlo también cuando hay productos, como enlace secundario debajo del botón de finalizar. |
| **Animación de entrada de línea** | Al añadir un producto, la nueva línea entra con `motion.div` desde la derecha con fade-in. |

**Archivos afectados**:
- `MODIFY` [`cart-drawer.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/cart/components/cart-drawer.tsx)
- `NEW` `src/modules/storefront/components/payment-icons.tsx`

---

### D-7 — Sección de categorías con imágenes y hover interactivo

**Estado actual**: grid de tarjetas con icono + nombre + conteo. Funcional pero
visualmente limitado comparado con las categorías circulares de Ripley.

**Propuesta**:

| Elemento | Cambio |
|:---|:---|
| **Tarjeta de categoría premium** | Reemplazar el icono small (42px) por un icono más grande (64px) con fondo de gradiente sutil de acento. Añadir una sombra de hover que refleje el color del acento. |
| **Contador más prominente** | Mover el conteo de productos a un badge separado tipo pill (`bg-secondary`) en la esquina superior derecha de la tarjeta. |
| **Animación de hover** | Al hacer hover: escalar icono `scale(1.15)`, elevar tarjeta `translateY(-6px)`, y cambiar borde a `border-primary`. Transición de 300ms ease-out. |
| **Layout responsive mejorado** | En mobile (< 640px): scroll horizontal con snap en vez de grid de 2 columnas. Las tarjetas se convierten en cards de ancho fijo (140px) con scroll lateral. |

**Archivos afectados**:
- `MODIFY` [`categories-section.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/categories-section.tsx)
- `MODIFY` [`category-art.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/category-art.tsx)

---

### D-8 — Footer profesional con banda de beneficios

**Estado actual**: footer de dos zonas (links + copyright) sobre fondo
`bg-nx-inset`. Funcional pero sin las señales de confianza que usan los
e-commerce peruanos.

**Propuesta**:

| Elemento | Cambio |
|:---|:---|
| **Banda de beneficios** | Nuevo componente `TrustBand` encima del footer actual: fila de 4 iconos con label — Envío 24h, Garantía 2 años, 30 días devolución, Pago seguro. Fondo de acento (`bg-primary`), iconos en blanco. Es una versión compacta de `FeaturesSection` pero en formato barra. |
| **Medios de pago** | Fila de logos de tarjetas (Visa, Mastercard, AMEX, Stripe) en el copyright bar. Reutilizar `PaymentIcons` del cart drawer. |
| **Redes sociales** | Placeholder de iconos sociales (Twitter/X, Instagram, Facebook). Enlaces vacíos (`#`), pero el espacio visual existe para cuando se configuren. |
| **Botón «Subir»** | Botón flotante o dentro del footer que hace `scrollTo(0)` con smooth behavior. Icono `ChevronUp`. |
| **Newsletter placeholder** | Campo de email decorativo con CTA «Suscríbete» en el footer. Sin funcionalidad real (no hay endpoint), pero el slot visual está listo. Se marca con `aria-disabled` y un tooltip que dice «Próximamente». |

**Archivos afectados**:
- `MODIFY` [`storefront-footer.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/storefront-footer.tsx)
- `NEW` `src/modules/storefront/components/trust-band.tsx`
- `NEW` `src/modules/storefront/components/scroll-to-top.tsx`
- `REUSE` `src/modules/storefront/components/payment-icons.tsx` (de D-6)

---

### D-9 — Checkout con más contexto y confianza

**Estado actual**: página con título, descripción y `CheckoutSummary` (resumen
del carrito con botón a Stripe).

**Propuesta**:

| Elemento | Cambio |
|:---|:---|
| **Stepper visual** | Nuevo componente `CheckoutStepper`: barra de progreso de 3 pasos — (1) Carrito ✓, (2) Pago (activo), (3) Confirmación. Es decorativo (no hay multi-step real), pero da confianza de proceso. |
| **Resumen lateral** | En desktop: layout de 2 columnas — formulario/CTA a la izquierda, resumen del carrito a la derecha (similar a un sidebar). En mobile: todo apilado. |
| **Señales de seguridad** | Icono de candado junto al botón de pago, texto «Powered by Stripe» con logo mini, badges de SSL y pago seguro. |
| **Políticas** | Texto de políticas de devolución y garantía debajo del botón, como links a anclas del footer (`/#ventajas`). |

**Archivos afectados**:
- `MODIFY` [`checkout/page.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/app/(storefront)/checkout/page.tsx)
- `NEW` `src/modules/storefront/components/checkout-stepper.tsx`
- `MODIFY` `src/modules/orders/components/checkout-summary.tsx`

---

### D-10 — Cuenta del usuario más visual

**Estado actual**: layout de sidebar + secciones de anclas. Perfil, favoritos
(placeholder), compras e historial de tarjetas.

**Propuesta**:

| Elemento | Cambio |
|:---|:---|
| **Avatar prominente** | Sección de perfil con avatar grande (80px), nombre completo en heading, email debajo, badge de «Cliente verificado» si tiene Stripe Customer. |
| **Tarjetas de resumen** | Encima de las secciones: 3 tarjetas KPI — «X pedidos», «Y tarjetas guardadas», «Miembro desde [fecha]». Datos derivados de los endpoints existentes. |
| **Sección de favoritos mejorada** | Aunque no hay wishlist real, mejorar el placeholder con una ilustración SVG decorativa en vez de solo el icono `Heart` + texto. |
| **Historial de compras** | Añadir un mini-gráfico de barras o indicador visual del gasto mensual (decorativo, usando datos del mes actual de `OrderHistory`). |

**Archivos afectados**:
- `MODIFY` [`account/page.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/app/(storefront)/account/page.tsx)
- `MODIFY` [`account-profile-card.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/account-profile-card.tsx)
- `NEW` `src/modules/storefront/components/account-summary-cards.tsx`
- `MODIFY` [`account-empty.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/account-empty.tsx)

---

### D-11 — Mejoras globales de CSS y micro-interacciones

**Estado actual**: sistema de tokens robusto, dark mode completo, glassmorphism,
orbes, `Reveal` con motion. Pero hay oportunidades de pulido.

**Propuesta**:

| Elemento | Cambio |
|:---|:---|
| **Scroll-to-top flotante** | Botón circular fijo en `bottom-right` que aparece al scrollear más de 400px. Transición con `motion` fade+scale. |
| **Toast mejorado** | Al añadir al carrito, el toast actual (Sonner) se complementa con una mini-preview del producto (thumbnail + nombre + precio). Requiere pasar datos al toast. |
| **Transiciones de página** | Usar `motion.div` con `AnimatePresence` para fade-in de las pages del storefront al navegar. Sutiles, 200ms. |
| **Skeleton loaders premium** | Los skeletons actuales son rectángulos grises. Añadir animación de shimmer (gradiente que se desplaza) vía `@keyframes`. |
| **Focus ring mejorado** | Aumentar el offset del focus ring a 4px y usar un color de anillo que coincida con el primary del storefront en ambos temas. |
| **Scroll progress indicator** | Barra fina en el top del viewport que muestra el progreso de scroll. Solo en PDP. Color `primary`, 2px de alto. |
| **Cursor personalizado** | En hover de tarjetas de producto, cambiar cursor a `pointer` con una transición suave de la sombra. Ya se hace parcialmente, asegurar consistencia. |

**Archivos afectados**:
- `MODIFY` [`globals.css`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/app/globals.css)
- `MODIFY` [`home-skeleton.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/home-skeleton.tsx)
- `NEW` `src/modules/storefront/components/scroll-progress.tsx`
- `MODIFY` [`storefront-overlays.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/storefront-overlays.tsx)
- `MODIFY` [`add-to-cart-button.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/add-to-cart-button.tsx)

---

### D-12 — Mobile-first responsive improvements

**Estado actual**: responsive funcional pero no optimizado para los patrones
de e-commerce móvil peruano.

**Propuesta**:

| Elemento | Cambio |
|:---|:---|
| **Bottom navigation bar** | Nuevo componente `MobileBottomNav`: barra fija en la parte inferior con 4 iconos — Inicio, Categorías, Carrito (con badge), Cuenta. Solo visible en `< 768px`. Sustituye al menú hamburguesa como la forma principal de navegar en mobile. |
| **Barra de búsqueda sticky en mobile** | En mobile, al hacer scroll, el header colapsa y la barra de búsqueda se convierte en un input sticky compacto debajo del header. |
| **Swipe en carrusel** | Añadir soporte de swipe táctil en `FeaturedSlider` con `touch-action: pan-y` y detección de gestos vía pointer events. Sin instalar `swiper`. |
| **Grid de productos 1 columna** | En screens < 400px, el grid pasa a 1 columna con tarjetas horizontales (imagen a la izquierda, info a la derecha, similar a las tarjetas secundarias de `DealsSection`). |
| **Mobile menu mejorado** | Añadir las categorías reales al sheet del menú móvil (debajo de la navegación actual), con los mismos iconos y conteos de la sección de categorías. |

**Archivos afectados**:
- `NEW` `src/modules/storefront/components/mobile-bottom-nav.tsx`
- `MODIFY` [`storefront-header.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/storefront-header.tsx)
- `MODIFY` [`featured-slider.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/featured-slider.tsx)
- `MODIFY` [`catalog-section.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/catalog-section.tsx)
- `MODIFY` [`mobile-menu.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/modules/storefront/components/mobile-menu.tsx)
- `MODIFY` [`layout.tsx`](file:///c:/Users/usuario/Documents/tecsup-vibecoding/ecommercev2/src/app/(storefront)/layout.tsx)

---

## 5. Criterios de aceptación

- [ ] **AC1** — El header muestra dos niveles en desktop con mega-menú de
      categorías y la barra de búsqueda es más prominente (min 360px ancho).
- [ ] **AC2** — Las tarjetas de producto muestran la categoría en formato
      «marca» (bold uppercase), badge de envío 24h, y jerarquía de precios
      mejorada con precio normal tachado arriba y precio actual debajo.
- [ ] **AC3** — Hover en tarjetas de producto produce: `translateY(-4px)`,
      aumento de sombra, y scale de la imagen `1.07` (ya existe).
- [ ] **AC4** — La sección de catálogo tiene sidebar de filtros en desktop
      (≥ 1024px) con categorías y ordenamiento.
- [ ] **AC5** — La paginación del catálogo funciona con botones
      «Anterior»/«Siguiente» y muestra el total de resultados.
- [ ] **AC6** — El PDP tiene layout de 3 zonas en desktop con sidebar sticky
      de compra, selector de cantidad, y botón «Comprar ahora».
- [ ] **AC7** — El footer incluye la banda de beneficios con 4 iconos en
      fondo de acento y fila de medios de pago.
- [ ] **AC8** — El cart drawer muestra el precio unitario × cantidad por
      línea y los iconos de medios de pago.
- [ ] **AC9** — Existe un botón «Subir» (scroll-to-top) que aparece al
      hacer scroll más de 400px.
- [ ] **AC10** — Los skeletons tienen animación de shimmer en vez de color
      plano.
- [ ] **AC11** — En mobile (< 768px) aparece una barra de navegación inferior
      fija con iconos de Inicio, Categorías, Carrito y Cuenta.
- [ ] **AC12** — El carrusel `FeaturedSlider` responde a swipe táctil en
      dispositivos móviles.
- [ ] **AC13** — El checkout muestra un stepper visual de 3 pasos y señales
      de seguridad (candado, «Powered by Stripe»).
- [ ] **AC14** — Dark mode funciona correctamente en todos los componentes
      nuevos, heredando los tokens `nx-*` existentes.
- [ ] **AC15** — `prefers-reduced-motion: reduce` desactiva todas las
      animaciones nuevas (shimmer, countdown, fade-in, scroll-to-top
      animation).
- [ ] **AC16** — Ningún componente nuevo instala una dependencia que no
      esté ya en `package.json`.

---

## 6. Resumen de archivos nuevos

| Archivo | Descripción |
|:---|:---|
| `category-mega-menu.tsx` | Dropdown de categorías en el header desktop |
| `delivery-location-badge.tsx` | Badge «Enviar a Lima» decorativo |
| `animated-search-placeholder.tsx` | Placeholder rotativo para la búsqueda |
| `countdown-timer.tsx` | Countdown visual para la sección de ofertas |
| `brands-showcase.tsx` | Fila de logos/iconos de categorías como marcas |
| `promo-banner.tsx` | Banner promocional horizontal entre secciones |
| `star-rating.tsx` | Componente de estrellas para tarjetas de producto |
| `logistics-badge.tsx` | Badge «Envío 24h» para tarjetas de producto |
| `catalog-sidebar.tsx` | Sidebar de filtros para la sección de catálogo |
| `sort-select.tsx` | Dropdown de ordenamiento del catálogo |
| `catalog-pagination.tsx` | Paginación del grid de productos |
| `quantity-selector.tsx` | Control `−/+` reutilizable para cantidad |
| `delivery-methods.tsx` | Tarjetas de método de entrega en el PDP |
| `product-highlights.tsx` | Lista de highlights del producto en el PDP |
| `payment-icons.tsx` | Iconos SVG de medios de pago (Visa, MC, AMEX) |
| `trust-band.tsx` | Banda de beneficios para el footer |
| `scroll-to-top.tsx` | Botón flotante de scroll arriba |
| `scroll-progress.tsx` | Barra de progreso de scroll en el PDP |
| `checkout-stepper.tsx` | Stepper visual de 3 pasos en checkout |
| `account-summary-cards.tsx` | Tarjetas KPI de resumen en la cuenta |
| `mobile-bottom-nav.tsx` | Barra de navegación inferior para mobile |

---

## 7. Resumen de archivos modificados

| Archivo | Cambio principal |
|:---|:---|
| `storefront-header.tsx` | Layout de 2 filas, badge animado, mega-menú |
| `announcement-bar.tsx` | Fondo de acento en vez de `bg-foreground` |
| `mobile-menu.tsx` | Categorías reales en el sheet |
| `hero.tsx` | Soporte para banner de imagen, layout mejorado |
| `deals-section.tsx` | Countdown timer visual |
| `product-card.tsx` | Marca bold, badge logística, hover mejorado |
| `add-to-cart-button.tsx` | Toast con preview, animación de feedback |
| `catalog-section.tsx` | Sidebar, sort, paginación, contador |
| `categories-section.tsx` | Iconos grandes, hover animado, scroll mobile |
| `product-detail.tsx` | 3 zonas, quantity selector, «Comprar ahora» |
| `product-breadcrumb.tsx` | Estilo pill, chevrons, hover states |
| `related-products.tsx` | Carrusel horizontal con controles |
| `cart-drawer.tsx` | Precio unitario, medios de pago, «Seguir comprando» |
| `storefront-footer.tsx` | Trust band, medios de pago, redes sociales |
| `home-skeleton.tsx` | Shimmer animation |
| `storefront-overlays.tsx` | Scroll-to-top, scroll progress |
| `globals.css` | Shimmer keyframe, hover utilities, focus ring |
| `(storefront)/page.tsx` | Nuevas secciones (brands, promo banner) |
| `(storefront)/layout.tsx` | Mobile bottom nav |
| `checkout/page.tsx` | Stepper, layout 2 columnas, seguridad |
| `account/page.tsx` | Summary cards, avatar prominente |
| `account-profile-card.tsx` | Avatar 80px, badge verificado |
| `account-empty.tsx` | Ilustración decorativa SVG |
| `ui.store.ts` | Estados: catalogSort, catalogPage |

---

## 8. Prerequisitos

- Ninguna dependencia nueva. Todo se implementa con las dependencias actuales:
  - Animaciones: `motion` (ya instalado) + `@keyframes` CSS.
  - Iconos: `lucide-react` (ya instalado).
  - UI primitives: `radix-ui` / `shadcn` (ya instalados).
  - Estado: `zustand` (ya instalado).
  - Data fetching: `@tanstack/react-query` + `axios` (ya instalados).

## 9. Orden de implementación sugerido

| Fase | Decisiones | Prioridad | Justificación |
|:---|:---|:---|:---|
| **1. Base visual** | D-11 (CSS global, shimmer, scroll-to-top) | Alta | Mejoras que impactan toda la tienda con poco riesgo |
| **2. Tarjetas y catálogo** | D-3 (product card), D-4 (sidebar/paginación) | Alta | Mayor impacto visual en la experiencia de browsing |
| **3. Header y navegación** | D-1 (header 2 niveles, mega-menú) | Alta | Primera impresión del visitante |
| **4. PDP** | D-5 (3 zonas, quantity, comprar ahora) | Alta | Página de decisión de compra |
| **5. Confianza** | D-6 (cart drawer), D-8 (footer), D-9 (checkout) | Media | Señales que reducen abandono |
| **6. Secciones promocionales** | D-2 (banners, countdown, marcas) | Media | Engagement y sensación de actividad |
| **7. Categorías y cuenta** | D-7 (categorías), D-10 (cuenta) | Media | Pulido de secciones secundarias |
| **8. Mobile** | D-12 (bottom nav, swipe, responsive) | Media-Alta | Mercado peruano es mobile-first |

---

## 10. Notas de compatibilidad

- Todas las mejoras son **retrocompatibles**: el storefront sigue funcionando
  durante la implementación incremental. Ningún cambio elimina funcionalidad
  existente.
- Dark mode: los componentes nuevos deben usar solo tokens `nx-*` y variables
  semánticas de shadcn, nunca colores hardcoded.
- Accesibilidad: todo componente nuevo debe cumplir los mismos criterios de
  AC16 y AC17 del spec 004 (focus ring, contraste, reduced-motion, target
  táctil ≥ 44px).
- Las imágenes y logos decorativos se pueden generar con la herramienta de
  generación de imágenes disponible, sin usar placeholders genéricos.

---

## 11. Trabajo futuro derivado

- **Wishlist real** (tabla `wishlists` + endpoints): la sección de favoritos
  de la cuenta y el corazón de la tarjeta están preparados visualmente.
- **Reseñas y rating** (tabla `reviews` + endpoints): el componente
  `StarRating` se conectará a datos reales.
- **Galería de imágenes** (tabla `product_images`): el slot del PDP está
  preparado para miniaturas.
- **Newsletter** (tabla `subscribers` + endpoint POST): el slot del footer
  está preparado.
- **Selector de ubicación real** (tabla `cities`): el badge de envío se
  conectará al backend.
- **Página de catálogo dedicada** (`/products`): con el sidebar de filtros ya
  implementado, extraerlo a una ruta propia es trivial.
