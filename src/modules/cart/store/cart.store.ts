'use client';

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { CART_STORAGE_KEY, MAX_LINE_QUANTITY } from '../constants';

// Solo lo que el drawer pinta. No se guarda el `CatalogProduct` entero porque
// `localStorage` no es un caché de la API: cuanto más se guarda, más envejece y
// más cuesta migrar la clave (regla `client-localstorage-schema`).
export type CartLine = {
  productId: string;
  name: string;
  slug: string;
  priceCents: number;
  imageUrl: string | null;
  categoryName: string;
  categorySlug: string;
  quantity: number;
};

type CartState = {
  lines: CartLine[];
  add: (product: CatalogProduct, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const clampQuantity = (quantity: number) =>
  Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(quantity)));

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],

      add: (product, quantity = 1) =>
        set((state) => {
          const existing = state.lines.find((line) => line.productId === product.id);

          if (existing) {
            return {
              lines: state.lines.map((line) =>
                line.productId === product.id
                  ? { ...line, quantity: clampQuantity(line.quantity + quantity) }
                  : line,
              ),
            };
          }

          // El precio se congela aquí a propósito. Es una instantánea que envejece
          // —está anotado en §10 del spec— y el carrito de servidor tendrá que
          // recalcular contra la base en vez de fiarse de este número.
          const line: CartLine = {
            productId: product.id,
            name: product.name,
            slug: product.slug,
            priceCents: product.priceCents,
            imageUrl: product.imageUrl,
            categoryName: product.categoryName,
            categorySlug: product.categorySlug,
            quantity: clampQuantity(quantity),
          };

          return { lines: [...state.lines, line] };
        }),

      setQuantity: (productId, quantity) =>
        set((state) => ({
          // Bajar de 1 es quitar la línea: obligar a pulsar la papelera después de
          // llegar a cero sería un paso de más.
          lines:
            quantity < 1
              ? state.lines.filter((line) => line.productId !== productId)
              : state.lines.map((line) =>
                  line.productId === productId
                    ? { ...line, quantity: clampQuantity(quantity) }
                    : line,
                ),
        })),

      remove: (productId) =>
        set((state) => ({
          lines: state.lines.filter((line) => line.productId !== productId),
        })),

      clear: () => set({ lines: [] }),
    }),
    {
      name: CART_STORAGE_KEY,
      // `localStorage` lanza en el modo privado de Safari, con la cuota llena o
      // simplemente desactivado. Un carrito que no persiste es aceptable; una
      // portada que no renderiza, no.
      storage: createJSONStorage(() => ({
        getItem: (key) => {
          try {
            return localStorage.getItem(key);
          } catch {
            return null;
          }
        },
        setItem: (key, value) => {
          try {
            localStorage.setItem(key, value);
          } catch {
            // Sin persistencia, pero la sesión en curso sigue funcionando.
          }
        },
        removeItem: (key) => {
          try {
            localStorage.removeItem(key);
          } catch {
            // Idem.
          }
        },
      })),
      partialize: (state) => ({ lines: state.lines }),
      // Sin `onRehydrateStorage`. Antes había uno que hacía
      // `useCartStore.setState({ hydrated: true })`, y era un fallo real: el
      // callback corre DENTRO de `create()`, cuando el `const useCartStore`
      // todavía está en su zona muerta temporal. La ReferenceError la absorbía la
      // cadena de promesas de `persist`, que además marcaba la rehidratación como
      // fallida — `hasHydrated()` se quedaba en `false` para siempre y la insignia
      // del carrito no se pintaba nunca, aunque las líneas sí se restauraran.
    },
  ),
);

// Estado de rehidratación leído de la propia API de `persist`, que es quien lo
// sabe, en lugar de una bandera paralela que hay que acordarse de levantar.
//
// `useSyncExternalStore` con `getServerSnapshot = false` da exactamente lo que
// hace falta: en el servidor y en el primer render del cliente vale `false`, así
// que el HTML coincide y no hay mismatch; en cuanto termina la rehidratación el
// hook se entera y el componente vuelve a renderizar con el número real.
const subscribeToHydration = (onChange: () => void) =>
  useCartStore.persist.onFinishHydration(onChange);

const getHydrationSnapshot = () => useCartStore.persist.hasHydrated();

const getHydrationServerSnapshot = () => false;

export function useCartHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    getHydrationSnapshot,
    getHydrationServerSnapshot,
  );
}

// Selectores. Se exportan como funciones sueltas para que cada componente se
// suscriba solo al valor derivado que usa y no al array entero
// (regla `rerender-derived-state`).
export const selectItemCount = (state: CartState): number =>
  state.lines.reduce((total, line) => total + line.quantity, 0);

export const selectSubtotalCents = (state: CartState): number =>
  state.lines.reduce((total, line) => total + line.priceCents * line.quantity, 0);

// Factoría y no una función de dos argumentos: `useCartStore(selector)` solo
// acepta un selector de un parámetro, así que cada consumidor cierra sobre su
// propio `productId` antes de pasarlo. El valor devuelto sigue siendo un
// primitivo, así que la regla `rerender-derived-state` se mantiene igual.
export const selectQuantityForProduct =
  (productId: string) =>
  (state: CartState): number =>
    state.lines.find((line) => line.productId === productId)?.quantity ?? 0;
