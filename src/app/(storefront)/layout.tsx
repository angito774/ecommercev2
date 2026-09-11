import { Show } from '@clerk/nextjs';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { AccountMenu } from '@/modules/storefront/components/account-menu';
import { AnnouncementBar } from '@/modules/storefront/components/announcement-bar';
import { MobileBottomNav } from '@/modules/storefront/components/mobile-bottom-nav';
import { MotionProvider } from '@/modules/storefront/components/motion-provider';
import { StorefrontFooter } from '@/modules/storefront/components/storefront-footer';
import { StorefrontHeader } from '@/modules/storefront/components/storefront-header';
import { StorefrontOverlays } from '@/modules/storefront/components/storefront-overlays';
import { getPublicCategoriesForChrome } from '@/server/services/catalog.service';

// El bloque de sesión se renderiza aquí, en el servidor, y baja al header como
// slot: así el header no importa Clerk directamente y el visitante con sesión
// sigue viendo su avatar y el acceso al panel (spec 004, D-15 y AC19).
function AuthSlot() {
  return (
    <>
      <Show when="signed-out">
        {/* Sin modal: el pedido es que "ingresar"/"crear cuenta" lleven a su
            propia vista, no que la abran encima de la página actual. */}
        <Button variant="ghost" size="sm" asChild className="h-11 rounded-full px-4">
          <Link href="/sign-in">Iniciar sesión</Link>
        </Button>
        <Button size="sm" asChild className="hidden h-11 rounded-full px-4 sm:inline-flex">
          <Link href="/sign-up">Crear cuenta</Link>
        </Button>
      </Show>
      <Show when="signed-in">
        <Button variant="ghost" size="sm" asChild className="hidden h-11 rounded-full px-4 lg:inline-flex">
          <Link href="/admin/products">Administración</Link>
        </Button>
        <AccountMenu />
      </Show>
    </>
  );
}

// El footer lista categorías reales. La lectura vive en este componente y no en el
// layout por dos razones:
//
//  1. `error.tsx` no cubre lo que lanza el layout de su propio segmento, solo lo
//     que cuelga por debajo. Con la lectura en el layout, un fallo de Neon devolvía
//     un 500 con el cuerpo vacío. `getPublicCategoriesForChrome()` no puede lanzar.
//  2. Dentro de un `<Suspense>`, el layout deja de bloquear en Neon y la cabecera
//     y la barra de avisos pueden enviarse antes de que responda la base.
//
// La lectura sigue memoizada por request, así que la portada no repite la consulta.
async function FooterSlot() {
  const categories = await getPublicCategoriesForChrome();
  return <StorefrontFooter categories={categories} />;
}

// Sin `async` y sin un solo `await`: es lo que garantiza que este layout no pueda
// lanzar y que `error.tsx` sí atrape los fallos de `page.tsx`.
export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    // `data-surface` es lo que activa la paleta Nexbyte. Todo lo que cuelgue de
    // aquí la hereda; el panel de administración, que no lleva el atributo, se
    // queda con la neutra de shadcn (AC18).
    // El hueco de la barra inferior va en este contenedor y no en el `<main>`, como
    // proponía el spec: el footer se renderiza DESPUÉS de `<main>`, así que un
    // `padding-bottom` allí solo separaría el contenido del pie y dejaría igual de
    // tapada la banda de beneficios al llegar al final del documento. Aquí envuelve
    // a los dos. La altura es la misma de `MobileBottomNav` (3.5rem) más el inset
    // seguro del dispositivo.
    <div
      data-surface="storefront"
      className="flex min-h-full flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"
    >
      <MotionProvider>
        {/* Primer elemento enfocable del documento: con Tab desde la barra de
            direcciones se salta la navegación entera (AC17 / pauta 2.4.1). */}
        <a
          href="#contenido"
          className="bg-primary text-primary-foreground focus:ring-ring sr-only rounded-full px-5 py-3 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[1000] focus:ring-2"
        >
          Saltar al contenido
        </a>

        <AnnouncementBar />
        <StorefrontHeader authSlot={<AuthSlot />} />

        <main id="contenido" className="flex-1">
          {children}
        </main>

        {/* El fallback es el mismo footer sin categorías: ocupa su sitio y no
            provoca salto de layout cuando llega la lista. */}
        <Suspense fallback={<StorefrontFooter categories={[]} />}>
          <FooterSlot />
        </Suspense>
        <StorefrontOverlays />
        {/* Fuera de `StorefrontOverlays`: aquello monta lo que está detrás de un
            clic y puede diferirse, y esta barra se ve desde el primer píxel. */}
        <MobileBottomNav />
      </MotionProvider>
    </div>
  );
}
