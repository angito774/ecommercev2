'use client';

import type { ReactNode } from 'react';

import { useUiStore } from '../store/ui.store';

type CategoryJumpLinkProps = {
  slug: string;
  className?: string;
  children: ReactNode;
  'aria-hidden'?: boolean;
  tabIndex?: number;
};

// Enlaza al catálogo y además deja el filtro puesto. Sigue siendo un `<a>` con
// `href`: con JavaScript deshabilitado o antes de hidratar, el salto al ancla
// funciona igual y solo se pierde el preseleccionado.
export function CategoryJumpLink({ slug, className, children, ...rest }: CategoryJumpLinkProps) {
  const setCategoryFilter = useUiStore((state) => state.setCategoryFilter);

  return (
    <a href="#catalogo" className={className} onClick={() => setCategoryFilter(slug)} {...rest}>
      {children}
    </a>
  );
}
