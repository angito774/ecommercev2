import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { HeroVisual } from './hero-visual';
import { Reveal } from './reveal';

type HeroProps = {
  // El producto que se enseña en la tarjeta flotante. Puede no haber ninguno si el
  // catálogo entero está desactivado, y entonces el hero se queda a una columna.
  featured: CatalogProduct | null;
  categoryCount: number;
  productCount: number;
};

// Las cifras de la fila de estadísticas salen de la base, no de un array
// decorativo: son las únicas dos que el proyecto puede afirmar de verdad. La
// tercera del diseño era una valoración media y no hay tabla de reseñas (§3).
export function Hero({ featured, categoryCount, productCount }: HeroProps) {
  return (
    <section className="relative overflow-hidden pt-[clamp(1.5rem,6vw,4rem)]">
      <div className="nx-orb nx-orb-a pointer-events-none absolute -top-[14%] -left-[8%] z-0 aspect-square w-[min(560px,72vw)]" />
      <div className="nx-orb nx-orb-b pointer-events-none absolute top-[14%] -right-[10%] z-0 aspect-square w-[min(480px,62vw)]" />
      <div className="nx-grid-bg pointer-events-none absolute inset-0 z-0" aria-hidden />

      <div className="relative z-[1] mx-auto grid w-full max-w-[1240px] items-center gap-[clamp(2rem,5vw,4rem)] px-[clamp(1rem,4vw,2rem)] py-[clamp(1.5rem,4vw,3rem)] pb-[clamp(3rem,7vw,5.5rem)] lg:grid-cols-[1.02fr_0.98fr]">
        <div>
          <Reveal>
            <span className="bg-nx-accent-soft text-primary mb-6 inline-flex h-8 items-center gap-2.5 rounded-full px-3.5 text-xs font-semibold">
              <span className="nx-pulse bg-nx-new relative size-[7px] shrink-0 rounded-full" />
              Catálogo actualizado a diario
            </span>
          </Reveal>

          <h1 className="mb-6 text-[clamp(2.5rem,6.6vw,4.75rem)] leading-[1.02] font-semibold tracking-[-0.042em]">
            <span className="block">Tecnología que</span>
            <span className="block">
              se <span className="nx-grad-text">adelanta</span> a ti
            </span>
          </h1>

          <Reveal>
            <p className="text-muted-foreground max-w-[56ch] text-[clamp(0.95rem,1.3vw,1.1rem)] leading-relaxed">
              Portátiles, móviles, componentes y periféricos seleccionados uno a uno. Stock
              real, precios en soles y garantía oficial de 2 años en todo el catálogo.
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="nx-shadow-accent h-12 rounded-full px-6">
                <a href="#catalogo">
                  Explorar catálogo
                  <ArrowRight className="size-4" aria-hidden />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-nx-line h-12 rounded-full px-6"
              >
                <a href="#categorias">Ver categorías</a>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.14}>
            <dl className="border-border mt-12 flex gap-[clamp(1.5rem,4vw,3rem)] border-t pt-8">
              <Stat value={productCount} label="productos publicados" />
              <Stat value={categoryCount} label="categorías" />
              <Stat value={24} label="h de envío" />
            </dl>
          </Reveal>
        </div>

        {featured ? <HeroVisual product={featured} /> : null}
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dt className="font-nx-display text-[clamp(1.6rem,3.2vw,2.25rem)] leading-none font-semibold tracking-[-0.04em] tabular-nums">
        {value}
      </dt>
      <dd className="text-nx-faint mt-1.5 text-[13px]">{label}</dd>
    </div>
  );
}
