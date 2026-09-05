import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

type AccountEmptyProps = {
  icon: LucideIcon;
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
};

// Una pantalla vacía es un sitio donde dirigir, no donde disculparse: por eso el CTA
// al catálogo es obligatorio y no opcional en las props (spec 006, D-9).
//
// Reutiliza el cuadro suave con icono de `FeaturesSection` en vez de abrir un
// lenguaje visual nuevo para dos bloques que desaparecen cuando lleguen favoritos y
// pedidos de verdad.
export function AccountEmpty({ icon: Icon, title, body, ctaHref, ctaLabel }: AccountEmptyProps) {
  return (
    <div className="border-border bg-card flex flex-col items-start gap-4 rounded-[22px] border p-[clamp(1.5rem,4vw,2.5rem)]">
      <span className="bg-nx-accent-soft text-primary grid size-11 place-items-center rounded-xl">
        <Icon className="size-5" aria-hidden />
      </span>

      <div className="space-y-2">
        <h3 className="text-[17px] font-semibold tracking-[-0.025em]">{title}</h3>
        <p className="text-muted-foreground max-w-[52ch] text-sm leading-relaxed">{body}</p>
      </div>

      <Button asChild className="mt-1 h-11 rounded-full px-5">
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}
