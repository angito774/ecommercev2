'use client';

import { Menu, ShoppingBag } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { selectItemCount, useCartHydrated, useCartStore } from '@/modules/cart/store/cart.store';

import { STOREFRONT_NAV } from '../constants';
import { useUiStore } from '../store/ui.store';
import { BrandMark } from './brand-mark';
import { CategoryMegaMenu } from './category-mega-menu';
import { DeliveryLocationBadge } from './delivery-location-badge';
import { HeaderSearch } from './header-search';
import { ThemeToggle } from './theme-toggle';

type StorefrontHeaderProps = {
  // El bloque de Clerk llega renderizado desde el layout servidor. Pasarlo como
  // slot mantiene `UserButton` fuera del bundle de este componente y conserva los
  // botones de sesión sin convertir el header en consumidor de Clerk (D-15, AC19).
  authSlot: ReactNode;
};

export function StorefrontHeader({ authSlot }: StorefrontHeaderProps) {
  const [stuck, setStuck] = useState(false);

  const setCartOpen = useUiStore((state) => state.setCartOpen);
  const setMenuOpen = useUiStore((state) => state.setMenuOpen);

  // Hay dos campos de búsqueda —el de la fila 1 desde `md` y el de la fila propia
  // de móvil— y solo uno está renderizado en cada breakpoint (D-8).
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  // `⌘K` ya no abre nada: solo enfoca. Se elige el campo visible porque
  // `offsetParent === null` delata al que el breakpoint ha ocultado, y enfocar un
  // elemento oculto no haría nada. `select()` deja el término anterior listo para
  // reemplazarse de una tecla (AC7).
  const focusSearch = useCallback(() => {
    const target = [desktopSearchRef.current, mobileSearchRef.current].find(
      (element) => element !== null && element.offsetParent !== null,
    );

    target?.focus();
    target?.select();
  }, []);

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

  // ⌘K se registra aquí y no dentro de `HeaderSearch` porque hay dos instancias
  // montadas y solo el header sabe cuál está visible: con el listener dentro, las
  // dos responderían al mismo atajo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusSearch]);

  return (
    <header
      data-stuck={stuck}
      // `nx-glass-panel` es una clase escrita a mano en globals.css, no una utilidad
      // de Tailwind: `data-[stuck=true]:nx-glass-panel` no genera ninguna regla (el
      // compilador la descarta en silencio) y el header se quedaba con fondo
      // transparente incluso pegado arriba, dejando ver el contenido a través suyo al
      // hacer scroll. Se condiciona por JS, como ya hace el resto del componente con
      // `stuck`.
      className={cn('sticky top-0 z-50 transition-colors', stuck && 'nx-glass-panel border-b')}
    >
      {/* Fila 1: identidad, búsqueda y acciones de sesión. */}
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

        {/* La búsqueda ocupa el centro de la fila: es la acción principal de una
            tienda con catálogo. Desde `md` y no desde `lg` porque con el corte en
            1024 px la franja 768–1023 px se quedaría sin campo —ni fila de móvil ni
            hueco en esta— (D-9). */}
        <HeaderSearch
          inputRef={desktopSearchRef}
          className="ml-4 hidden min-w-0 flex-1 md:flex lg:max-w-[34rem]"
        />

        <div className="ml-auto flex items-center gap-1">
          <DeliveryLocationBadge />

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

      {/* Fila de búsqueda de móvil: en el flujo del header y no flotando en
          `absolute`, porque el campo tiene que estar ahí desde el primer píxel y no
          solo al hacer scroll. Al crecer la altura real del header, `--nx-header-h`
          se ajusta en `globals.css` bajo 48rem (D-13). */}
      <div className="w-full px-[clamp(1rem,4vw,2rem)] pb-2 md:hidden">
        <HeaderSearch inputRef={mobileSearchRef} />
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
