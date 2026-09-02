import Link from 'next/link';

import { Button } from '@/components/ui/button';

// Boundary de `forbidden()` (next/navigation). Next la renderiza con status 403,
// que es lo que distingue "estás identificado pero esto no es para ti" de la
// pantalla de error genérica que salía antes al propagarse el ForbiddenError.
export default function Forbidden() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">No tienes permiso</h1>
      <p className="text-muted-foreground max-w-prose">
        Tu cuenta no tiene el permiso necesario para ver esta sección. Si crees que debería
        tenerlo, pídeselo a un administrador.
      </p>
      <Button asChild>
        <Link href="/">Volver al inicio</Link>
      </Button>
    </main>
  );
}
