import type { CatalogProductDetail } from '@/modules/products/types/catalog.types';

import { STOCK_LABELS } from '../constants';
import { DeliveryMethods } from './delivery-methods';
import { ProductBreadcrumb } from './product-breadcrumb';
import { ProductHighlights } from './product-highlights';
import { ProductMedia } from './product-media';
import { ProductPurchasePanel } from './product-purchase-panel';
import { ProductSpecList } from './product-spec-list';

// Server Component. Solo bajan al cliente `ProductMedia` (por su `onError`) y
// `ProductPurchasePanel` (por el store y el estado de cantidad); la descripción, los
// highlights, los métodos de entrega y la ficha técnica se quedan en el servidor,
// que es lo que sostiene el SEO y el JSON-LD de la página (spec 005, §10).
//
// Tres zonas a partir de 1024 px —medios, información y panel de compra—, dos entre
// 900 y 1024 px con el panel bajo la información, y una sola columna por debajo. El
// orden del DOM (medios → cabecera → panel → detalle) es el que quiere el móvil: la
// foto, de qué producto se trata y el precio con su CTA antes de la letra pequeña.
export function ProductDetail({ product }: { product: CatalogProductDetail }) {
  const { discountPercent, compareAtPriceCents, stockLevel } = product;
  const hasDiscount = discountPercent !== null && compareAtPriceCents !== null;

  return (
    <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)] pt-[clamp(0.5rem,2vw,1.25rem)] pb-[clamp(2.5rem,6vw,4rem)]">
      <ProductBreadcrumb
        categoryName={product.categoryName}
        categorySlug={product.categorySlug}
        productName={product.name}
      />

      <div className="mt-3 grid items-start gap-[clamp(1.75rem,4vw,3.25rem)] min-[900px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-cols-[minmax(0,6fr)_minmax(0,4fr)_minmax(0,3fr)]">
        <div className="min-[900px]:col-start-1 min-[900px]:row-start-1">
          <div className="nx-art-surface border-border nx-shadow-md relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[30px] border p-[clamp(1.25rem,3.5vw,3rem)]">
            {/* `priority` se conserva: esta imagen es el LCP de la ficha. El `sizes`
                sí se recalcula, porque la columna de medios pasa de 7/12 a 6/13 del
                ancho útil al abrirse la tercera zona (spec 012, §10). */}
            <ProductMedia
              imageUrl={product.imageUrl}
              alt={product.name}
              categorySlug={product.categorySlug}
              priority
              sizes="(max-width: 900px) 92vw, (max-width: 1024px) 58vw, 520px"
            />

            <div className="absolute top-4 left-4 flex gap-2">
              {hasDiscount ? (
                <span className="bg-nx-sale rounded-full px-3 py-1 text-xs font-semibold text-white">
                  −{discountPercent} %
                </span>
              ) : null}
              {stockLevel === 'out' ? (
                <span className="bg-secondary text-muted-foreground rounded-full px-3 py-1 text-xs font-semibold">
                  {STOCK_LABELS.out}
                </span>
              ) : null}
            </div>
          </div>

          {/* Aquí irá la tira de miniaturas cuando exista `product_images`. Hoy no
              hay más de una imagen por producto, así que no se deja un contenedor
              vacío ocupando sitio (spec 012, §11). */}
        </div>

        <div className="flex flex-col gap-4 min-[900px]:col-start-2 min-[900px]:row-start-1">
          <p className="text-nx-faint text-xs tracking-[0.15em] uppercase">
            {product.categoryName}
          </p>

          <h1 className="text-[clamp(1.75rem,4vw,2.6rem)] leading-[1.08] font-semibold tracking-[-0.035em]">
            {product.name}
          </h1>

          {product.description ? (
            <p className="text-muted-foreground max-w-[56ch] text-[15px] leading-relaxed">
              {product.description}
            </p>
          ) : null}
        </div>

        {/* El `sticky` solo existe en la zona de tres columnas: con dos, el panel va
            bajo la información y pegarlo no tendría recorrido. El `top` sale de
            `--nx-header-h` y no de un número copiado, porque el header de 011 cambia
            de alto en 1024 px (spec 012, §10). */}
        <div className="min-[900px]:col-start-2 min-[900px]:row-start-2 lg:sticky lg:top-[calc(var(--nx-header-h)+1rem)] lg:col-start-3 lg:row-span-2 lg:row-start-1">
          <ProductPurchasePanel product={product} />
        </div>

        <div className="flex flex-col gap-6 min-[900px]:col-start-1 min-[900px]:row-start-2 lg:col-span-2 lg:col-start-1 lg:row-start-2">
          <ProductHighlights specs={product.specs} />
          <DeliveryMethods />
          <ProductSpecList specs={product.specs} />
        </div>
      </div>
    </div>
  );
}
