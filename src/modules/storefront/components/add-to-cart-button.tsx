'use client';

import { Check, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { selectQuantityForProduct, useCartStore } from '@/modules/cart/store/cart.store';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

// Clases del revelado al hover. Se leen de arriba abajo:
//
//  1. `[@media(hover:hover)]:opacity-0` — el botón solo nace oculto donde hay un
//     puntero fino. En táctil la media query es falsa y queda visible siempre:
//     un control que solo aparece en hover no existe en móvil.
//  2. `group-hover` / `group-focus-within` — lo devuelven a la vista. El segundo
//     no es decorativo: sin él, tabular hasta el botón lo enfocaría invisible.
//
// El orden no depende de la posición en la cadena sino de la especificidad:
// `.group:hover &` (0,2,0) gana a la regla de la media query (0,1,0).
const REVEAL_ON_HOVER_CLASSES =
  'transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100';

type AddToCartButtonProps = {
  product: CatalogProduct;
  variant?: 'icon' | 'full';
  // Opt-in y no comportamiento por defecto: las clases `group-*` necesitan un
  // ancestro con `group`, y de los cuatro consumidores del variante `icon` solo
  // la tarjeta del catálogo lo tiene. Activarlo siempre dejaría el botón oculto
  // para siempre en el destacado del hero y en las ofertas secundarias.
  revealOnHover?: boolean;
};

// La isla cliente más pequeña posible: la tarjeta entera puede seguir siendo un
// Server Component y solo este botón necesita el store (CLAUDE.md regla 7).
export function AddToCartButton({
  product,
  variant = 'icon',
  revealOnHover = false,
}: AddToCartButtonProps) {
  const add = useCartStore((state) => state.add);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const quantity = useCartStore(selectQuantityForProduct(product.id));
  const [justAdded, setJustAdded] = useState(false);

  const soldOut = product.stockLevel === 'out';

  useEffect(() => {
    if (!justAdded) return;
    const timeout = setTimeout(() => setJustAdded(false), 1400);
    return () => clearTimeout(timeout);
  }, [justAdded]);

  if (variant === 'full') {
    const onClick = () => {
      add(product);
      setJustAdded(true);
    };

    return (
      <Button
        type="button"
        onClick={onClick}
        disabled={soldOut}
        className="nx-shadow-accent h-12 min-w-[11rem] rounded-full"
      >
        {justAdded ? <Check className="size-4" aria-hidden /> : null}
        {soldOut ? 'Sin stock' : justAdded ? 'Añadido' : 'Añadir al carrito'}
      </Button>
    );
  }

  // Ya hay unidades de este producto en el carrito: el botón "+" pasa a ser el
  // mismo stepper del drawer, en vez de dejar que un segundo clic parezca no
  // hacer nada porque no había forma de ver ni bajar la cantidad ya añadida.
  //
  // El stepper NO se revela al hover aunque `revealOnHover` esté activo: la
  // cantidad ya añadida es información, no un control, y ocultarla haría que la
  // tarjeta pareciese no tener nada en el carrito.
  if (quantity > 0) {
    return (
      // 44 px de lado en cada botón, el mismo mínimo táctil del stepper del drawer
      // (AC21). El contenedor no fija altura: la toma de sus botones.
      <div className="border-border bg-card flex shrink-0 items-center gap-0.5 rounded-full border p-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setQuantity(product.id, quantity - 1)}
          className="text-muted-foreground size-11 rounded-full"
          aria-label={`Reducir la cantidad de ${product.name}`}
        >
          <Minus className="size-3.5" aria-hidden />
        </Button>
        <output className="min-w-5 text-center text-[13.5px] font-semibold tabular-nums">
          {quantity}
        </output>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setQuantity(product.id, quantity + 1)}
          className="text-muted-foreground size-11 rounded-full"
          aria-label={`Aumentar la cantidad de ${product.name}`}
        >
          <Plus className="size-3.5" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      onClick={() => add(product)}
      disabled={soldOut}
      // 44 px de lado: es el mínimo táctil que exige AC17 y el que usa el resto de
      // controles del header.
      className={`bg-foreground text-background hover:bg-primary hover:text-primary-foreground size-11 shrink-0 rounded-full transition-colors ${
        revealOnHover ? REVEAL_ON_HOVER_CLASSES : ''
      }`}
      aria-label={soldOut ? `${product.name}, sin stock` : `Añadir ${product.name} al carrito`}
    >
      <Plus className="size-5" aria-hidden />
    </Button>
  );
}
