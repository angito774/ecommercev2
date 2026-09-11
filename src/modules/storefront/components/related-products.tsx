import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { CarouselTrack } from './carousel-track';
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

        {/* `CarouselTrack` es un pass-through cliente: este archivo sigue siendo
            Server Component y las tarjetas —con su arte SVG de categoría— siguen
            saliendo en el HTML inicial, que es lo que sostiene el SEO de la ficha
            (spec 012, §8). Sigue sin haber `<Reveal>` por lo de siempre: un div
            intermedio rompería el estirado de las tarjetas a la misma altura. */}
        <CarouselTrack label={categoryName}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </CarouselTrack>
      </div>
    </section>
  );
}
