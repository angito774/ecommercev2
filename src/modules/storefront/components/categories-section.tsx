import type { CatalogCategory } from '@/modules/categories/types/catalog-category.types';

import { getCategoryIcon } from '../constants';
import { CategoryJumpLink } from './category-jump-link';
import { Reveal } from './reveal';
import { Eyebrow } from './section-heading';

export function CategoriesSection({ categories }: { categories: CatalogCategory[] }) {
  // El endpoint ya excluye las categorías sin producto publicable, así que llegar
  // aquí con la lista vacía significa catálogo entero desactivado: se oculta la
  // sección en lugar de enseñar una rejilla en blanco (§10).
  if (categories.length === 0) return null;

  return (
    <section
      id="categorias"
      // Solo el respiro: el alto del header ya lo descuenta el `scroll-padding-top`
      // de `html` en `globals.css`.
      className="border-border bg-nx-inset scroll-mt-6 border-y py-[clamp(3.75rem,8.5vw,7.25rem)]"
    >
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)]">
        <div className="mb-[clamp(2rem,4vw,3.25rem)]">
          <Eyebrow>Explora</Eyebrow>
          <h2 className="text-[clamp(1.875rem,4.3vw,3.125rem)] font-semibold">Categorías</h2>
        </div>

        {/* Bajo 640 px la rejilla se convierte en una fila con scroll-snap: seis
            tarjetas a dos columnas obligaban a tres pantallas de scroll vertical
            para ver la puerta de entrada al catálogo (D-7).
            Los márgenes negativos usan el mismo `clamp` que el padding del
            contenedor, que es la técnica de los chips del catálogo: la fila sangra
            hasta el borde sin romper el `overflow-x: hidden` del body a 390 px
            (§10). El ancho de cada tarjeta se fija con `[&>*]` sobre los `Reveal`,
            para que `CategoryJumpLink` no tenga que saber si está en fila o en
            rejilla. */}
        <div className="-mx-[clamp(1rem,4vw,2rem)] flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-[clamp(1rem,4vw,2rem)] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:w-[140px] [&>*]:shrink-0 [&>*]:snap-start sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-6 lg:gap-3.5 sm:[&>*]:w-auto">
          {categories.map((category, index) => {
            const Icon = getCategoryIcon(category.slug);

            return (
              <Reveal key={category.id} delay={Math.min(index, 6) * 0.05}>
                <CategoryJumpLink
                  slug={category.slug}
                  className="nx-hover-lift border-border bg-card hover:border-primary group relative flex h-full flex-col justify-between gap-5 overflow-hidden rounded-[22px] border p-4 lg:gap-6.5 lg:p-5"
                >
                  {/* Pill del conteo en la esquina: sale del bloque de texto para
                      que el nombre de la categoría quede solo en su línea. El
                      número es el `count` agrupado del repositorio, no una
                      estimación de la interfaz; el `sr-only` le da la unidad, que
                      en el pill se pierde. */}
                  <span className="bg-secondary text-muted-foreground absolute top-3 right-3 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums">
                    {category.productCount}
                    <span className="sr-only">
                      {category.productCount === 1 ? ' producto' : ' productos'}
                    </span>
                  </span>

                  {/* El degradado va sobre `--nx-accent-soft`, que ya es semitransparente
                      y se recolorea con el tema (AC15).
                      La escala del icono se declara dentro de una sola media query
                      —`hover: hover` y `prefers-reduced-motion: no-preference`— en
                      vez de apilar `motion-reduce:` sobre `group-hover:`: así no hay
                      dos reglas de la misma especificidad compitiendo por el orden
                      de salida, y en táctil el `:hover` pegado tras el toque no deja
                      el icono agrandado (AC5, AC16). */}
                  <span className="bg-nx-accent-soft text-primary relative grid size-16 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(145deg,var(--nx-accent-soft)_0%,transparent_100%)] transition-transform duration-300 ease-out [@media(hover:hover)_and_(prefers-reduced-motion:no-preference)]:group-hover:scale-[1.15]">
                    <Icon className="size-7" aria-hidden />
                  </span>

                  <span className="font-nx-display relative block text-[15.5px] font-semibold tracking-[-0.02em]">
                    {category.name}
                  </span>
                </CategoryJumpLink>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
