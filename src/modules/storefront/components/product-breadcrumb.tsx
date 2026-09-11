import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { CategoryJumpLink } from './category-jump-link';

type ProductBreadcrumbProps = {
  categoryName: string;
  categorySlug: string;
  productName: string;
};

// Píldora: el área de clic ya medía 44 px de alto, pero no se veía. Con el fondo al
// hover el objetivo táctil deja de ser invisible y la ruta se lee como navegación y
// no como texto suelto (spec 012, D-5).
const LINK_CLASS =
  'text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex min-h-11 items-center rounded-full px-2.5 transition-colors';

// Server Component salvo por `CategoryJumpLink`, que es cliente solo para dejar el
// filtro puesto al llegar al catálogo. El último escalón no es enlace: enlazar a la
// página en la que ya estás no lleva a ninguna parte.
export function ProductBreadcrumb({
  categoryName,
  categorySlug,
  productName,
}: ProductBreadcrumbProps) {
  return (
    <nav aria-label="Ruta de navegación" className="text-[13.5px]">
      {/* `-ml-2.5` compensa el padding de la primera píldora: sin él la ruta
          entera quedaría desalineada respecto al título de la ficha. */}
      <ol className="-ml-2.5 flex flex-wrap items-center gap-x-0.5">
        <li>
          <Link href="/" className={LINK_CLASS}>
            Inicio
          </Link>
        </li>
        <Separator />
        <li>
          <CategoryJumpLink slug={categorySlug} className={LINK_CLASS}>
            {categoryName}
          </CategoryJumpLink>
        </li>
        <Separator />
        <li className="text-foreground inline-flex min-h-11 min-w-0 items-center px-2.5 font-medium">
          <span aria-current="page" className="truncate">
            {productName}
          </span>
        </li>
      </ol>
    </nav>
  );
}

function Separator() {
  return (
    <li aria-hidden className="text-nx-faint flex items-center">
      <ChevronRight className="size-3.5" />
    </li>
  );
}
