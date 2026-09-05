'use client';

import { Menu, Search, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/constants';
import { selectItemCount, useCartHydrated, useCartStore } from '@/modules/cart/store/cart.store';

import { STOREFRONT_NAV } from '../constants';
import { useUiStore } from '../store/ui.store';
import { BrandMark } from './brand-mark';
import { ThemeToggle } from './theme-toggle';

type StorefrontHeaderProps = {
  // El bloque de Clerk llega renderizado desde el layout servidor. Pasarlo como
  // slot mantiene `UserButton` fuera del bundle de este componente y conserva los
  // botones de sesión sin convertir el header en consumidor de Clerk (D-15, AC19).
  authSlot: ReactNode;
};

export function StorefrontHeader({ authSlot }: StorefrontHeaderProps) {
  const [stuck, setStuck] = useState(false);

  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
  const setCartOpen = useUiStore((state) => state.setCartOpen);
  const setMenuOpen = useUiStore((state) => state.setMenuOpen);
  const setSearchTrigger = useUiStore((state) => state.setSearchTrigger);

  // Hay dos disparadores de búsqueda —el ancho de escritorio y el icono de móvil—
  // y solo uno está visible en cada breakpoint. Se guardan los dos para poder
  // devolver el foco al que de verdad abrió el overlay (AC10).
  const desktopSearchRef = useRef<HTMLButtonElement>(null);
  const mobileSearchRef = useRef<HTMLButtonElement>(null);

  const openSearch = useCallback(
    (trigger?: HTMLElement | null) => {
      // Con `⌘K` no hay elemento pulsado, así que se elige el disparador que esté
      // visible: `offsetParent === null` delata al que el breakpoint ha ocultado, y
      // enfocar un elemento oculto no haría nada.
      const target =
        trigger ??
        [desktopSearchRef.current, mobileSearchRef.current].find(
          (element) => element !== null && element.offsetParent !== null,
        ) ??
        null;

      setSearchTrigger(target);
      setSearchOpen(true);
    },
    [setSearchOpen, setSearchTrigger],
  );

  // Suscripción al valor derivado, no al array de líneas: así el header no se
  // re-renderiza cuando cambia el precio o el nombre de una línea, solo cuando
  // cambia el número que pinta (regla `rerender-derived-state`).
  const itemCount = useCartStore(selectItemCount);
  const hydrated = useCartHydrated();

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    // `passive`: este listener nunca llama a preventDefault y sin la marca el
    // navegador tiene que esperar a ver si lo hace antes de desplazar.
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ⌘K se registra aquí y no en el diálogo porque el diálogo se carga en diferido:
  // si el atajo viviera dentro, no existiría hasta haberlo abierto con el ratón.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openSearch]);

  return (
    <header
      data-stuck={stuck}
      className="sticky top-0 z-50 transition-colors data-[stuck=true]:nx-glass-panel data-[stuck=true]:border-b"
    >
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center gap-3 px-[clamp(1rem,4vw,2rem)]">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-full"
          aria-label={`${APP_NAME}, inicio`}
        >
          <BrandMark />
          <span className="font-nx-display hidden text-lg font-bold tracking-[-0.04em] sm:block">
            {APP_NAME}
          </span>
        </Link>

        <nav aria-label="Principal" className="ml-3 hidden items-center gap-1 lg:flex">
          {/* `Link` y no `<a>`: desde la ficha esto es una navegación de cliente a
              la portada, que conserva el estado del catálogo; en la propia portada
              sigue siendo un salto dentro del documento (spec 005, D-8). */}
          {STOREFRONT_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:text-foreground hover:bg-secondary inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {/* En escritorio el disparador enseña el atajo; en móvil se reduce a un
              icono, pero sigue siendo el mismo botón con el mismo destino. */}
          <button
            ref={desktopSearchRef}
            type="button"
            onClick={(event) => openSearch(event.currentTarget)}
            className="border-border bg-card text-nx-faint hover:border-nx-line hover:text-muted-foreground hidden h-11 min-w-[250px] items-center gap-2.5 rounded-full border pr-2 pl-3.5 text-left text-sm transition-colors lg:flex"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">Buscar productos</span>
            <kbd className="bg-secondary border-border text-nx-faint rounded-md border px-1.5 py-1 text-[11px] font-semibold">
              ⌘K
            </kbd>
          </button>

          <Button
            ref={mobileSearchRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={(event) => openSearch(event.currentTarget)}
            className="text-muted-foreground hover:text-foreground size-11 shrink-0 rounded-full lg:hidden"
            aria-label="Buscar productos"
          >
            <Search className="size-5" aria-hidden />
          </Button>

          <ThemeToggle />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setCartOpen(true)}
            className="text-muted-foreground hover:text-foreground relative size-11 shrink-0 rounded-full"
            aria-label={
              hydrated && itemCount > 0
                ? `Abrir carrito, ${itemCount} artículos`
                : 'Abrir carrito'
            }
          >
            <ShoppingBag className="size-5" aria-hidden />
            {/* Hasta que `persist` rehidrata no se conoce el número real: pintarlo
                antes provocaría un mismatch de hidratación. */}
            {hydrated && itemCount > 0 ? (
              <span className="bg-primary text-primary-foreground absolute top-1 right-1 grid h-[19px] min-w-[19px] place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums">
                {itemCount}
              </span>
            ) : null}
          </Button>

          <div className="ml-1 flex items-center gap-2">{authSlot}</div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen(true)}
            className="text-muted-foreground hover:text-foreground size-11 shrink-0 rounded-full lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" aria-hidden />
          </Button>
        </div>
      </div>
    </header>
  );
}
