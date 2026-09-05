import { notFound } from 'next/navigation';

import { catalogSlugParamSchema } from '@/modules/products/schemas/catalog.schema';
import { getPublicProductBySlug } from '@/server/services/catalog.service';

// La comprobación de existencia vive en el layout y no solo en `page.tsx` porque es
// el único punto del segmento que queda POR ENCIMA del `<Suspense>` que abre
// `loading.tsx`: dentro de ese boundary el shell ya está listo, la respuesta empieza
// a emitirse y `notFound()` llega tarde para cambiar la línea de estado, que sale
// `200`. Aquí el render bloquea antes de emitir nada, así que el 404 es real (AC2,
// §12.2).
//
// La consulta no se duplica: `getPublicProductBySlug` está memoizada con `cache()`,
// así que `page.tsx` y `generateMetadata` reutilizan esta misma promesa (D-1).
export default async function ProductDetailLayout({
  children,
  params,
}: LayoutProps<'/products/[slug]'>) {
  const { slug } = await params;

  const parsed = catalogSlugParamSchema.safeParse(slug);
  if (!parsed.success) notFound();

  const product = await getPublicProductBySlug(parsed.data);
  if (!product) notFound();

  return children;
}
