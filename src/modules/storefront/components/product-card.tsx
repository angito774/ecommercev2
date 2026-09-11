import Link from 'next/link';

import { formatPrice } from '@/modules/products/lib/price';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { STOCK_LABELS } from '../constants';
import { AddToCartButton } from './add-to-cart-button';
import { LogisticsBadge } from './logistics-badge';
import { ProductMedia } from './product-media';
import { StarRating } from './star-rating';

// Decoración declarada: no hay tabla `reviews`, así que todas las tarjetas pintan
// el mismo valor. Es una constante con nombre y no un `5` suelto para que el día
// que exista la valoración real el sitio a cambiar sea evidente.
const DECORATIVE_RATING = 5;

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
  const soldOut = stockLevel === 'out';

  return (
    // `nx-hover-lift` aporta la elevación y la sombra; la transición de
    // `border-color` viaja en la misma utilidad, por eso ya no hay clase
    // `transition-*` aquí.
    // Bajo 400 px la tarjeta se tumba: dos columnas de 180 px dejaban el nombre del
    // producto en cuatro líneas y el precio partido. Es un cambio de clases aquí,
    // no una tarjeta nueva (D-12). A partir de 400 px vuelve la columna de siempre.
    <article className="nx-hover-lift border-border bg-card hover:border-nx-line group relative grid grid-cols-[104px_1fr] items-center overflow-hidden rounded-[22px] border min-[400px]:flex min-[400px]:flex-col min-[400px]:items-stretch">
      <div className="nx-art-surface relative grid aspect-square place-items-center overflow-hidden p-3 min-[400px]:p-6">
        <ProductMedia
          imageUrl={product.imageUrl}
          alt={product.name}
          categorySlug={product.categorySlug}
          priority={priority}
          // El primer tramo es el ancho real del arte en la tarjeta tumbada: sin él
          // el navegador seguiría descargando media pantalla de imagen para un
          // marco de 104 px.
          sizes="(max-width: 400px) 104px, (max-width: 720px) 50vw, (max-width: 1120px) 33vw, 280px"
          className="transition-transform duration-500 group-hover:scale-[1.07]"
        />

        {/* `pointer-events-none`: son etiquetas, no controles, y sin esto taparían
            el enlace extendido justo en la esquina donde se pintan. */}
        <div className="pointer-events-none absolute top-3 left-3 z-[2] flex gap-1.5">
          {/* El badge y el precio tachado son la misma condición: o están los dos
              o no está ninguno, nunca un descuento sin referencia (AC13). */}
          {hasDiscount ? (
            <span className="bg-nx-sale text-nx-on-accent rounded-full px-3 py-1 text-xs font-semibold">
              −{discountPercent} %
            </span>
          ) : null}
          {soldOut ? (
            <span className="bg-secondary text-muted-foreground rounded-full px-3 py-1 text-xs font-semibold">
              {STOCK_LABELS.out}
            </span>
          ) : null}
        </div>

        {/* Esquina derecha: la izquierda ya la ocupan el descuento y el agotado.
            Sin stock no se promete envío en 24 h. */}
        {/* Oculto en la tarjeta tumbada: «Envío 24h» mide más que los 104 px del
            marco y se montaría encima del badge de descuento. La promesa sigue
            estando en la ficha y en la banda de beneficios del pie. */}
        {soldOut ? null : (
          <div className="pointer-events-none absolute top-3 right-3 z-[2] hidden min-[400px]:block">
            <LogisticsBadge />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3.5 min-[400px]:p-4 min-[400px]:pb-4.5">
        {/* La categoría hace de marca: es el dato de fabricante más cercano que
            tiene el modelo. No se inventa un campo `brand` que no existe. */}
        <p className="text-foreground text-[11px] font-bold tracking-[0.09em] uppercase">
          {product.categoryName}
        </p>
        {/* Enlace extendido: el `<a>` envuelve solo el nombre —una única parada de
            tabulación con su texto como nombre accesible— y el pseudoelemento cubre
            la tarjeta entera para conservar el área de clic. Envolver la tarjeta en
            `<Link>` metería el botón de añadir dentro de un ancla: HTML inválido y
            un clic que navegaría además de añadir (spec 005, D-7; AC13, AC14). */}
        <h3 className="text-[16.5px] leading-snug tracking-[-0.025em]">
          <Link
            href={`/products/${product.slug}`}
            className="after:absolute after:inset-0 after:z-[1] after:content-['']"
          >
            {product.name}
          </Link>
        </h3>

        <StarRating value={DECORATIVE_RATING} />

        {stockLevel === 'low' ? (
          <p className="text-nx-sale text-xs font-medium">{STOCK_LABELS.low}</p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-2.5 pt-3">
          <div className="flex flex-col">
            {/* Jerarquía: el precio anterior arriba y pequeño, el actual abajo y
                mayor. Antes iban en la misma línea y el ojo tenía que decidir
                cuál de los dos números pagaba. */}
            {hasDiscount ? (
              <span className="text-nx-faint text-[13px] leading-tight line-through">
                {formatPrice(compareAtPriceCents)}
              </span>
            ) : null}
            <span
              className={`font-nx-display text-[1.375rem] leading-tight font-semibold tracking-[-0.03em] ${
                hasDiscount ? 'text-primary' : 'text-foreground'
              }`}
            >
              {formatPrice(product.priceCents)}
            </span>
          </div>
          {/* Elevado por encima del pseudoelemento del enlace: si no, el clic en el
              botón lo interceptaría el ancla y navegaría en vez de añadir (AC13). */}
          <div className="relative z-[2]">
            <AddToCartButton product={product} revealOnHover />
          </div>
        </div>
      </div>
    </article>
  );
}
