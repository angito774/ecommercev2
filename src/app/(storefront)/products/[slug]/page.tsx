import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { APP_NAME, APP_URL } from '@/lib/constants';
import { RELATED_PRODUCTS_SIZE } from '@/modules/products/constants';
import { catalogSlugParamSchema } from '@/modules/products/schemas/catalog.schema';
import type { CatalogProductDetail } from '@/modules/products/types/catalog.types';
import { ProductDetail } from '@/modules/storefront/components/product-detail';
import { ProductJsonLd } from '@/modules/storefront/components/product-json-ld';
import { RelatedProducts } from '@/modules/storefront/components/related-products';
import * as productRepository from '@/server/repositories/product.repository';
import { getPublicProductBySlug } from '@/server/services/catalog.service';

type Props = PageProps<'/products/[slug]'>;

// Un slug que no cumple el patrón no llega nunca a la base: es la misma frontera
// que el 400 del Route Handler, solo que en una página el resultado correcto es un
// 404 (AC2).
async function readProduct(params: Props['params']): Promise<CatalogProductDetail | null> {
  const { slug } = await params;

  const parsed = catalogSlugParamSchema.safeParse(slug);
  if (!parsed.success) return null;

  // Memoizada por request: `generateMetadata` y el render comparten esta promesa y
  // la ficha se lee una sola vez por visita (spec 005, D-1).
  return getPublicProductBySlug(parsed.data);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await readProduct(params);

  // La página va a llamar a `notFound()`: no se anuncia un producto que no se
  // sirve, y el `noindex` que Next inyecta con el 404 lo remata.
  if (!product) return { title: 'Producto no encontrado' };

  const description =
    product.description ?? `${product.name} en ${product.categoryName}. Stock real y garantía oficial de 2 años.`;
  const url = `${APP_URL}/products/${product.slug}`;

  return {
    // Sin `absolute`: la plantilla del layout raíz añade el nombre de la tienda
    // detrás, y el título sigue empezando por el nombre real del producto (AC11).
    title: product.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: product.name,
      description,
      url,
      type: 'website',
      siteName: APP_NAME,
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const product = await readProduct(params);
  if (!product) notFound();

  // Relacionados con el `findPublicMany()` que ya existe: aplica el mismo filtro
  // invariante y ordena por `featured`. Se pide uno de más para poder descartar el
  // producto actual sin quedarse corto (spec 005, D-4).
  const related = await productRepository.findPublicMany({
    category: product.categorySlug,
    sort: 'featured',
    discounted: false,
    page: 1,
    pageSize: RELATED_PRODUCTS_SIZE + 1,
  });

  const relatedProducts = related.data
    .filter((candidate) => candidate.id !== product.id)
    .slice(0, RELATED_PRODUCTS_SIZE);

  return (
    <>
      <ProductJsonLd product={product} />
      <ProductDetail product={product} />
      <RelatedProducts products={relatedProducts} categoryName={product.categoryName} />
    </>
  );
}
