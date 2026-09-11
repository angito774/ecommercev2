'use client';

import { Home, LayoutGrid, type LucideIcon, ShoppingBag, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { selectItemCount, useCartHydrated, useCartStore } from '@/modules/cart/store/cart.store';

import { useUiStore } from '../store/ui.store';

// Barra inferior de móvil. Sin animación de entrada: está desde el primer píxel y
// AC16 no admite movimiento nuevo bajo `prefers-reduced-motion`; una barra que
// aparece y desaparece con el scroll obligaría además a una rama por preferencia.
//
// «Categorías» y «Carrito» abren los overlays que ya existen en vez de estrenar
// vistas: el sheet del menú, con las categorías reales de T20, ya es esa vista, y
// `ui.store.ts` cierra los otros dos al abrir uno (spec 013, §8).
export function MobileBottomNav() {
  const pathname = usePathname();

  const setMenuOpen = useUiStore((state) => state.setMenuOpen);
  const setCartOpen = useUiStore((state) => state.setCartOpen);

  // Suscripción al número derivado y no al array de líneas: la barra solo se
  // re-renderiza cuando cambia lo que pinta (regla `rerender-derived-state`).
  const itemCount = useCartStore(selectItemCount);
  const hydrated = useCartHydrated();

  return (
    <nav
      aria-label="Navegación principal en móvil"
      // `env(safe-area-inset-bottom)`: en un iPhone con barra de gestos, sin esto la
      // fila de iconos queda debajo del indicador del sistema.
      className="nx-glass-panel border-border fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <NavLink href="/" icon={Home} label="Inicio" active={pathname === '/'} />

      <NavButton icon={LayoutGrid} label="Categorías" onClick={() => setMenuOpen(true)} />

      <NavButton
        icon={ShoppingBag}
        label="Carrito"
        onClick={() => setCartOpen(true)}
        // Hasta que `persist` rehidrata no se conoce el número real: pintarlo antes
        // provocaría un mismatch de hidratación, el mismo criterio que el badge del
        // header.
        badge={hydrated && itemCount > 0 ? itemCount : null}
      />

      <NavLink
        href="/account"
        icon={User}
        label="Cuenta"
        active={pathname.startsWith('/account')}
      />
    </nav>
  );
}

// 56 px de alto y ancho repartido a partes iguales: por encima de los 44 px de
// objetivo táctil mínimo que pide AC10 en las dos dimensiones.
const ITEM_CLASS =
  'relative flex h-14 min-w-11 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors';

function NavLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      // `aria-current="page"` y no solo color: el lector de pantalla necesita saber
      // dónde está, y el color por sí solo no es una señal accesible.
      aria-current={active ? 'page' : undefined}
      className={`${ITEM_CLASS} ${active ? 'text-primary' : 'text-muted-foreground'}`}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </Link>
  );
}

function NavButton({
  icon: Icon,
  label,
  onClick,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  badge?: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={badge ? `${label}, ${badge} artículos` : undefined}
      className={`${ITEM_CLASS} text-muted-foreground`}
    >
      <span className="relative">
        <Icon className="size-5" aria-hidden />
        {badge ? <Badge>{badge}</Badge> : null}
      </span>
      {label}
    </button>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="bg-primary text-primary-foreground absolute -top-1.5 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold tabular-nums"
    >
      {children}
    </span>
  );
}
