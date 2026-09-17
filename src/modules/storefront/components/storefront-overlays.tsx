'use client';

import dynamic from 'next/dynamic';

import { useUiStore } from '../store/ui.store';
import { ScrollToTop } from './scroll-to-top';

// Los dos overlays están detrás de un clic, así que no tienen por qué pesar en el
// chunk que mide el LCP de la portada. `next/dynamic` los saca del bundle inicial
// (regla `bundle-dynamic-imports`, spec 004 D-17).
//
// El buscador ya no está aquí: es un campo del header que hay que poder usar desde
// el primer píxel, así que no se difiere (spec 019, D-12).
//
// `ssr: false` porque ninguno aporta nada al HTML inicial: los dos nacen cerrados.
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
  const cartMounted = useUiStore((state) => state.cartMounted);
  const menuMounted = useUiStore((state) => state.menuMounted);

  return (
    <>
      {cartMounted ? <CartDrawer /> : null}
      {menuMounted ? <MobileMenu /> : null}
      {/* Import estático y no `next/dynamic`: el botón tiene que estar escuchando
          el scroll desde el primer píxel, así que diferirlo no ahorraría nada —
          habría que cargarlo igual al hidratar. */}
      <ScrollToTop />
    </>
  );
}
