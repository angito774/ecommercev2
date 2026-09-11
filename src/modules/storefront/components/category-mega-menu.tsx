'use client';

import { ChevronDown, LayoutGrid, TriangleAlert } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useCatalogCategories } from '@/modules/categories/hooks/use-catalog-categories';

import { getCategoryIcon } from '../constants';
import { CategoryJumpLink } from './category-jump-link';

// Cuántos esqueletos pinta el panel mientras llega la lista. Es el número de
// categorías sembradas: con menos, el panel crece de golpe al resolver.
const SKELETON_ROWS = 6;

// Mega-menú sobre `DropdownMenu` de shadcn y no sobre un panel a mano: Radix trae
// de serie la trampa de foco, el cierre con `Esc`, la navegación con flechas y la
// devolución del foco al disparador, que es la mitad de lo que pide AC10.
//
// Las categorías las lee el propio componente con `useCatalogCategories()` en vez
// de recibirlas por props: el header es cliente y vive en el layout, así que
// prop-drillearlas obligaría a un `await` en el layout —justo lo que el spec 004
// sacó de ahí para no bloquear la cabecera en Neon—. El hook comparte `staleTime`
// con el catálogo, así que la lista ya suele estar en caché.
export function CategoryMegaMenu() {
  const query = useCatalogCategories();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="text-foreground hover:bg-secondary inline-flex h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors">
        <LayoutGrid className="size-4" aria-hidden />
        Categorías
        <ChevronDown className="size-4 opacity-60" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={8} className="w-[30rem] p-2">
        {query.isPending ? (
          <div className="grid grid-cols-2 gap-1">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <Skeleton key={index} className="h-12 rounded-md" />
            ))}
          </div>
        ) : query.isError ? (
          // El error no se traga: si Neon o el endpoint fallan, el visitante ve por
          // qué el menú está vacío en vez de un panel en blanco.
          <p className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
            <TriangleAlert className="text-destructive size-4 shrink-0" aria-hidden />
            {query.error.message}
          </p>
        ) : query.data.data.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">Todavía no hay categorías.</p>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {query.data.data.map((category) => {
              const Icon = getCategoryIcon(category.slug);
              return (
                // `asChild`: el ítem tiene que ser el propio enlace, no un div con
                // un enlace dentro, o el teclado tendría dos paradas por categoría.
                // `CategoryJumpLink` deja el filtro puesto al aterrizar en
                // `#catalogo`, igual que en el pie y en las migas de la ficha.
                <DropdownMenuItem key={category.id} asChild>
                  <CategoryJumpLink
                    slug={category.slug}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2.5"
                  >
                    <span className="bg-secondary text-primary grid size-8 shrink-0 place-items-center rounded-full">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{category.name}</span>
                      <span className="text-nx-faint block text-xs tabular-nums">
                        {category.productCount} productos
                      </span>
                    </span>
                  </CategoryJumpLink>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
