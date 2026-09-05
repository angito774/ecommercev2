'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { STOREFRONT_NAV } from '../constants';
import { useUiStore } from '../store/ui.store';

export function MobileMenu() {
  const open = useUiStore((state) => state.menuOpen);
  const setMenuOpen = useUiStore((state) => state.setMenuOpen);

  return (
    <Sheet open={open} onOpenChange={setMenuOpen}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Menú</SheetTitle>
          <SheetDescription className="sr-only">
            Navegación principal de la tienda.
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
