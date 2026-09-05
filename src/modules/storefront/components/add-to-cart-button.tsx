'use client';

import { Check, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { selectQuantityForProduct, useCartStore } from '@/modules/cart/store/cart.store';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

type AddToCartButtonProps = {
  product: CatalogProduct;
  variant?: 'icon' | 'full';
};

// La isla cliente más pequeña posible: la tarjeta entera puede seguir siendo un
// Server Component y solo este botón necesita el store (CLAUDE.md regla 7).
export function AddToCartButton({ product, variant = 'icon' }: AddToCartButtonProps) {
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
      className="bg-foreground text-background hover:bg-primary hover:text-primary-foreground size-11 shrink-0 rounded-full transition-colors"
      aria-label={soldOut ? `${product.name}, sin stock` : `Añadir ${product.name} al carrito`}
    >
      <Plus className="size-5" aria-hidden />
    </Button>
  );
}
