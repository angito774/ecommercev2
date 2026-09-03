'use client';

import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

// Frontera de error del storefront. Las lecturas de la portada y del layout van
// directas al repositorio desde Server Components, así que un fallo de Neon lanza
// durante el render y sin este archivo el visitante vería la pantalla genérica de
// Next. CLAUDE.md §6 exige estado de error en toda vista que consuma datos, y aquí
// el consumo es de servidor.
export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // El mensaje real no se le enseña al visitante —puede llevar detalles de la
    // conexión—, pero tiene que quedar en el log del servidor para diagnosticar.
    console.error('Error en el storefront', error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col items-center gap-4 px-[clamp(1rem,4vw,2rem)] py-28 text-center">
      <span className="bg-secondary text-destructive grid size-16 place-items-center rounded-full">
        <TriangleAlert className="size-7" aria-hidden />
      </span>

      <h1 className="text-[clamp(1.5rem,4vw,2.25rem)] font-semibold">
        No pudimos cargar la tienda
      </h1>
      <p className="text-muted-foreground max-w-prose">
        Ha fallado la conexión con el catálogo. No es culpa tuya: inténtalo de nuevo en unos
        segundos.
      </p>

      {/* `reset()` reintenta el render del segmento sin recargar la página entera,
          que es lo que hace falta cuando el fallo fue transitorio. */}
      <Button onClick={reset} className="mt-2 h-12 rounded-full px-6">
        <RefreshCw className="size-4" aria-hidden />
        Reintentar
      </Button>

      {error.digest ? (
        <p className="text-nx-faint mt-2 text-xs">
          Código de error: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}
