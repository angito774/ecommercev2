'use client';

import { ShieldCheck, Truck } from 'lucide-react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import Link from 'next/link';
import type { PointerEvent } from 'react';

import { formatPrice } from '@/modules/products/lib/price';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { prefersReducedMotion } from '../lib/motion';
import { AddToCartButton } from './add-to-cart-button';
import { ProductMedia } from './product-media';

// Cliente porque el tilt depende de la posición del puntero, que es exactamente el
// caso que el spec reserva a Motion: lo que se puede hacer con `@keyframes` se hace
// en CSS, y aquí hace falta estado continuo (spec 004, D-4).
export function HeroVisual({ product }: { product: CatalogProduct }) {
  const rotateX = useSpring(useMotionValue(0), { stiffness: 220, damping: 22 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 220, damping: 22 });
  const transform = useMotionTemplate`perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    // La preferencia se consulta aquí y no en el render: `matchMedia` no existe en
    // el servidor y `useReducedMotion()` sí resuelve en el primer render del
    // cliente, así que ramificar el `style` con su valor rompía la hidratación.
    if (prefersReducedMotion()) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - bounds.left) / bounds.width - 0.5;
    const py = (event.clientY - bounds.top) / bounds.height - 0.5;
    rotateY.set(px * 10);
    rotateX.set(py * -10);
  };

  const reset = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  const hasDiscount = product.discountPercent !== null && product.compareAtPriceCents !== null;

  return (
    <div className="relative mx-auto w-full max-w-[520px] lg:max-w-none">
      <motion.div
        onPointerMove={onPointerMove}
        onPointerLeave={reset}
        // `transform` sobre el div contenedor, nunca sobre el `<svg>` del arte:
        // muchos navegadores no aceleran por hardware las transformaciones
        // aplicadas a un SVG (regla `rendering-animate-svg-wrapper`).
        style={{ transform }}
        className="border-border bg-card nx-shadow-lg relative overflow-hidden rounded-[30px] border p-3.5"
      >
        <div className="nx-art-surface relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[22px]">
          <ProductMedia
            imageUrl={product.imageUrl}
            alt={product.name}
            categorySlug={product.categorySlug}
            priority
            sizes="(max-width: 1120px) 90vw, 520px"
            className="w-[74%]"
          />
        </div>

        <div className="px-2 pt-4.5 pb-1.5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-nx-faint mb-1 truncate text-xs">{product.categoryName}</p>
              {/* Enlace extendido, el mismo patrón de `ProductCard`: el ancla es
                  solo el nombre y su pseudoelemento cubre la tarjeta (D-7). */}
              <h2 className="truncate text-[22px] font-semibold">
                <Link
                  href={`/products/${product.slug}`}
                  className="after:absolute after:inset-0 after:z-[1] after:content-['']"
                >
                  {product.name}
                </Link>
              </h2>
            </div>
            {hasDiscount ? (
              <span className="bg-nx-sale shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white">
                −{product.discountPercent} %
              </span>
            ) : null}
          </div>

          <div className="mt-4.5 flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-2">
              <span className="font-nx-display text-xl font-semibold tracking-[-0.03em]">
                {formatPrice(product.priceCents)}
              </span>
              {hasDiscount && product.compareAtPriceCents !== null ? (
                <span className="text-nx-faint text-[13.5px] line-through">
                  {formatPrice(product.compareAtPriceCents)}
                </span>
              ) : null}
            </div>
            <div className="relative z-[2]">
              <AddToCartButton product={product} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Decorativas: repiten información que ya está en las ventajas y en el
          badge de stock, así que se ocultan al lector de pantalla. */}
      <FloatCard className="top-[6%] -left-[6%]" icon={<Truck className="size-4" aria-hidden />}>
        <strong className="block text-[13.5px] leading-tight font-semibold">Envío en 24 h</strong>
        <span className="text-nx-faint block text-[11.5px]">Pedidos antes de las 18:00</span>
      </FloatCard>

      <FloatCard
        className="right-[-4%] bottom-[12%]"
        icon={<ShieldCheck className="size-4" aria-hidden />}
      >
        <strong className="block text-[13.5px] leading-tight font-semibold">2 años</strong>
        <span className="text-nx-faint block text-[11.5px]">Garantía oficial</span>
      </FloatCard>
    </div>
  );
}

function FloatCard({
  className,
  icon,
  children,
}: {
  className: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden
      // `pointer-events-none` además de `aria-hidden`: solapan el borde de la
      // tarjeta y, sin esto, interceptarían el enlace extendido a la ficha.
      className={`nx-glass-panel nx-shadow-md pointer-events-none absolute z-[2] flex items-center gap-2.5 rounded-2xl border px-4 py-3 ${className}`}
    >
      <span className="text-primary shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
