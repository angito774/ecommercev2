import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { formatPrice } from '@/modules/products/lib/price';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { STOCK_LABELS } from '../constants';
import { AddToCartButton } from './add-to-cart-button';
import { CountdownTimer } from './countdown-timer';
import { ProductMedia } from './product-media';
import { Reveal } from './reveal';
import { Eyebrow } from './section-heading';

// Con cuenta atrás desde el spec 013, que REVIERTE la decisión del spec 004, D-6
// («sin contador, porque no existe `discount_ends_at` y sería decoración que
// miente»). El motivo del cambio es una petición explícita del usuario
// (2026-09-10): quiere la sección tal como la propuso el documento 010, con el
// contador incluido.
//
// La objeción de aquel spec sigue en pie y por eso el elemento se declara
// decorativo en tres sitios —spec 013 §5, este comentario y la cabecera de
// `countdown-timer.tsx`— en vez de disimularse: el contador apunta a las 23:59 de
// hoy porque no hay ninguna fecha de caducidad en la base, no porque la haya. La
// urgencia que sí es dato real la sigue dando `stockLevel`, y se pinta debajo.
export function DealsSection({ deals }: { deals: CatalogProduct[] }) {
  // AC14: si nadie tiene precio anterior, la sección entera desaparece. No se
  // renderiza vacía ni con datos de relleno.
  if (deals.length === 0) return null;

  const [highlight, ...rest] = deals;
  const secondary = rest.slice(0, 2);

  return (
    // El margen de anclaje sale de `--nx-header-h`: con el header de dos filas, un
    // `scroll-mt-24` fijo dejaba el título de la sección por debajo de la cabecera.
    <section
      id="ofertas"
      className="scroll-mt-[calc(var(--nx-header-h)+1.5rem)] py-[clamp(3.75rem,8.5vw,7.25rem)]"
    >
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)]">
        <div className="mb-[clamp(2rem,4vw,3.25rem)] flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow>Ofertas</Eyebrow>
            <h2 className="text-[clamp(1.875rem,4.3vw,3.125rem)] font-semibold">
              Precios rebajados ahora
            </h2>
            <p className="text-muted-foreground mt-3.5 max-w-[56ch] text-[clamp(0.95rem,1.3vw,1.1rem)] leading-relaxed">
              Productos con precio anterior publicado. El descuento se calcula sobre el PVP que
              tenían, no sobre uno inventado.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <CountdownTimer />
            <Button asChild variant="outline" size="sm" className="border-nx-line h-11 rounded-full px-5">
              <a href="#catalogo">
                Ver todo el catálogo
                <ArrowRight className="size-4" aria-hidden />
              </a>
            </Button>
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[1.28fr_1fr]">
          <Reveal>
            <article className="border-border bg-card nx-shadow-md relative grid overflow-hidden rounded-[30px] border sm:grid-cols-2">
              <div className="nx-art-surface relative grid min-h-[340px] place-items-center p-7">
                <ProductMedia
                  imageUrl={highlight.imageUrl}
                  alt={highlight.name}
                  categorySlug={highlight.categorySlug}
                  sizes="(max-width: 640px) 90vw, 420px"
                  className="w-[86%]"
                />
              </div>

              <div className="flex flex-col gap-3.5 p-[clamp(1.4rem,2.6vw,2rem)]">
                <span className="bg-nx-hot w-fit rounded-full px-3 py-1 text-xs font-semibold text-[#0A0A0F]">
                  La mejor oferta
                </span>
                {/* Mismo enlace extendido que `ProductCard`: el ancla envuelve solo
                    el nombre y su pseudoelemento cubre la tarjeta (D-7). */}
                <h3 className="text-[clamp(1.5rem,2.6vw,2rem)] font-semibold">
                  <Link
                    href={`/products/${highlight.slug}`}
                    className="after:absolute after:inset-0 after:z-[1] after:content-['']"
                  >
                    {highlight.name}
                  </Link>
                </h3>
                {highlight.description ? (
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {highlight.description}
                  </p>
                ) : null}

                <p className="text-nx-faint text-xs tracking-[0.09em] uppercase">
                  {highlight.categoryName}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-nx-display text-3xl font-semibold tracking-[-0.03em]">
                      {formatPrice(highlight.priceCents)}
                    </span>
                    {/* La comprobación va inline y no a través de un booleano
                        auxiliar para que TypeScript estreche `compareAtPriceCents`
                        a `number` dentro de la rama. */}
                    {highlight.discountPercent !== null &&
                    highlight.compareAtPriceCents !== null ? (
                      <>
                        <span className="text-nx-faint text-[15px] line-through">
                          {formatPrice(highlight.compareAtPriceCents)}
                        </span>
                        <span className="bg-nx-sale rounded-full px-2.5 py-1 text-xs font-semibold text-white">
                          −{highlight.discountPercent} %
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="relative z-[2]">
                    <AddToCartButton product={highlight} variant="full" />
                  </div>
                </div>

                <StockSignal level={highlight.stockLevel} />
              </div>
            </article>
          </Reveal>

          <div className="grid gap-5">
            {secondary.map((deal, index) => (
              <Reveal key={deal.id} delay={0.06 * (index + 1)}>
                <article className="border-border bg-card hover:border-nx-line hover:nx-shadow-md relative grid grid-cols-[118px_1fr] items-center gap-4 rounded-[22px] border p-3.5 transition-[border-color,box-shadow]">
                  <div className="nx-art-surface relative grid aspect-square place-items-center rounded-2xl p-3">
                    <ProductMedia
                      imageUrl={deal.imageUrl}
                      alt={deal.name}
                      categorySlug={deal.categorySlug}
                      sizes="118px"
                      className="w-[88%]"
                    />
                    {/* AC13 pide los dos indicadores en toda tarjeta con descuento,
                        también en las secundarias. */}
                    {deal.discountPercent !== null && deal.compareAtPriceCents !== null ? (
                      <span className="bg-nx-sale pointer-events-none absolute top-1.5 left-1.5 z-[2] rounded-full px-2 py-0.5 text-[11px] font-semibold text-white">
                        −{deal.discountPercent} %
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0 pr-2">
                    <p className="text-nx-faint text-[11px] tracking-[0.09em] uppercase">
                      {deal.categoryName}
                    </p>
                    <h3 className="mt-1.5 mb-2.5 text-[17px] font-semibold">
                      <Link
                        href={`/products/${deal.slug}`}
                        className="after:absolute after:inset-0 after:z-[1] after:content-['']"
                      >
                        {deal.name}
                      </Link>
                    </h3>
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex items-baseline gap-2">
                        <span className="font-nx-display text-[17px] font-semibold">
                          {formatPrice(deal.priceCents)}
                        </span>
                        {deal.compareAtPriceCents !== null ? (
                          <span className="text-nx-faint text-[12.5px] line-through">
                            {formatPrice(deal.compareAtPriceCents)}
                          </span>
                        ) : null}
                      </div>
                      <div className="relative z-[2]">
                        <AddToCartButton product={deal} />
                      </div>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StockSignal({ level }: { level: CatalogProduct['stockLevel'] }) {
  if (level === 'in') return null;

  return (
    <p
      className={`text-[12.5px] font-medium ${level === 'out' ? 'text-muted-foreground' : 'text-nx-sale'}`}
    >
      {STOCK_LABELS[level]}
    </p>
  );
}
