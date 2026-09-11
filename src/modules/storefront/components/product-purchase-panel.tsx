'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { MAX_LINE_QUANTITY } from '@/modules/cart/constants';
import { useCartStore } from '@/modules/cart/store/cart.store';
import { formatPrice } from '@/modules/products/lib/price';
import type { CatalogProductDetail } from '@/modules/products/types/catalog.types';

import { STOCK_LABELS, STORE_GUARANTEES } from '../constants';
import { QuantitySelector } from './quantity-selector';

// La isla cliente de la ficha. `product-detail.tsx` sigue siendo Server Component:
// solo baja al navegador lo que necesita estado —la cantidad— y el store del
// carrito (CLAUDE.md regla 7, spec 012, §8).
export function ProductPurchasePanel({ product }: { product: CatalogProductDetail }) {
  const router = useRouter();
  const add = useCartStore((state) => state.add);
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const soldOut = product.stockLevel === 'out';
  const { discountPercent, compareAtPriceCents } = product;
  const hasDiscount = discountPercent !== null && compareAtPriceCents !== null;

  useEffect(() => {
    if (!justAdded) return;
    const timeout = setTimeout(() => setJustAdded(false), 1400);
    return () => clearTimeout(timeout);
  }, [justAdded]);

  // `add(product, quantity)` y no `setQuantity`: si el producto todavía no está en
  // el carrito, `setQuantity` no crearía la línea (spec 012, §8). El `clampQuantity`
  // del store es el que tiene la última palabra sobre el tope.
  const addToCart = () => {
    add(product, quantity);
    setJustAdded(true);
  };

  // Añade y navega. No llama a `POST /api/checkout`: la Checkout Session la sigue
  // creando solo `/checkout`, para no abrir un segundo camino al pago con su propia
  // validación y su propio manejo de error (spec 007).
  const buyNow = () => {
    add(product, quantity);
    router.push('/checkout');
  };

  return (
    <aside
      aria-label="Comprar este producto"
      className="border-border bg-card nx-shadow-md rounded-[22px] border p-[clamp(1.1rem,2.5vw,1.5rem)]"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="font-nx-display text-[clamp(1.75rem,3.2vw,2.25rem)] leading-none font-semibold tracking-[-0.04em] tabular-nums">
          {formatPrice(product.priceCents)}
        </span>
        {/* El precio tachado y el badge son la misma condición: o están los dos o no
            está ninguno, nunca un descuento sin referencia (AC8 del spec 005). */}
        {hasDiscount ? (
          <>
            <span className="text-nx-faint text-[15px] tabular-nums line-through">
              {formatPrice(compareAtPriceCents)}
            </span>
            <span className="bg-nx-sale rounded-full px-2.5 py-1 text-xs font-semibold text-white">
              −{discountPercent} %
            </span>
          </>
        ) : null}
      </div>

      <p
        className={`mt-3 text-[13.5px] font-medium ${
          soldOut
            ? 'text-muted-foreground'
            : product.stockLevel === 'low'
              ? 'text-nx-sale'
              : 'text-nx-ok'
        }`}
      >
        {STOCK_LABELS[product.stockLevel]}
      </p>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-[13.5px]">Cantidad</span>
        {/* Agotado: el tope baja a 1 y el "+" se deshabilita solo, sin una bandera
            aparte que pueda desincronizarse del estado real (AC4). */}
        <QuantitySelector
          value={quantity}
          onChange={setQuantity}
          max={soldOut ? 1 : MAX_LINE_QUANTITY}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        <Button
          type="button"
          onClick={buyNow}
          disabled={soldOut}
          className="nx-shadow-accent h-12 w-full rounded-full"
        >
          {soldOut ? 'Sin stock' : 'Comprar ahora'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={addToCart}
          disabled={soldOut}
          className="h-12 w-full rounded-full"
        >
          {justAdded ? <Check className="size-4" aria-hidden /> : null}
          {justAdded ? 'Añadido' : 'Agregar al carrito'}
        </Button>
      </div>

      <ul className="text-muted-foreground mt-5 flex flex-col gap-2 text-[13px]">
        {STORE_GUARANTEES.map((guarantee) => (
          <li key={guarantee.text} className="flex items-center gap-2.5">
            <guarantee.icon className="text-primary size-4 shrink-0" aria-hidden />
            {guarantee.text}
          </li>
        ))}
      </ul>
    </aside>
  );
}
