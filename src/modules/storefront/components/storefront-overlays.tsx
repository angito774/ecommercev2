'use client';

import dynamic from 'next/dynamic';

import { useUiStore } from '../store/ui.store';
import { ScrollToTop } from './scroll-to-top';

// Los tres overlays están detrás de un clic o de un atajo, así que no tienen por
// qué pesar en el chunk que mide el LCP de la portada. `next/dynamic` los saca del
// bundle inicial (regla `bundle-dynamic-imports`, spec 004 D-17).
//
// `ssr: false` porque ninguno aporta nada al HTML inicial: los tres nacen cerrados.
const SearchDialog = dynamic(
  () => import('./search-dialog').then((m) => m.SearchDialog),
  { ssr: false },
);

const CartDrawer = dynamic(
  () => import('@/modules/cart/components/cart-drawer').then((m) => m.CartDrawer),
  { ssr: false },
);

const MobileMenu = dynamic(() => import('./mobile-menu').then((m) => m.MobileMenu), {
  ssr: false,
});

// Cada overlay se monta la primera vez que se abre y ya no se desmonta. El pestillo
// lo mantiene el store (`ui.store.ts`), donde está documentado por qué.
export function StorefrontOverlays() {
  const searchMounted = useUiStore((state) => state.searchMounted);
  const cartMounted = useUiStore((state) => state.cartMounted);
  const menuMounted = useUiStore((state) => state.menuMounted);

  return (
    <>
      {searchMounted ? <SearchDialog /> : null}
      {cartMounted ? <CartDrawer /> : null}
      {menuMounted ? <MobileMenu /> : null}
      {/* Import estático y no `next/dynamic`: el botón tiene que estar escuchando
          el scroll desde el primer píxel, así que diferirlo no ahorraría nada —
          habría que cargarlo igual al hidratar. */}
      <ScrollToTop />
    </>
  );
}
