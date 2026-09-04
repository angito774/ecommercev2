import type { Metadata } from 'next';

import { APP_NAME } from '@/lib/constants';
import { CATALOG_PAGE_SIZE } from '@/modules/products/constants';
import type { CatalogProduct, CatalogProductListResponse } from '@/modules/products/types/catalog.types';
import { CatalogSection } from '@/modules/storefront/components/catalog-section';
import { CategoriesSection } from '@/modules/storefront/components/categories-section';
import { CategoryMarquee } from '@/modules/storefront/components/category-marquee';
import { DealsSection } from '@/modules/storefront/components/deals-section';
import { FeaturedSlider } from '@/modules/storefront/components/featured-slider';
import { FeaturesSection } from '@/modules/storefront/components/features-section';
import { Hero } from '@/modules/storefront/components/hero';
import { FEATURED_SLIDER_SIZE } from '@/modules/storefront/constants';
import * as productRepository from '@/server/repositories/product.repository';
import { getPublicCategories } from '@/server/services/catalog.service';

const TITLE = `${APP_NAME} — Tecnología con stock real y garantía oficial`;
const DESCRIPTION =
  'Portátiles, móviles, monitores, componentes y periféricos con precios en soles, stock real y garantía oficial de 2 años.';

// `catalog.data` viene ordenado 'featured' (descuento primero, spec 004 §6.1), así
// que puede repetir los mismos productos que ya trae `discounted`: se dedupea por
// id en vez de asumir que las dos listas son disjuntas.
function buildFeaturedSlides(
  discounted: CatalogProduct[],
  catalog: CatalogProduct[],
): CatalogProduct[] {
  const slides = [...discounted];
  const seen = new Set(slides.map((product) => product.id));

  for (const product of catalog) {
    if (slides.length >= FEATURED_SLIDER_SIZE) break;
    if (seen.has(product.id)) continue;
    slides.push(product);
    seen.add(product.id);
  }

  return slides;
}

export const metadata: Metadata = {
  // `absolute` para que no se le aplique la plantilla `%s | APP_NAME` del layout
  // raíz: en la portada duplicaría el nombre de la tienda.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    siteName: APP_NAME,
  },
};

export default async function HomePage() {
  // Lectura inicial por repositorio desde un Server Component: es la flecha que
  // docs/SETUP.md §4 reserva a la lectura inicial y al SEO. Sin ella la portada
  // llegaría vacía al rastreador y con un salto de layout (spec 004, D-5).
  //
  // Un solo `Promise.all`: las tres consultas son independientes y encadenarlas
  // convertiría el render en una cascada de tres viajes a Neon.
  const [catalog, categories, discounted] = await Promise.all([
    productRepository.findPublicMany({
      category: 'all',
      sort: 'featured',
      discounted: false,
      page: 1,
      pageSize: CATALOG_PAGE_SIZE,
    }),
    // Memoizada por request: el layout ya la pidió para el footer y esta llamada
    // reutiliza aquella promesa en vez de abrir una segunda consulta idéntica.
    getPublicCategories(),
    // `FEATURED_SLIDER_SIZE` y no 3: `DealsSection` solo usa los 3 primeros
    // (`rest.slice(0, 2)`), pero el slider puede necesitar hasta 5 si algún día hay
    // más de dos productos con precio anterior. Una sola consulta para los dos.
    productRepository.findPublicMany({
      category: 'all',
      sort: 'featured',
      discounted: true,
      page: 1,
      pageSize: FEATURED_SLIDER_SIZE,
    }),
  ]);

  // La misma respuesta que devolvería `GET /api/products` para estos parámetros.
  // Se le pasa al hook como `initialData` para que hidratar no repita la petición
  // (AC8); si la forma se separara del contrato, TypeScript lo diría aquí.
  const initialCatalog: CatalogProductListResponse = {
    data: catalog.data,
    meta: {
      page: 1,
      pageSize: CATALOG_PAGE_SIZE,
      total: catalog.total,
      totalPages: Math.max(1, Math.ceil(catalog.total / CATALOG_PAGE_SIZE)),
    },
  };

  const featuredSlides = buildFeaturedSlides(discounted.data, catalog.data);

  return (
    <>
      {/* Justo debajo del header (que pinta el layout) y antes del hero: lo primero
          que ve cualquier visitante, aprobado como preview antes de construirse. */}
      <FeaturedSlider products={featuredSlides} />
      <Hero
        featured={catalog.data[0] ?? null}
        categoryCount={categories.length}
        productCount={catalog.total}
      />
      <CategoryMarquee categories={categories} />
      {/* Se renderiza a sí misma como `null` si no hay ningún producto con precio
          anterior, así que la portada no queda con un hueco vacío (AC14). */}
      <DealsSection deals={discounted.data} />
      <CategoriesSection categories={categories} />
      <CatalogSection categories={categories} initialData={initialCatalog} />
      <FeaturesSection />
    </>
  );
}
