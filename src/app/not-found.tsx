import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <p className="text-muted-foreground">El recurso que buscas no existe o fue movido.</p>
      <Button asChild>
        <Link href="/">Volver al inicio</Link>
      </Button>
    </main>
  );
}
