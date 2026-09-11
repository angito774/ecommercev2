import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';

import { CheckoutSummary } from '@/modules/orders/components/checkout-summary';
import { CheckoutStepper } from '@/modules/storefront/components/checkout-stepper';

export const metadata: Metadata = {
  title: 'Finalizar compra',
  description: 'Revisa tu pedido y paga de forma segura.',
  // Página privada: el 307 ya la protege, pero la URL puede acabar en un sitemap
  // externo y no debe aparecer en resultados como una promesa rota.
  robots: { index: false },
};

export default async function CheckoutPage() {
  // Verificación en el propio recurso: en una page, `auth.protect()` es el 307 a
  // `/sign-in?redirect_url=…` (docs/SETUP.md §6, CLAUDE.md regla 8). Sin
  // `loading.tsx` en el segmento para que ese redirect llegue antes del primer
  // flush, igual que en `/account` — AC2.
  await auth.protect();

  return (
    <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)] py-[clamp(2rem,5vw,3.5rem)]">
      <header className="mb-[clamp(1.75rem,4vw,2.75rem)]">
        <h1 className="text-[clamp(1.875rem,4.3vw,3rem)] leading-[1.08] font-semibold tracking-[-0.035em]">
          Finalizar compra
        </h1>
        <p className="text-muted-foreground mt-3 max-w-[56ch] text-[15px] leading-relaxed">
          Revisa lo que llevas. El pago y la dirección de envío se completan en la página segura de
          Stripe.
        </p>

        {/* Decorativo y en el servidor: dónde está el usuario dentro de la compra ya
            lo sabe la propia ruta, así que no necesita estado ni cliente. */}
        <div className="mt-6">
          <CheckoutStepper />
        </div>
      </header>

      {/* El carrito vive en el navegador, así que el resumen es cliente. La page se
          queda con lo único que necesita el servidor: comprobar la sesión. */}
      <CheckoutSummary />
    </div>
  );
}
