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
      className="border-border bg-nx-inset scroll-mt-24 border-y py-[clamp(3.75rem,8.5vw,7.25rem)]"
    >
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)]">
        <div className="mb-[clamp(2rem,4vw,3.25rem)]">
          <Eyebrow>Explora</Eyebrow>
          <h2 className="text-[clamp(1.875rem,4.3vw,3.125rem)] font-semibold">Categorías</h2>
        </div>

        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6 lg:gap-3.5">
          {categories.map((category, index) => {
            const Icon = getCategoryIcon(category.slug);

            return (
              <Reveal key={category.id} delay={Math.min(index, 6) * 0.05}>
                <CategoryJumpLink
                  slug={category.slug}
                  className="border-border bg-card hover:border-primary hover:nx-shadow-md group relative flex h-full flex-col justify-between gap-5 overflow-hidden rounded-[22px] border p-4 transition-[border-color,box-shadow] lg:gap-6.5 lg:p-5"
                >
                  <span className="bg-nx-accent-soft text-primary relative grid size-[42px] shrink-0 place-items-center rounded-xl">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="relative">
                    <span className="font-nx-display block text-[15.5px] font-semibold tracking-[-0.02em]">
                      {category.name}
                    </span>
                    {/* El recuento es el que devuelve el `count` agrupado del
                        repositorio, no una estimación de la interfaz. */}
                    <span className="text-nx-faint mt-1 block text-xs">
                      {category.productCount}{' '}
                      {category.productCount === 1 ? 'producto' : 'productos'}
                    </span>
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
