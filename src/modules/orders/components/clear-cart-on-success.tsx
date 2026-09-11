'use client';

import { useEffect } from 'react';

import { useCartStore } from '@/modules/cart/store/cart.store';

// Vaciar el carrito es un efecto, no un render. Se hace en el retorno y no en el
// webhook porque el carrito vive en el `localStorage` del navegador y el servidor no
// puede tocarlo (AC9).
//
// La page solo lo monta con la orden ya `paid`: quien decide es ella, que tiene el
// estado. Este componente no vuelve a comprobarlo para no tener dos sitios donde
// cambiar la condición.
//
// No renderiza nada. `clear()` es idempotente, así que un segundo montaje —una
// recarga de la página de éxito— no hace daño.
export function ClearCartOnSuccess() {
  const clear = useCartStore((state) => state.clear);

  useEffect(() => {
    clear();
  }, [clear]);

  return null;
}
