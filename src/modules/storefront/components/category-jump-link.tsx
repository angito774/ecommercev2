'use client';

import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';

import { useUiStore } from '../store/ui.store';

type CategoryJumpLinkProps = {
  slug: string;
  className?: string;
  children: ReactNode;
  // Lo inyecta quien envuelve este enlace con `asChild` —el `DropdownMenuItem` del
  // mega-menú lo usa para cerrar el panel—. Se declara explícito para poder
  // encadenarlo en vez de dejar que lo pise el spread.
  onClick?: MouseEventHandler<HTMLAnchorElement>;
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
export function CategoryJumpLink({
  slug,
  className,
  children,
  onClick,
  ...rest
}: CategoryJumpLinkProps) {
  const setCategoryFilter = useUiStore((state) => state.setCategoryFilter);

  return (
    <Link
      href="/#catalogo"
      className={className}
      {...rest}
      // El spread va ANTES y el `onClick` propio se compone a mano: cuando Radix
      // clona este enlace con `asChild` inyecta su propio `onClick`, y con el
      // spread al final ese manejador pisaba al del filtro —el mega-menú navegaba
      // a `#catalogo` conservando la categoría anterior.
      onClick={(event) => {
        setCategoryFilter(slug);
        onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}
