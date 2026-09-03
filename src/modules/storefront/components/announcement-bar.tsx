import { formatPrice } from '@/modules/products/lib/price';
import { FREE_SHIPPING_THRESHOLD_CENTS } from '@/modules/cart/constants';

import { ANNOUNCEMENTS } from '../constants';

// Server Component: es texto fijo y no necesita nada del navegador. El movimiento
// lo pone `@keyframes` desde globals.css, no Motion, porque un bucle infinito en JS
// ocupa el hilo principal toda la sesión (spec 004, D-4).
export function AnnouncementBar() {
  const messages = [
    `Envío gratis desde ${formatPrice(FREE_SHIPPING_THRESHOLD_CENTS)}`,
    ...ANNOUNCEMENTS,
  ];

  return (
    <div className="bg-foreground text-background flex h-9 items-center overflow-hidden">
      {/* La pista se duplica y la animación traslada un −50 %: al llegar al final,
          la segunda copia está exactamente donde estaba la primera y el bucle no
          tiene costura. `aria-hidden` en la copia para no leerlo dos veces. */}
      <div className="nx-marquee-track flex shrink-0 items-center gap-8 pl-8 text-xs font-medium whitespace-nowrap">
        {messages.map((message) => (
          <Item key={message} text={message} />
        ))}
        {messages.map((message) => (
          <Item key={`copia-${message}`} text={message} aria-hidden />
        ))}
      </div>
    </div>
  );
}

function Item({ text, ...rest }: { text: string; 'aria-hidden'?: boolean }) {
  return (
    <span className="flex items-center gap-8" {...rest}>
      {text}
      <span className="size-[3px] shrink-0 rounded-full bg-current opacity-45" aria-hidden />
    </span>
  );
}
