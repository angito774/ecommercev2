import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

// Representaciones monocromas simplificadas, no los logos oficiales: los de Visa,
// Mastercard y American Express son marcas registradas con condiciones de uso, y
// aquí solo hace falta la señal "se paga con tarjeta". Van inline y sobre
// `currentColor` para que no haya peticiones externas ni un logo a color que se
// pierda contra el fondo en tema oscuro (spec 012, §8).
function CardFrame({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 32 20"
      className="h-5 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="0.75" y="0.75" width="30.5" height="18.5" rx="3.5" />
      {children}
    </svg>
  );
}

export function PaymentIcons({ className }: { className?: string }) {
  return (
    <div className={cn('text-nx-faint flex items-center gap-2', className)}>
      {/* El texto va aquí y los dibujos quedan ocultos: tres SVG decorativos con su
          propio `title` se leerían como tres objetos sueltos en vez de como una
          sola afirmación. */}
      <span className="sr-only">Aceptamos Visa, Mastercard y American Express</span>

      <span aria-hidden className="flex items-center gap-2">
        {/* Visa — la "V" del logotipo, reducida a su trazo. */}
        <CardFrame>
          <path d="M11 7.2l2.7 5.6 2.7-5.6" />
          <path d="M19.4 12.8l1.8-5.6h1.4" />
        </CardFrame>

        {/* Mastercard — los dos círculos entrelazados. */}
        <CardFrame>
          <circle cx="13.6" cy="10" r="3.6" />
          <circle cx="18.4" cy="10" r="3.6" />
        </CardFrame>

        {/* American Express — la "A" del acrónimo. */}
        <CardFrame>
          <path d="M12.4 13l3.1-6 3.1 6" />
          <path d="M13.7 10.9h3.6" />
        </CardFrame>
      </span>
    </div>
  );
}
