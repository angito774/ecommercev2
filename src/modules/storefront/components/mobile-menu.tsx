'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useCatalogCategories } from '@/modules/categories/hooks/use-catalog-categories';

import { getCategoryIcon, STOREFRONT_NAV } from '../constants';
import { useUiStore } from '../store/ui.store';
import { CategoryJumpLink } from './category-jump-link';

// Cuántos esqueletos pinta la lista mientras llega: el número de categorías
// sembradas, para que el panel no crezca de golpe al resolver. Mismo criterio que el
// mega-menú de escritorio.
const SKELETON_ROWS = 6;

export function MobileMenu() {
  const open = useUiStore((state) => state.menuOpen);
  const setMenuOpen = useUiStore((state) => state.setMenuOpen);

  return (
    <Sheet open={open} onOpenChange={setMenuOpen}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Menú</SheetTitle>
          <SheetDescription className="sr-only">
            Navegación principal de la tienda y categorías del catálogo.
          </SheetDescription>
        </SheetHeader>

        <nav className="flex flex-col px-4" aria-label="Principal">
          {STOREFRONT_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              // El menú se cierra al elegir: dejarlo abierto taparía justo la
              // sección a la que se acaba de saltar.
              onClick={() => setMenuOpen(false)}
              className="font-nx-display border-border border-b py-4 text-[30px] font-semibold tracking-[-0.035em]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Las categorías las lee el propio sheet con `useCatalogCategories()` en vez
            de recibirlas por props: se monta desde `StorefrontOverlays`, que cuelga
            del layout, y prop-drillearlas obligaría a un `await` allí —justo lo que
            el spec 004 sacó del layout para no bloquear la cabecera en Neon—. Es el
            mismo hook y la misma clave de caché que el mega-menú de escritorio, así
            que la lista ya suele estar cargada.
            Con la barra inferior del spec 013, este panel ES la vista de categorías
            de móvil: el botón «Categorías» abre exactamente esto. */}
        <CategoryList onNavigate={() => setMenuOpen(false)} />

        <div className="mt-auto p-4">
          <Button
            asChild
            className="nx-shadow-accent h-12 w-full rounded-full"
            onClick={() => setMenuOpen(false)}
          >
            <Link href="/#catalogo">Ver el catálogo</Link>
          </Button>
          <p className="text-nx-faint mt-3.5 text-center text-[13px]">
            Envío en 24 h · Devoluciones en 30 días
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CategoryList({ onNavigate }: { onNavigate: () => void }) {
  const query = useCatalogCategories();

  return (
    <div className="px-4 pt-6">
      <h3 className="text-nx-faint mb-3 text-xs font-semibold tracking-[0.15em] uppercase">
        Categorías
      </h3>

      {query.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        // El error no se traga: si el endpoint falla, se dice por qué la lista está
        // vacía en vez de dejar un hueco mudo.
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
          {query.error.message}
        </p>
      ) : query.data.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay categorías.</p>
      ) : (
        <ul className="space-y-1">
          {query.data.data.map((category) => {
            const Icon = getCategoryIcon(category.slug);

            return (
              <li key={category.id}>
                {/* `CategoryJumpLink` deja el filtro puesto al aterrizar en
                    `#catalogo`, igual que en la rejilla, el pie y el mega-menú. */}
                <CategoryJumpLink
                  slug={category.slug}
                  onClick={onNavigate}
                  className="hover:bg-secondary flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 transition-colors"
                >
                  <span className="bg-nx-accent-soft text-primary grid size-9 shrink-0 place-items-center rounded-lg">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      {category.name}
                    </span>
                    <span className="text-nx-faint block text-xs tabular-nums">
                      {category.productCount}{' '}
                      {category.productCount === 1 ? 'producto' : 'productos'}
                    </span>
                  </span>
                </CategoryJumpLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
