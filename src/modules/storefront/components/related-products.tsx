import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { ProductCard } from './product-card';
import { Eyebrow } from './section-heading';

type RelatedProductsProps = {
  // Ya leídos y filtrados por la página: este componente solo pinta la lista que
  // recibe, igual que `FeaturedSlider` con sus slides.
  products: CatalogProduct[];
  categoryName: string;
};

export function RelatedProducts({ products, categoryName }: RelatedProductsProps) {
  // Sin relacionados la sección desaparece, no queda un encabezado sobre una
  // rejilla vacía (AC12).
  if (products.length === 0) return null;

  return (
    <section
      aria-labelledby="relacionados"
      className="border-border border-t py-[clamp(2.5rem,6vw,4.5rem)]"
    >
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)]">
        <div className="mb-[clamp(1.5rem,3vw,2.5rem)]">
          <Eyebrow>Misma categoría</Eyebrow>
          <h2
            id="relacionados"
            className="text-[clamp(1.5rem,3.2vw,2.25rem)] font-semibold tracking-[-0.03em]"
          >
            Más en {categoryName}
          </h2>
        </div>

        {/* Sin `<Reveal>`: envolver cada tarjeta añadiría un div entre la celda de
            la rejilla y el `article`, y las tarjetas dejarían de estirarse a la
            misma altura. La rejilla es idéntica a la del catálogo (D-15). */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:gap-5">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
