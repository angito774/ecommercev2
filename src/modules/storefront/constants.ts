import {
  Cpu,
  HardDrive,
  Keyboard,
  Laptop,
  type LucideIcon,
  Monitor,
  Package,
  Smartphone,
  Tablet,
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

// Navegación por anclas. Sin rutas: `/products` y la ficha de producto no existen
// todavía (spec 004, §3) y un enlace a "no encontrada" es peor que no tenerlo.
// La comparten el header, el menú móvil y el footer.
export const STOREFRONT_NAV = [
  { href: '#ofertas', label: 'Ofertas' },
  { href: '#categorias', label: 'Categorías' },
  { href: '#catalogo', label: 'Catálogo' },
  { href: '#ventajas', label: 'Ventajas' },
] as const;

export const ANNOUNCEMENTS = [
  'Garantía oficial de 2 años en todo el catálogo',
  'Devoluciones sin coste durante 30 días',
  'Stock real: lo que ves es lo que sale del almacén',
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
