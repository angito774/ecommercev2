'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

// Cuántos números se pintan a la vez. Con más, la fila desborda a 390 px y el
// catálogo acaba con scroll horizontal, que AC15 prohíbe.
const PAGE_WINDOW = 5;

// Ventana centrada en la página actual y recortada contra los extremos, para que
// un catálogo de 40 páginas no pinte 40 botones.
function buildPageWindow(page: number, totalPages: number): number[] {
  if (totalPages <= PAGE_WINDOW) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const half = Math.floor(PAGE_WINDOW / 2);
  const start = Math.min(Math.max(1, page - half), totalPages - PAGE_WINDOW + 1);

  return Array.from({ length: PAGE_WINDOW }, (_, index) => start + index);
}

type CatalogPaginationProps = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
};

export function CatalogPagination({ page, totalPages, onChange }: CatalogPaginationProps) {
  // Una sola página no es una navegación: pintar los controles deshabilitados
  // solo añade ruido debajo de la rejilla.
  if (totalPages <= 1) return null;

  const pages = buildPageWindow(page, totalPages);

  return (
    <nav
      aria-label="Paginación del catálogo"
      className="mt-10 flex flex-wrap items-center justify-center gap-2"
    >
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="h-11 rounded-full px-4"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Anterior
      </Button>

      {pages.map((item) => (
        <Button
          key={item}
          type="button"
          variant={item === page ? 'default' : 'outline'}
          onClick={() => onChange(item)}
          // `aria-current="page"` y no `aria-selected`: es el patrón de una
          // navegación, no el de una pestaña. Es lo único que distingue la página
          // actual para quien no ve el cambio de color.
          aria-current={item === page ? 'page' : undefined}
          aria-label={`Página ${item}`}
          className="size-11 rounded-full tabular-nums"
        >
          {item}
        </Button>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="h-11 rounded-full px-4"
      >
        Siguiente
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </nav>
  );
}
