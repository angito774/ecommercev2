import { Show, SignInButton } from '@clerk/nextjs';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { APP_DESCRIPTION, APP_NAME } from '@/lib/constants';

export default function HomePage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-24">
      <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{APP_NAME}</h1>
      <p className="text-muted-foreground max-w-prose text-lg">{APP_DESCRIPTION}</p>

      {/* Antes este botón apuntaba a /products, que no existe: la portada llevaba
          a la página de "no encontrada". Mientras el catálogo sea Fase 2, la única
          acción real es entrar al panel, y para eso hace falta sesión. */}
      <Show when="signed-in">
        <Button asChild size="lg">
          <Link href="/admin/categories">Ir al panel de administración</Link>
        </Button>
      </Show>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <Button size="lg">Iniciar sesión</Button>
        </SignInButton>
        <p className="text-muted-foreground text-sm">
          El catálogo público llega en la Fase 2.
        </p>
      </Show>
    </section>
  );
}
