import Image from 'next/image';

import type { CatalogCategory } from '@/modules/categories/types/catalog-category.types';

import { BRANDS_SHOWCASE, getBrandImage, getCategoryIcon } from '../constants';
import { CategoryJumpLink } from './category-jump-link';
import { Eyebrow } from './section-heading';

// Fila de «marcas» que en realidad son las categorías reales del catálogo con una
// foto de banco libre por slug (spec 013, §5): la tienda no tiene tabla de
// fabricantes y ningún producto guarda su marca, así que inventarlas sería afirmar
// un dato que no existe. Los créditos de cada foto están en
// `public/banners/CREDITS.md`.
//
// Server Component: la portada ya tiene las categorías leídas y este bloque no
// necesita ni estado ni efectos. El enlace sí es cliente —`CategoryJumpLink` deja
// el filtro puesto al aterrizar en `#catalogo`—, igual que en la rejilla de
// categorías y en el pie.
export function BrandsShowcase({ categories }: { categories: CatalogCategory[] }) {
  // Mismo criterio que `CategoriesSection`: sin categorías publicables la sección
  // desaparece en vez de dejar una fila en blanco.
  if (categories.length === 0) return null;

  return (
    <section className="py-[clamp(3rem,7vw,5.5rem)]">
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)]">
        <div className="mb-[clamp(1.5rem,3vw,2.5rem)]">
          <Eyebrow>{BRANDS_SHOWCASE.eyebrow}</Eyebrow>
          <h2 className="text-[clamp(1.5rem,3.2vw,2.25rem)] font-semibold tracking-[-0.03em]">
            {BRANDS_SHOWCASE.title}
          </h2>
        </div>

        {/* Márgenes negativos con el mismo `clamp` que el padding del contenedor:
            la fila sangra hasta el borde de la pantalla sin provocar scroll
            horizontal del documento, que es la técnica que ya usan los chips del
            catálogo (§10). */}
        <ul className="-mx-[clamp(1rem,4vw,2rem)] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[clamp(1rem,4vw,2rem)] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((category) => {
            const image = getBrandImage(category.slug);
            const Icon = getCategoryIcon(category.slug);

            return (
              <li
                key={category.id}
                className="w-[clamp(10rem,42vw,13.5rem)] shrink-0 snap-start"
              >
                <CategoryJumpLink
                  slug={category.slug}
                  className="nx-hover-lift border-border bg-card hover:border-primary block h-full overflow-hidden rounded-[22px] border"
                >
                  <span className="nx-art-surface relative block aspect-[4/3] overflow-hidden">
                    {image ? (
                      <Image
                        src={image}
                        // Decorativa: el nombre de la categoría ya viaja como texto
                        // justo debajo y repetirlo sería ruido para el lector.
                        alt=""
                        fill
                        sizes="(max-width: 640px) 42vw, 216px"
                        className="object-cover"
                      />
                    ) : (
                      // Sin foto para este slug: se degrada al icono de la categoría,
                      // el mismo respaldo que usa el resto de la tienda.
                      <span className="text-primary grid size-full place-items-center">
                        <Icon className="size-8" aria-hidden />
                      </span>
                    )}
                  </span>

                  <span className="block p-4">
                    <span className="font-nx-display block text-[15.5px] font-semibold tracking-[-0.02em]">
                      {category.name}
                    </span>
                    <span className="text-nx-faint mt-1 block text-xs tabular-nums">
                      {category.productCount}{' '}
                      {category.productCount === 1 ? 'producto' : 'productos'}
                    </span>
                  </span>
                </CategoryJumpLink>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
