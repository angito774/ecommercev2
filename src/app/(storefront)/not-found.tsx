import { ArrowRight, PackageSearch } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

// 404 propio del segmento, no el de la raíz. El de la raíz se renderiza fuera del
// layout del storefront: el visitante perdería header, buscador, carrito y footer
// justo cuando más necesita seguir navegando, y saldría con la paleta neutra del
// panel porque no lleva `data-surface="storefront"` (spec 005, D-5).
export default function StorefrontNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col items-center gap-4 px-[clamp(1rem,4vw,2rem)] py-[clamp(4rem,12vw,8rem)] text-center">
      <span className="bg-nx-accent-soft text-primary grid size-16 place-items-center rounded-full">
        <PackageSearch className="size-7" aria-hidden />
      </span>

      <h1 className="text-[clamp(1.75rem,5vw,2.75rem)] font-semibold tracking-[-0.035em]">
        Este producto no está en el catálogo
      </h1>
      <p className="text-muted-foreground max-w-[52ch] text-[15px] leading-relaxed">
        La página que buscas no existe, o el producto ha dejado de publicarse. El resto del
        catálogo sigue disponible.
      </p>

      <div className="mt-3 flex flex-wrap justify-center gap-3">
        <Button asChild className="nx-shadow-accent h-12 rounded-full px-6">
          <Link href="/#catalogo">
            Ver el catálogo
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-nx-line h-12 rounded-full px-6"
        >
          <Link href="/">Volver a la portada</Link>
        </Button>
      </div>
    </div>
  );
}
