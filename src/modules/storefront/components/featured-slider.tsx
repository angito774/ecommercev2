'use client';

import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';

import { formatPrice } from '@/modules/products/lib/price';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { FEATURED_SLIDER_AUTOPLAY_MS, STOCK_LABELS } from '../constants';
import { useUiStore } from '../store/ui.store';
import { AddToCartButton } from './add-to-cart-button';
import { ProductMedia } from './product-media';

type FeaturedSliderProps = {
  // Ya viene deduplicado y acotado a `FEATURED_SLIDER_SIZE` desde `page.tsx`: este
  // componente solo pinta la lista que recibe.
  products: CatalogProduct[];
};

export function FeaturedSlider({ products }: FeaturedSliderProps) {
  const count = products.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const setCategoryFilter = useUiStore((state) => state.setCategoryFilter);

  const goTo = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  // Autoplay en `setInterval`, no en Motion: es un avance por temporizador, sin
  // estado continuo de puntero ni scroll que justifique la librería (spec 004,
  // D-4). Se detiene con reduced-motion, con menos de dos slides, o en pausa.
  useEffect(() => {
    if (reduced || paused || count <= 1) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), FEATURED_SLIDER_AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [reduced, paused, count]);

  // AC14 del mismo espíritu: si no hay nada que destacar, la sección desaparece en
  // vez de quedar vacía o con relleno inventado.
  if (count === 0) return null;

  const jumpToCatalog = (categorySlug: string) => {
    setCategoryFilter(categorySlug);
    document.getElementById('catalogo')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Ofertas y productos destacados"
      className="border-border relative overflow-hidden border-b"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="nx-orb nx-orb-a pointer-events-none absolute -top-[60%] -left-[8%] z-0 aspect-square w-[min(420px,58vw)]" />
      <div className="nx-orb nx-orb-b pointer-events-none absolute -right-[6%] -bottom-[70%] z-0 aspect-square w-[min(380px,52vw)]" />

      <div
        className="relative z-[1] flex"
        style={{
          transform: `translateX(-${index * 100}%)`,
          transition: reduced ? 'none' : 'transform 550ms cubic-bezier(.22,1,.36,1)',
        }}
      >
        {products.map((product, slideIndex) => (
          <Slide
            key={product.id}
            product={product}
            // Las slides fuera de vista siguen en el DOM (la transición las
            // desliza), así que `inert` les quita el foco y la lectura de pantalla
            // en vez de dejar controles invisibles pero alcanzables con Tab.
            inert={slideIndex !== index}
            onCta={() => jumpToCatalog(product.categorySlug)}
          />
        ))}
      </div>

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            aria-label="Oferta anterior"
            className="border-border bg-card hover:text-primary hover:bg-nx-accent-soft absolute top-1/2 left-3 z-[2] size-11 -translate-y-1/2 rounded-full border shadow-sm"
          >
            <ArrowLeft className="mx-auto size-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label="Siguiente oferta"
            className="border-border bg-card hover:text-primary hover:bg-nx-accent-soft absolute top-1/2 right-3 z-[2] size-11 -translate-y-1/2 rounded-full border shadow-sm"
          >
            <ArrowRight className="mx-auto size-[18px]" aria-hidden />
          </button>

          <div
            role="tablist"
            aria-label="Ir a una oferta"
            className="relative z-[1] flex items-center justify-center gap-2.5 pb-5"
          >
            {products.map((product, dotIndex) => (
              <button
                key={product.id}
                type="button"
                role="tab"
                aria-selected={dotIndex === index}
                aria-label={`Ir a la oferta ${dotIndex + 1} de ${count}: ${product.name}`}
                onClick={() => goTo(dotIndex)}
                className="bg-border relative h-1 w-6 overflow-hidden rounded-full"
              >
                {dotIndex === index ? (
                  // `key` con el índice reinicia la animación cada vez que el
                  // carrusel avanza o alguien elige un punto a mano.
                  <span
                    key={index}
                    className="bg-primary absolute inset-y-0 left-0"
                    style={
                      reduced || paused
                        ? { width: '100%' }
                        : { animation: `nx-slider-fill ${FEATURED_SLIDER_AUTOPLAY_MS}ms linear forwards` }
                    }
                  />
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function Slide({
  product,
  inert,
  onCta,
}: {
  product: CatalogProduct;
  inert: boolean;
  onCta: () => void;
}) {
  const hasDiscount = product.discountPercent !== null && product.compareAtPriceCents !== null;

  return (
    <article
      inert={inert}
      className="grid w-full shrink-0 grid-cols-1 items-center gap-8 px-[clamp(1.25rem,4vw,2.5rem)] py-[clamp(1.75rem,4.5vw,2.75rem)] lg:grid-cols-[1.1fr_1fr]"
    >
      <div className="flex flex-col items-start gap-3.5">
        <span className="bg-nx-accent-soft text-primary inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3.5 pl-2.5 text-xs font-bold tracking-[0.02em] uppercase">
          <Sparkles className="size-3.5" aria-hidden />
          {hasDiscount ? 'La mejor oferta' : 'Destacado'}
        </span>

        <h2 className="max-w-[20ch] text-[clamp(1.4rem,2.7vw,2rem)] leading-[1.1] font-semibold tracking-[-0.02em]">
          {product.name}
        </h2>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-nx-display text-[clamp(1.4rem,2.6vw,1.85rem)] font-bold tabular-nums">
            {formatPrice(product.priceCents)}
          </span>
          {hasDiscount && product.compareAtPriceCents !== null ? (
            <>
              <span className="text-nx-faint text-base line-through tabular-nums">
                {formatPrice(product.compareAtPriceCents)}
              </span>
              <span className="bg-nx-sale rounded-full px-2.5 py-1 text-xs font-bold text-white">
                −{product.discountPercent} %
              </span>
            </>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onCta}
            className="bg-primary text-primary-foreground nx-shadow-accent inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold"
          >
            {hasDiscount ? 'Ver oferta' : 'Ver producto'}
            <ArrowRight className="size-4" aria-hidden />
          </button>
          <AddToCartButton product={product} variant="full" />
        </div>
      </div>

      <div className="nx-art-surface nx-shadow-md relative aspect-[4/3] overflow-hidden rounded-[24px]">
        <ProductMedia
          imageUrl={product.imageUrl}
          alt={product.name}
          categorySlug={product.categorySlug}
          priority
          sizes="(max-width: 1024px) 90vw, 560px"
        />
        {product.stockLevel !== 'in' ? (
          <span className="absolute bottom-3 left-3 rounded-full bg-[rgb(10_10_15_/_62%)] px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            {STOCK_LABELS[product.stockLevel]}
          </span>
        ) : null}
      </div>
    </article>
  );
}
