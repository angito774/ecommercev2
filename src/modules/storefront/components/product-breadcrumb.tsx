import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { CategoryJumpLink } from './category-jump-link';

type ProductBreadcrumbProps = {
  categoryName: string;
  categorySlug: string;
  productName: string;
};

const LINK_CLASS =
  'text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center transition-colors';

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
      <ol className="flex flex-wrap items-center gap-x-1.5">
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
        <li className="text-foreground inline-flex min-h-11 min-w-0 items-center font-medium">
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
