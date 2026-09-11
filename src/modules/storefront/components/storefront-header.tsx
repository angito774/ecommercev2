'use client';

import { Menu, Search, ShoppingBag } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/constants';
import { selectItemCount, useCartHydrated, useCartStore } from '@/modules/cart/store/cart.store';

import { STOREFRONT_NAV } from '../constants';
import { useUiStore } from '../store/ui.store';
import { AnimatedSearchPlaceholder } from './animated-search-placeholder';
import { BrandMark } from './brand-mark';
import { CategoryMegaMenu } from './category-mega-menu';
import { DeliveryLocationBadge } from './delivery-location-badge';
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
      //
      // Sigue funcionando con el header en dos filas: el criterio no es la fila en
      // la que vive el botón sino si está renderizado, y cada disparador conserva
      // su `hidden lg:flex` / `lg:hidden` de antes.
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
      {/* Búsqueda persistente de móvil: aparece bajo el header en cuanto se hace
          scroll, para que la acción principal de la tienda no obligue a volver
          arriba (AC14).

          `absolute top-full` y no una tercera fila en el flujo: el header es
          `sticky` y su hueco sigue reservado al principio del documento, así que
          crecer mientras está pegado empujaría la página entera 2.75 rem hacia
          abajo de golpe. Flotando bajo la cabecera no cambia ninguna altura y
          `--nx-header-h` sigue siendo válida para los anclas.

          No es un `<input>` nuevo: abre el mismo overlay `cmdk` con el mismo `⌘K` y
          la misma devolución de foco, así que sigue habiendo un solo buscador
          (spec 004, D-12). */}
      {stuck ? (
        <div className="nx-glass-panel border-border absolute inset-x-0 top-full border-b px-[clamp(1rem,4vw,2rem)] py-2 md:hidden">
          <button
            type="button"
            onClick={(event) => openSearch(event.currentTarget)}
            className="border-nx-line bg-card text-muted-foreground flex h-11 w-full items-center gap-2.5 rounded-full border px-4 text-sm"
          >
            <Search className="text-primary size-4 shrink-0" aria-hidden />
            Buscar en el catálogo
          </button>
        </div>
      ) : null}
      {/* Fila 1: identidad, búsqueda y acciones de sesión. Es la única que existe
          bajo 1024 px, así que conserva la altura y el orden de siempre. */}
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

        {/* La búsqueda deja de ser un control más de la derecha y pasa a ocupar el
            centro de la fila: es la acción principal de una tienda con catálogo.
            Sigue siendo el mismo `<button>` que abre el overlay `cmdk`, con el
            mismo `⌘K` y la misma devolución de foco (spec 004, AC10). */}
        <button
          ref={desktopSearchRef}
          type="button"
          onClick={(event) => openSearch(event.currentTarget)}
          className="border-nx-line bg-card text-muted-foreground hover:border-primary ml-4 hidden h-11 min-w-[360px] flex-1 items-center gap-2.5 rounded-full border pr-2 pl-4 text-sm transition-colors lg:flex lg:max-w-[34rem]"
        >
          <Search className="text-primary size-4 shrink-0" aria-hidden />
          <AnimatedSearchPlaceholder />
          <kbd className="bg-secondary border-border text-nx-faint shrink-0 rounded-md border px-1.5 py-1 text-[11px] font-semibold">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <DeliveryLocationBadge />

          {/* En móvil la búsqueda se reduce a un icono, pero sigue siendo el mismo
              botón con el mismo destino. */}
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
              // `key={itemCount}`: al cambiar el número React remonta el nodo y la
              // animación de entrada vuelve a correr, que es el pulso. Sin la key,
              // `initial` solo se reproduciría la primera vez.
              // `MotionProvider` desactiva la escala bajo reduced-motion, así que
              // ahí el número cambia sin animación.
              <motion.span
                key={itemCount}
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 17 }}
                className="bg-primary text-primary-foreground absolute top-1 right-1 grid h-[19px] min-w-[19px] place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums"
              >
                {itemCount}
              </motion.span>
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

      {/* Fila 2: navegación por catálogo. Solo desde 1024 px; bajo ese ancho su
          contenido ya lo cubre el menú móvil y el header se queda en una fila. */}
      <div className="border-border/60 hidden border-t lg:block">
        <div className="mx-auto flex h-11 w-full max-w-[1240px] items-center gap-1 px-[clamp(1rem,4vw,2rem)]">
          <CategoryMegaMenu />
          <span className="bg-border mx-2 h-5 w-px shrink-0" aria-hidden />
          <nav aria-label="Principal" className="flex items-center gap-1">
            {/* `Link` y no `<a>`: desde la ficha esto es una navegación de cliente a
                la portada, que conserva el estado del catálogo; en la propia portada
                sigue siendo un salto dentro del documento (spec 005, D-8). */}
            {STOREFRONT_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground hover:text-foreground hover:bg-secondary inline-flex h-11 items-center rounded-full px-3.5 text-sm font-medium transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
