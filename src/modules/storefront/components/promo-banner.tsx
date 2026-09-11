import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

import { PROMO_BANNER } from '../constants';

// Campaña decorativa declarada (spec 013, §5): no hay tabla de promociones y el
// texto vive en constantes, como el de `FeaturesSection`. Por eso no promete ningún
// porcentaje ni ninguna fecha —eso sí tendría que salir de la base—, solo repite las
// condiciones que la tienda ya cumple.
//
// Server Component: es marcado y un enlace.
export function PromoBanner() {
  return (
    <section className="py-[clamp(1.5rem,4vw,3rem)]">
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)]">
        {/* Todo el fondo va con tokens de acento, no con hexadecimales, para que se
            recoloree solo en oscuro (AC15). `text-nx-on-accent` es el par de
            contraste definido para fondos de acento y va a plena opacidad: un
            `/80` sobre `--primary` cae a 3.5:1 en claro. La jerarquía la dan el
            tamaño y el peso, como en `logistics-badge` y `product-card`.

            El degradado remata en `--nx-accent-hover` y no en el turquesa
            `--nx-accent-2`, y el orbe usa ese mismo token en vez de un blanco
            translúcido, porque el contraste hay que sostenerlo en TODO el ancho,
            no solo sobre `--primary` sólido: el bloque de texto llega hasta ~93%
            del ancho cuando el flex se envuelve. Con el turquesa el blanco caía a
            4.19:1 al 70% y a 3.16:1 al final, y un velo blanco al 10% lo bajaba a
            3.85:1 —los dos bajo el 4.5:1 de WCAG AA en tema claro—. En cambio
            `--nx-accent-hover` es el único acento que se aparta de `--primary`
            hacia el lado seguro en los dos temas (#5b4be8 en claro, más oscuro
            que el morado; #a79cff en oscuro, más claro), así que la mezcla es
            monótona creciente: de 4.56:1 a 5.81:1 en claro y de 6.14:1 a 8.32:1
            en oscuro, en cualquier punto del degradado y bajo cualquier opacidad
            del orbe. */}
        <div className="from-primary via-primary to-nx-accent-hover nx-shadow-accent relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-[26px] bg-gradient-to-r p-[clamp(1.5rem,4vw,2.75rem)]">
          <div
            className="bg-nx-accent-hover/70 pointer-events-none absolute -top-1/2 -right-[6%] aspect-square w-[min(420px,60vw)] rounded-full blur-3xl"
            aria-hidden
          />

          <div className="relative min-w-0">
            <span className="text-nx-on-accent mb-2.5 block text-xs font-semibold tracking-[0.15em] uppercase">
              {PROMO_BANNER.eyebrow}
            </span>
            <h2 className="text-nx-on-accent max-w-[22ch] text-[clamp(1.5rem,3.4vw,2.35rem)] leading-[1.1] font-semibold tracking-[-0.035em]">
              {PROMO_BANNER.title}
            </h2>
            <p className="text-nx-on-accent mt-3 max-w-[52ch] text-[15px] leading-relaxed">
              {PROMO_BANNER.body}
            </p>
          </div>

          {/* `Link` y no `<a>`: desde la ficha de producto esto es una navegación de
              cliente a la portada, no una recarga (spec 005, D-8). */}
          {/* `bg-background` y no `variant="secondary"`: sobre el degradado de acento
              el gris de `secondary` queda a media distancia en oscuro. El fondo del
              tema es blanco o casi negro y contrasta en los dos. */}
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90 relative h-12 shrink-0 rounded-full px-6"
          >
            <Link href={PROMO_BANNER.ctaHref}>
              {PROMO_BANNER.ctaLabel}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
