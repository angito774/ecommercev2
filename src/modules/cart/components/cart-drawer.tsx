'use client';

import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatPrice } from '@/modules/products/lib/price';
import { PaymentIcons } from '@/modules/storefront/components/payment-icons';
import { ProductMedia } from '@/modules/storefront/components/product-media';
import { useUiStore } from '@/modules/storefront/store/ui.store';

import { FREE_SHIPPING_THRESHOLD_CENTS, SHIPPING_COST_CENTS } from '../constants';
import {
  type CartLine,
  selectItemCount,
  selectSubtotalCents,
  useCartStore,
} from '../store/cart.store';

export function CartDrawer() {
  const open = useUiStore((state) => state.cartOpen);
  const setCartOpen = useUiStore((state) => state.setCartOpen);

  const lines = useCartStore((state) => state.lines);
  const itemCount = useCartStore(selectItemCount);
  const subtotalCents = useCartStore(selectSubtotalCents);

  const qualifiesForFreeShipping = subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS;
  const missingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - subtotalCents);
  const shippingCents = qualifiesForFreeShipping ? 0 : SHIPPING_COST_CENTS;
  const progress = Math.min(100, (subtotalCents / FREE_SHIPPING_THRESHOLD_CENTS) * 100);

  return (
    <Sheet open={open} onOpenChange={setCartOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[430px]">
        <SheetHeader className="border-border shrink-0 border-b p-4.5">
          <SheetTitle className="flex items-center gap-2.5 text-xl">
            Tu carrito
            <span className="bg-secondary text-nx-faint rounded-full px-2.5 py-1 text-xs font-semibold">
              {itemCount}
            </span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Productos añadidos al carrito, con sus cantidades y el total del pedido.
          </SheetDescription>
        </SheetHeader>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <span className="bg-secondary text-nx-faint mb-2 grid size-16 place-items-center rounded-full">
              <ShoppingBag className="size-7" aria-hidden />
            </span>
            <h3 className="text-lg font-semibold">Tu carrito está vacío</h3>
            <p className="text-nx-faint mb-3 text-sm">Añade algo del catálogo y aparecerá aquí.</p>
            <Button
              variant="outline"
              onClick={() => setCartOpen(false)}
              className="h-11 rounded-full px-5"
            >
              Seguir comprando
            </Button>
          </div>
        ) : (
          <>
            <div className="border-border shrink-0 border-b p-4.5">
              <p className="text-muted-foreground mb-2.5 text-[12.5px]">
                {qualifiesForFreeShipping ? (
                  <span className="text-nx-ok font-semibold">
                    ¡Genial! Tu pedido tiene envío gratis.
                  </span>
                ) : (
                  <>
                    Te faltan{' '}
                    <span className="text-foreground font-semibold">
                      {formatPrice(missingForFreeShipping)}
                    </span>{' '}
                    para el envío gratis
                  </>
                )}
              </p>
              <div
                className="bg-secondary h-1.5 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progreso hacia el envío gratis"
              >
                <div
                  className="from-primary to-nx-accent-2 h-full rounded-full bg-gradient-to-r transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Texto fijo, sin cálculo detrás: no hay modelo de cobertura
                  logística y así está documentado (spec 012, §5). */}
              <p className="text-nx-faint mt-2.5 text-[11.5px]">
                Envío estimado: 1–2 días hábiles a Lima
              </p>
            </div>

            <ul className="flex-1 space-y-3 overflow-y-auto p-4.5">
              {lines.map((line) => (
                <CartLineRow key={line.productId} line={line} />
              ))}
            </ul>

            <div className="border-border bg-card shrink-0 border-t p-4.5">
              <dl className="text-muted-foreground space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt>Subtotal</dt>
                  <dd className="tabular-nums">{formatPrice(subtotalCents)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Envío</dt>
                  <dd className="tabular-nums">
                    {shippingCents === 0 ? 'Gratis' : formatPrice(shippingCents)}
                  </dd>
                </div>
                <div className="border-border text-foreground font-nx-display flex items-center justify-between gap-3 border-t pt-3 text-lg font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatPrice(subtotalCents + shippingCents)}</dd>
                </div>
              </dl>

              {/* Enlace, no botón con `router.push()`: el destino es una URL real y
                  debe poder abrirse en otra pestaña. Cerrar el drawer al navegar
                  evita que quede abierto encima del checkout. */}
              <Button asChild className="mt-4 h-12 w-full rounded-full">
                <Link href="/checkout" onClick={() => setCartOpen(false)}>
                  Finalizar compra
                </Link>
              </Button>

              {/* Salida sin abandonar el carrito: cerrar el panel deja las líneas
                  intactas, solo devuelve al catálogo (AC7). */}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCartOpen(false)}
                className="text-muted-foreground mt-1.5 h-11 w-full rounded-full"
              >
                Seguir comprando
              </Button>

              <p className="text-nx-faint mt-2.5 text-center text-[11.5px]">
                Pago seguro con Stripe. Sin sesión iniciada te pediremos entrar antes.
              </p>

              <PaymentIcons className="mt-3 justify-center" />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CartLineRow({ line }: { line: CartLine }) {
  const setQuantity = useCartStore((state) => state.setQuantity);
  const remove = useCartStore((state) => state.remove);

  return (
    // Entra con un desplazamiento corto y la clave es el `productId`, no el índice:
    // al quitar una línea del medio, animar por índice haría entrar de nuevo a todas
    // las de abajo. `MotionProvider` ya neutraliza el movimiento bajo
    // `prefers-reduced-motion` (AC13).
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="border-border grid grid-cols-[90px_1fr] gap-3.5 border-b pb-3 last:border-b-0"
    >
      <div className="nx-art-surface relative grid aspect-square place-items-center overflow-hidden rounded-2xl p-2">
        {/* El `sizes` acompaña al ancho real de la columna: con `74px` el navegador
            seguiría pidiendo la variante pequeña y la miniatura se vería blanda. */}
        <ProductMedia
          imageUrl={line.imageUrl}
          alt={line.name}
          categorySlug={line.categorySlug}
          sizes="90px"
        />
      </div>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <p className="text-[14.5px] leading-tight font-medium tracking-[-0.02em]">
              {line.name}
            </p>
            <p className="text-nx-faint mt-1 text-[11.5px]">{line.categoryName}</p>
            {/* De qué se compone el total de la derecha: sin esta línea, dos
                unidades de 500 se leen como un producto de 1000 (AC6). */}
            <p className="text-muted-foreground mt-1 text-[12.5px] tabular-nums">
              {formatPrice(line.priceCents)} × {line.quantity}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => remove(line.productId)}
            className="text-nx-faint hover:text-destructive size-11 shrink-0"
            aria-label={`Quitar ${line.name} del carrito`}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2.5">
          <div className="border-border flex items-center gap-0.5 rounded-full border p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setQuantity(line.productId, line.quantity - 1)}
              className="text-muted-foreground size-11 rounded-full"
              aria-label={`Reducir la cantidad de ${line.name}`}
            >
              <Minus className="size-3.5" aria-hidden />
            </Button>
            <output className="min-w-6 text-center text-[13.5px] font-semibold tabular-nums">
              {line.quantity}
            </output>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setQuantity(line.productId, line.quantity + 1)}
              className="text-muted-foreground size-11 rounded-full"
              aria-label={`Aumentar la cantidad de ${line.name}`}
            >
              <Plus className="size-3.5" aria-hidden />
            </Button>
          </div>

          <span className="font-nx-display text-[15.5px] font-semibold tracking-[-0.025em]">
            {formatPrice(line.priceCents * line.quantity)}
          </span>
        </div>
      </div>
    </motion.li>
  );
}
