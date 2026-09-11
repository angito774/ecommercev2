import {
  Cpu,
  HardDrive,
  Keyboard,
  Laptop,
  type LucideIcon,
  Monitor,
  Package,
  ShieldCheck,
  Smartphone,
  Tablet,
  Truck,
} from 'lucide-react';

// El icono se indexa por SLUG de categoría y no por producto: la categoría sí es un
// dato real de cada fila, así que el mapa cubre el catálogo entero y los productos
// que se añadan mañana sin tocar código (spec 004, D-19). El arte SVG grande sigue
// el mismo criterio y vive en components/category-art.tsx, porque es JSX y este
// archivo no lo es.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  laptops: Laptop,
  smartphones: Smartphone,
  monitores: Monitor,
  perifericos: Keyboard,
  'componentes-de-pc': Cpu,
  almacenamiento: HardDrive,
  tablets: Tablet,
};

// Una categoría creada desde el panel no está en el mapa y aun así tiene que
// pintarse: el default es lo que evita que la rejilla se rompa por un slug nuevo.
const DEFAULT_CATEGORY_ICON = Package;

export function getCategoryIcon(slug: string): LucideIcon {
  return CATEGORY_ICONS[slug] ?? DEFAULT_CATEGORY_ICON;
}

// Los archivos que existen hoy en `public/brands/`, uno por slug de categoría. Se
// declaran en vez de construir la ruta a ciegas porque `BrandsShowcase` es Server
// Component y no puede degradar con `onError` como hace `ProductMedia`: la decisión
// tiene que tomarse antes de emitir el HTML. Una categoría creada mañana desde el
// panel no está en el conjunto y cae al icono, que es el mismo criterio de
// `getCategoryIcon()` (spec 013, §7.1).
const BRAND_IMAGE_SLUGS = new Set([
  'laptops',
  'smartphones',
  'monitores',
  'perifericos',
  'componentes-de-pc',
  'almacenamiento',
  'tablets',
]);

export function getBrandImage(slug: string): string | null {
  return BRAND_IMAGE_SLUGS.has(slug) ? `/brands/${slug}.webp` : null;
}

// Fondo opcional del hero. Se sirve desde `public/` y no desde `images.unsplash.com`
// para no atar el LCP de la portada a un host externo (spec 013, §8).
//
// El tipo se anota a mano como `string | null` en vez de dejar que TypeScript infiera
// el literal: el hero ramifica sobre esta constante y con el tipo estrecho la rama
// sin banner sería código inalcanzable para el compilador. Ponerla a `null` devuelve
// el hero de orbes sin tocar el componente.
export const HERO_BANNER: string | null = '/banners/hero.webp';

// Campaña decorativa declarada (spec 013, §5): no hay tabla de promociones detrás,
// así que el texto vive aquí como el de `FeaturesSection`. Nada de porcentajes ni de
// fechas: lo único que afirma son las dos condiciones que la tienda ya cumple y que
// `STORE_GUARANTEES` repite en la ficha.
export const PROMO_BANNER = {
  eyebrow: 'Tu próxima mejora',
  title: 'Arma el equipo que querías, pieza a pieza',
  body: 'Precios en soles, stock real y garantía oficial de 2 años. Sin letra pequeña y sin esperar a una fecha concreta.',
  ctaLabel: 'Ver el catálogo',
  ctaHref: '/#catalogo',
} as const;

export const BRANDS_SHOWCASE = {
  eyebrow: 'Lo que encontrarás',
  title: 'Cada categoría, con su propio mundo',
} as const;

// Anclas relativas a la raíz, no al documento actual. Con la ficha de producto ya
// en pie, `#catalogo` no existe en todas las páginas del storefront y esos enlaces
// se volvían mudos desde la ficha. `/#catalogo` sigue siendo navegación
// *same-document* en la portada —el navegador desplaza, no recarga (AC20)— y desde
// la ficha `next/link` lo resuelve como navegación de cliente, que es lo que
// conserva el estado del catálogo (spec 005, D-8).
//
// Sigue sin haber ruta `/products`: el catálogo vive en la sección de la portada.
// La navegación la comparten el header, el menú móvil y el footer.
export const STOREFRONT_NAV = [
  { href: '/#ofertas', label: 'Ofertas' },
  { href: '/#categorias', label: 'Categorías' },
  { href: '/#catalogo', label: 'Catálogo' },
  { href: '/#ventajas', label: 'Ventajas' },
] as const;

export const ANNOUNCEMENTS = [
  'Garantía oficial de 2 años en todo el catálogo',
  'Devoluciones sin coste durante 30 días',
  'Stock real: lo que ves es lo que sale del almacén',
] as const;

// Las dos condiciones que la tienda ya afirma en la portada y en la barra de avisos.
// Viven aquí, y no escritas dos veces, porque las pintan el panel de compra de la
// ficha y el fallback de `ProductHighlights` cuando el producto no tiene specs: dos
// copias del mismo texto acaban divergiendo en cuanto una se retoca (spec 012, §5).
export const STORE_GUARANTEES = [
  { icon: Truck, text: 'Envío en 24 h en pedidos antes de las 18:00' },
  { icon: ShieldCheck, text: 'Garantía oficial de 2 años' },
] as const;

// Umbral por debajo del cual `stockLevel` llega como `low`. Se duplica aquí solo
// como texto para la interfaz; la clasificación la hace el repositorio en SQL.
export const STOCK_LABELS = {
  out: 'Agotado',
  low: 'Últimas unidades',
  in: 'En stock',
} as const;

// Máximo de slides del carrusel de la portada: ofertas primero, completado con
// destacados. Con 12 productos en `catalog.data` (CATALOG_PAGE_SIZE) siempre hay
// de sobra para llegar a este número aunque haya que descartar duplicados.
export const FEATURED_SLIDER_SIZE = 5;

// Cada cuánto avanza solo el carrusel. También fija la duración de la barra de
// progreso del punto activo, así que ambas cosas quedan sincronizadas por
// construcción en vez de por dos números que alguien puede desalinear.
export const FEATURED_SLIDER_AUTOPLAY_MS = 4500;
