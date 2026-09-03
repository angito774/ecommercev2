'use client';

import { Check, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useCartStore } from '@/modules/cart/store/cart.store';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

type AddToCartButtonProps = {
  product: CatalogProduct;
  variant?: 'icon' | 'full';
};

// La isla cliente más pequeña posible: la tarjeta entera puede seguir siendo un
// Server Component y solo este botón necesita el store (CLAUDE.md regla 7).
export function AddToCartButton({ product, variant = 'icon' }: AddToCartButtonProps) {
  const add = useCartStore((state) => state.add);
  const [justAdded, setJustAdded] = useState(false);

  const soldOut = product.stockLevel === 'out';

  useEffect(() => {
    if (!justAdded) return;
    const timeout = setTimeout(() => setJustAdded(false), 1400);
    return () => clearTimeout(timeout);
  }, [justAdded]);

  const onClick = () => {
    add(product);
    setJustAdded(true);
  };

  if (variant === 'full') {
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

  return (
    <Button
      type="button"
      size="icon"
      onClick={onClick}
      disabled={soldOut}
      // 44 px de lado: es el mínimo táctil que exige AC17 y el que usa el resto de
      // controles del header.
      className="bg-foreground text-background hover:bg-primary hover:text-primary-foreground size-11 shrink-0 rounded-full transition-colors"
      aria-label={soldOut ? `${product.name}, sin stock` : `Añadir ${product.name} al carrito`}
    >
      {justAdded ? (
        <Check className="size-5" aria-hidden />
      ) : (
        <Plus className="size-5" aria-hidden />
      )}
    </Button>
  );
}
