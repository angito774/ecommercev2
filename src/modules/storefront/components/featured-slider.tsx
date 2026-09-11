'use client';

import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { type PointerEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { formatPrice } from '@/modules/products/lib/price';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { FEATURED_SLIDER_AUTOPLAY_MS, STOCK_LABELS } from '../constants';
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from '../lib/motion';
import { AddToCartButton } from './add-to-cart-button';
import { ProductMedia } from './product-media';

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

// `useSyncExternalStore`, no `useReducedMotion()` de Motion: ese hook resuelve
// `matchMedia` de forma síncrona en el primer render del cliente, mientras que
// en el servidor no puede conocer la preferencia. Usar su valor crudo para
// decidir `transition`/`animation` inline hacía que el primer render del
// cliente no coincidiera con el HTML del servidor cuando el sistema operativo
// tiene activado el movimiento reducido, y React descartaba el nodo al
// hidratar. `useSyncExternalStore` resuelve exactamente este caso: obliga al
// primer render del cliente a usar `getServerSnapshot` (`false`, igual que el
// servidor) y solo aplica la preferencia real en un render posterior, ya fuera
// de la hidratación.
function useReducedMotion() {
  return useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion, () => false);
}

// Desplazamiento horizontal mínimo para contar como swipe. Por debajo, el gesto se
// trata como un toque y el clic sobre el enlace del slide sigue su curso.
const SWIPE_THRESHOLD_PX = 50;

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

  const goTo = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  // Pointer Events sobre el track existente, sin librería de gestos: AC17 prohíbe
  // dependencias nuevas y el `drag` de Motion obligaría a convertir el track en
  // `motion.div` y a reconciliar su transform con el `translateX` por índice que ya
  // está revisado (spec 013, §8).
  //
  // En un ref y no en estado: la X de partida no se pinta, así que guardarla en
  // estado provocaría un render por cada gesto sin cambiar nada en pantalla. Se lee
  // y se escribe solo desde manejadores, nunca durante el render.
  const swipeStartX = useRef<number | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeStartX.current = event.clientX;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStartX.current;
    swipeStartX.current = null;

    if (start === null) return;

    const delta = event.clientX - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;

    // El mismo `goTo` que las flechas: un solo camino para cambiar de slide.
    goTo(index + (delta < 0 ? 1 : -1));
  };

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
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        // Si el puntero se cancela —el navegador se queda el gesto para desplazar la
        // página— el punto de partida se descarta y no se cambia de slide.
        onPointerCancel={() => {
          swipeStartX.current = null;
        }}
        // `touch-action: pan-y`: el navegador conserva el scroll vertical de la
        // página y solo el horizontal llega como gesto nuestro (AC11).
        className="relative z-[1] flex touch-pan-y"
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

function Slide({ product, inert }: { product: CatalogProduct; inert: boolean }) {
  const hasDiscount = product.discountPercent !== null && product.compareAtPriceCents !== null;

  return (
    // El `article` se queda a ancho completo por la mecánica del carrusel
    // (`translateX(-index * 100%)` asume slides de 100%); el contenido de verdad se
    // acota dentro con el mismo `max-w-[1240px]` que usa cada sección de la
    // portada, para que el slider no sea la única pieza que llega borde a borde en
    // pantallas anchas.
    <article inert={inert} className="w-full shrink-0 px-[clamp(1rem,4vw,2rem)] py-[clamp(1.1rem,2.8vw,1.75rem)]">
      <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-6 sm:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col items-start gap-3">
          <span className="bg-nx-accent-soft text-primary inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3.5 pl-2.5 text-xs font-bold tracking-[0.02em] uppercase">
            <Sparkles className="size-3.5" aria-hidden />
            {hasDiscount ? 'La mejor oferta' : 'Destacado'}
          </span>

          <h2 className="max-w-[20ch] text-[clamp(1.2rem,2.1vw,1.6rem)] leading-[1.15] font-semibold tracking-[-0.02em]">
            {product.name}
          </h2>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-nx-display text-[clamp(1.2rem,2vw,1.45rem)] font-bold tabular-nums">
              {formatPrice(product.priceCents)}
            </span>
            {hasDiscount && product.compareAtPriceCents !== null ? (
              <>
                <span className="text-nx-faint text-sm line-through tabular-nums">
                  {formatPrice(product.compareAtPriceCents)}
                </span>
                <span className="bg-nx-sale rounded-full px-2.5 py-1 text-xs font-bold text-white">
                  −{product.discountPercent} %
                </span>
              </>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3">
            {/* El CTA lleva a la ficha del producto del slide, no al catálogo
                filtrado por su categoría: quien pulsa "Ver oferta" pregunta por
                *este* producto (spec 005, D-9). */}
            <Link
              href={`/products/${product.slug}`}
              className="bg-primary text-primary-foreground nx-shadow-accent inline-flex h-10 items-center gap-2 rounded-full px-4.5 text-sm font-semibold"
            >
              {hasDiscount ? 'Ver oferta' : 'Ver producto'}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <AddToCartButton product={product} variant="full" />
          </div>
        </div>

        {/* `mx-auto` centra el marco de la imagen dentro de su columna, y el ancho
            máximo evita que una foto 700x400 de proveedor domine el slide entero. */}
        <div className="nx-art-surface nx-shadow-md relative mx-auto aspect-[4/3] w-full max-w-[280px] overflow-hidden rounded-[20px] sm:max-w-[300px]">
          <ProductMedia
            imageUrl={product.imageUrl}
            alt={product.name}
            categorySlug={product.categorySlug}
            priority
            sizes="300px"
          />
          {product.stockLevel !== 'in' ? (
            <span className="absolute bottom-2.5 left-2.5 rounded-full bg-[rgb(10_10_15_/_62%)] px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
              {STOCK_LABELS[product.stockLevel]}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
