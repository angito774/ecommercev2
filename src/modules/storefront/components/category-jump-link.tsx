'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { useUiStore } from '../store/ui.store';

type CategoryJumpLinkProps = {
  slug: string;
  className?: string;
  children: ReactNode;
  'aria-hidden'?: boolean;
  tabIndex?: number;
};

// Enlaza al catálogo y además deja el filtro puesto. `href` real: con JavaScript
// deshabilitado o antes de hidratar, el salto sigue funcionando y solo se pierde el
// preseleccionado.
//
// `/#catalogo` y `Link`, no `#catalogo` y `<a>`: este componente lo usan el pie y
// las migas de la ficha, y desde ahí `#catalogo` no existe en el documento. En la
// portada `Link` a un ancla del mismo documento sigue desplazando sin recargar
// (AC20); desde la ficha es navegación de cliente, que es lo que conserva el filtro
// recién puesto en Zustand (spec 005, D-8).
export function CategoryJumpLink({ slug, className, children, ...rest }: CategoryJumpLinkProps) {
  const setCategoryFilter = useUiStore((state) => state.setCategoryFilter);

  return (
    <Link href="/#catalogo" className={className} onClick={() => setCategoryFilter(slug)} {...rest}>
      {children}
    </Link>
  );
}
