'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Lock, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCartHydrated, useCartStore } from '@/modules/cart/store/cart.store';
import { BuyerDocumentFields } from '@/modules/invoicing/components/buyer-document-fields';
import { formatPrice } from '@/modules/products/lib/price';
import { ProductMedia } from '@/modules/storefront/components/product-media';

import { useCreateCheckout } from '../hooks/use-create-checkout';
import { calculateOrderTotals } from '../lib/totals';
import { buyerFormSchema, toBuyerPayload } from '../schemas/checkout.schema';

// El carrito vive en `localStorage`: hasta que `persist` rehidrata, `lines` está
// vacío y pintar el estado vacío ahí acusaría de carrito vacío a quien sí tiene uno.
function SummarySkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-24 w-full rounded-[22px]" />
      <Skeleton className="h-24 w-full rounded-[22px]" />
      <Skeleton className="h-40 w-full rounded-[22px]" />
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="border-border bg-card flex flex-col items-start gap-4 rounded-[22px] border p-[clamp(1.5rem,4vw,2.5rem)]">
      <span className="bg-nx-accent-soft text-primary grid size-11 place-items-center rounded-xl">
        <ShoppingBag className="size-5" aria-hidden />
      </span>
      <div className="space-y-2">
        <h2 className="text-[17px] font-semibold tracking-[-0.025em]">Tu carrito está vacío</h2>
        <p className="text-muted-foreground max-w-[52ch] text-sm leading-relaxed">
          Añade algo del catálogo y podrás pagarlo desde aquí.
        </p>
      </div>
      <Button asChild className="mt-1 h-11 rounded-full px-5">
        <Link href="/#catalogo">Ver el catálogo</Link>
      </Button>
    </div>
  );
}

export function CheckoutSummary() {
  const hydrated = useCartHydrated();
  const lines = useCartStore((state) => state.lines);
  const { mutate, isPending } = useCreateCheckout();

  // El formulario se declara antes de los early returns: los hooks no pueden ir detrás de
  // un `return` condicional. `defaultValues` arranca en boleta porque es el caso común y
  // porque elegirlo no pide ningún campo extra.
  const { control, formState, handleSubmit, register } = useForm({
    resolver: zodResolver(buyerFormSchema),
    defaultValues: { documentType: 'dni' as const, documentNumber: '', legalName: '' },
  });

  // `useWatch` y no `watch()`: suscribe solo a este campo en vez de re-renderizar el
  // resumen entero en cada pulsación del documento, y es la API que el lint de React Hook
  // Form admite —`watch()` no se puede memoizar con seguridad—.
  const documentType = useWatch({ control, name: 'documentType' });

  // El precio de estas líneas es la instantánea del carrito y puede haber envejecido. Solo
  // se pinta: el importe que se cobra lo relee el servidor de `products` y el request ni
  // siquiera transporta un precio (spec 007, AC3).
  const startPayment = handleSubmit((values) => {
    mutate({
      lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      // `toBuyerPayload` mapea `legalName: ''` a `undefined` en un solo sitio: `''` es
      // exactamente lo que el `CHECK orders_buyer_legal_name_requires_ruc` no admite en una
      // boleta (spec 022, §6.1).
      buyer: toBuyerPayload(values),
    });
  });

  if (!hydrated) return <SummarySkeleton />;
  if (lines.length === 0) return <EmptyCart />;

  // Los mismos helpers que usa el servidor para calcular lo que cobra Stripe: si el
  // resumen y el importe real divergieran, sería porque hay dos aritméticas (D-8).
  const { subtotalCents, shippingCents, amountTotalCents } = calculateOrderTotals(lines);

  return (
    <div className="grid items-start gap-[clamp(1.5rem,3vw,2.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <ul className="border-border bg-card divide-border divide-y rounded-[22px] border">
        {lines.map((line) => (
          <li key={line.productId} className="grid grid-cols-[72px_1fr] gap-4 p-4">
            <div className="nx-art-surface relative grid aspect-square place-items-center overflow-hidden rounded-xl p-2">
              <ProductMedia
                imageUrl={line.imageUrl}
                alt={line.name}
                categorySlug={line.categorySlug}
                sizes="72px"
              />
            </div>

            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/products/${line.slug}`}
                  className="text-[15px] leading-tight font-medium tracking-[-0.02em] hover:underline"
                >
                  {line.name}
                </Link>
                <p className="text-nx-faint mt-1.5 text-xs">
                  {line.categoryName} · {line.quantity} ud.
                </p>
              </div>
              <span className="font-nx-display shrink-0 text-[15.5px] font-semibold tracking-[-0.025em] tabular-nums">
                {formatPrice(line.priceCents * line.quantity)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* `<form>` y no un `onClick` suelto: así el Enter dentro del documento envía, la
          validación de React Hook Form corre antes de la mutación y el navegador marca los
          campos inválidos sin que haya que replicar el foco a mano. */}
      <form
        noValidate
        onSubmit={startPayment}
        className="border-border bg-card rounded-[22px] border p-[clamp(1.25rem,3vw,1.75rem)] lg:sticky lg:top-[calc(var(--nx-header-h)+1rem)]"
      >
        <h2 className="text-[17px] font-semibold tracking-[-0.025em]">Resumen del pedido</h2>

        <div className="mt-5">
          <BuyerDocumentFields
            control={control}
            register={register}
            errors={formState.errors}
            documentType={documentType}
            disabled={isPending}
          />
        </div>

        <dl className="text-muted-foreground mt-5 space-y-2.5 text-sm">
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
            <dd className="tabular-nums">{formatPrice(amountTotalCents)}</dd>
          </div>
        </dl>

        <Button type="submit" disabled={isPending} className="mt-6 h-12 w-full rounded-full">
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Redirigiendo a Stripe…
            </>
          ) : (
            <>
              <Lock className="size-4" aria-hidden />
              Pagar {formatPrice(amountTotalCents)}
            </>
          )}
        </Button>

        {/* Se afirma lo que es cierto y nada más: ni logo de Stripe descargado ni
            un badge de SSL dibujado a mano, que sería una promesa de seguridad sin
            nada detrás (spec 012, D-9). */}
        <p className="text-muted-foreground mt-3 flex items-center justify-center gap-2 text-[12.5px]">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          Pago procesado por Stripe
        </p>

        <p className="text-nx-faint mt-2 text-center text-[11.5px] leading-relaxed">
          El pago se completa en la página segura de Stripe. La dirección de envío se recoge allí.
        </p>

        {/* Dos destinos que existen de verdad, no páginas de políticas que nadie ha
            escrito todavía (AC11). */}
        <div className="border-border mt-4 flex flex-wrap items-center justify-center gap-x-4 border-t pt-3">
          <Link
            href="/#ventajas"
            className="text-muted-foreground hover:text-primary inline-flex min-h-11 items-center text-[12.5px] transition-colors"
          >
            Garantía y devoluciones
          </Link>
          <Link
            href="/#catalogo"
            className="text-muted-foreground hover:text-primary inline-flex min-h-11 items-center text-[12.5px] transition-colors"
          >
            Seguir comprando
          </Link>
        </div>
      </form>
    </div>
  );
}
