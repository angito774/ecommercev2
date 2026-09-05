import { ShieldCheck, Truck } from 'lucide-react';

import { formatPrice } from '@/modules/products/lib/price';
import type { CatalogProductDetail } from '@/modules/products/types/catalog.types';

import { STOCK_LABELS } from '../constants';
import { AddToCartButton } from './add-to-cart-button';
import { ProductBreadcrumb } from './product-breadcrumb';
import { ProductMedia } from './product-media';
import { ProductSpecList } from './product-spec-list';

// Server Component. Solo bajan al cliente `ProductMedia` (por su `onError`) y
// `AddToCartButton` (por el store), y ambos reciben exactamente lo que ya consumían
// en la portada: nada del DTO viaja de más al navegador (spec 005, §10).
//
// Layout asimétrico —media a la izquierda, información a la derecha— porque la foto
// real del proveedor es apaisada y una columna estrecha la dejaría diminuta dentro
// del marco `object-contain`. Columna única bajo 900 px (D-14, AC21).
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

      <div className="mt-3 grid items-start gap-[clamp(1.75rem,4vw,3.25rem)] min-[900px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="nx-art-surface border-border nx-shadow-md relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[30px] border p-[clamp(1.25rem,3.5vw,3rem)]">
          <ProductMedia
            imageUrl={product.imageUrl}
            alt={product.name}
            categorySlug={product.categorySlug}
            priority
            sizes="(max-width: 900px) 92vw, 680px"
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

        <div className="flex flex-col gap-4">
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

          <div className="border-border mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-t pt-5">
            <span className="font-nx-display text-[clamp(1.9rem,4vw,2.5rem)] leading-none font-semibold tracking-[-0.04em] tabular-nums">
              {formatPrice(product.priceCents)}
            </span>
            {/* El precio tachado y el badge son la misma condición: o están los dos
                o no está ninguno, nunca un descuento sin referencia (AC8). */}
            {hasDiscount ? (
              <>
                <span className="text-nx-faint text-[15px] line-through tabular-nums">
                  {formatPrice(compareAtPriceCents)}
                </span>
                <span className="bg-nx-sale rounded-full px-2.5 py-1 text-xs font-semibold text-white">
                  −{discountPercent} %
                </span>
              </>
            ) : null}
          </div>

          <p
            className={`text-[13.5px] font-medium ${
              stockLevel === 'out'
                ? 'text-muted-foreground'
                : stockLevel === 'low'
                  ? 'text-nx-sale'
                  : 'text-nx-ok'
            }`}
          >
            {STOCK_LABELS[stockLevel]}
          </p>

          <div className="mt-1">
            <AddToCartButton product={product} variant="full" />
          </div>

          {/* Las dos condiciones que la tienda ya afirma en la portada y el pie, no
              promesas nuevas escritas para esta página. */}
          <ul className="text-muted-foreground mt-1 flex flex-col gap-2 text-[13.5px]">
            <li className="flex items-center gap-2.5">
              <Truck className="text-primary size-4 shrink-0" aria-hidden />
              Envío en 24 h en pedidos antes de las 18:00
            </li>
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="text-primary size-4 shrink-0" aria-hidden />
              Garantía oficial de 2 años
            </li>
          </ul>

          <ProductSpecList specs={product.specs} />
        </div>
      </div>
    </div>
  );
}
