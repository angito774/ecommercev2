import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/constants';

export function SiteHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          {APP_NAME}
        </Link>

        {/* Sin enlaces a /products ni /orders: esas rutas no existen todavía
            —productos es la Fase 2 y pedidos no está en ningún spec— y un enlace
            que lleva a la página de "no encontrada" es peor que no tenerlo.
            Vuelven cuando exista el catálogo. */}
        <nav className="text-muted-foreground hidden gap-4 text-sm sm:flex">
          <Show when="signed-in">
            <Link href="/admin/categories" className="hover:text-foreground transition-colors">
              Administración
            </Link>
          </Show>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">
                Iniciar sesión
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">Crear cuenta</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
