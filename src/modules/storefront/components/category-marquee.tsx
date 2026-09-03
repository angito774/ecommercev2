import type { CatalogCategory } from '@/modules/categories/types/catalog-category.types';

import { CategoryJumpLink } from './category-jump-link';

// Server Component y CSS puro. Muestra las CATEGORÍAS reales en lugar de las marcas
// inventadas del diseño (APEX, NOVA…): publicarlas sería afirmar algo falso en la
// portada, y con categorías la banda decorativa pasa a ser navegación (D-20).
export function CategoryMarquee({ categories }: { categories: CatalogCategory[] }) {
  if (categories.length === 0) return null;

  return (
    <div className="border-border bg-nx-inset nx-fade-x relative z-[1] overflow-hidden border-y py-5">
      <div className="nx-marquee-track flex w-max gap-[clamp(2.5rem,7vw,5.25rem)]">
        {categories.map((category) => (
          <MarqueeLink key={category.id} category={category} />
        ))}
        {/* Segunda pasada para que la traslación del −50 % cierre sin costura. Es
            decoración duplicada: fuera del árbol de accesibilidad. */}
        {categories.map((category) => (
          <MarqueeLink key={`copia-${category.id}`} category={category} aria-hidden tabIndex={-1} />
        ))}
      </div>
    </div>
  );
}

function MarqueeLink({
  category,
  ...rest
}: {
  category: CatalogCategory;
  'aria-hidden'?: boolean;
  tabIndex?: number;
}) {
  return (
    <CategoryJumpLink
      slug={category.slug}
      className="font-nx-display text-nx-faint hover:text-primary inline-flex min-h-11 shrink-0 items-center text-[clamp(1.05rem,2vw,1.375rem)] font-semibold tracking-[0.16em] uppercase opacity-55 transition-colors hover:opacity-100"
      {...rest}
    >
      {category.name}
    </CategoryJumpLink>
  );
}
