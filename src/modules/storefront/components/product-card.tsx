import { formatPrice } from '@/modules/products/lib/price';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { STOCK_LABELS } from '../constants';
import { AddToCartButton } from './add-to-cart-button';
import { ProductMedia } from './product-media';

type ProductCardProps = {
  product: CatalogProduct;
  // La primera fila de la rejilla entra en el viewport inicial y es candidata a
  // LCP: solo esas imágenes se marcan como prioritarias.
  priority?: boolean;
};

// Sin `use client`: la tarjeta es marcado y el único trozo interactivo es
// `AddToCartButton`. Cuando la renderiza `catalog-section` acaba en el bundle del
// cliente de todas formas, pero desde `deals-section` se queda en el servidor.
export function ProductCard({ product, priority }: ProductCardProps) {
  const { discountPercent, compareAtPriceCents, stockLevel } = product;
  const hasDiscount = discountPercent !== null && compareAtPriceCents !== null;

  return (
    <article className="border-border bg-card hover:border-nx-line hover:nx-shadow-lg group relative flex flex-col overflow-hidden rounded-[22px] border transition-[border-color,box-shadow] duration-300">
      <div className="nx-art-surface relative grid aspect-square place-items-center overflow-hidden p-6">
        <ProductMedia
          imageUrl={product.imageUrl}
          alt={product.name}
          categorySlug={product.categorySlug}
          priority={priority}
          sizes="(max-width: 720px) 50vw, (max-width: 1120px) 33vw, 280px"
          className="transition-transform duration-500 group-hover:scale-[1.07]"
        />

        <div className="absolute top-3 left-3 z-[2] flex gap-1.5">
          {/* El badge y el precio tachado son la misma condición: o están los dos
              o no está ninguno, nunca un descuento sin referencia (AC13). */}
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

      <div className="flex flex-1 flex-col gap-2 p-4 pb-4.5">
        <p className="text-nx-faint text-[11px] tracking-[0.09em] uppercase">
          {product.categoryName}
        </p>
        <h3 className="text-[16.5px] leading-snug tracking-[-0.025em]">{product.name}</h3>

        {stockLevel === 'low' ? (
          <p className="text-nx-sale text-xs font-medium">{STOCK_LABELS.low}</p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2.5 pt-3">
          <div className="flex items-baseline gap-2">
            <span className="font-nx-display text-xl font-semibold tracking-[-0.03em]">
              {formatPrice(product.priceCents)}
            </span>
            {hasDiscount ? (
              <span className="text-nx-faint text-[13.5px] line-through">
                {formatPrice(compareAtPriceCents)}
              </span>
            ) : null}
          </div>
          <AddToCartButton product={product} />
        </div>
      </div>
    </article>
  );
}
