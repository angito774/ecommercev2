import { Truck } from 'lucide-react';

// Promesa logística de la tarjeta. No es una afirmación nueva: la ficha de
// producto ya dice «Envío en 24 h en pedidos antes de las 18:00»; esto la
// adelanta a la rejilla.
//
// `text-nx-on-accent` y no un blanco literal: `--nx-ok` es verde oscuro en claro
// y lima en oscuro, así que un color fijo dejaría el texto ilegible en uno de los
// dos temas. `--nx-on-accent` se invierte con el tema por construcción (AC12).
export function LogisticsBadge() {
  return (
    // `pointer-events-none` como el badge de descuento: es una etiqueta, no un
    // control, y sin esto taparía el enlace extendido de la tarjeta justo en la
    // esquina donde se pinta.
    <span className="bg-nx-ok text-nx-on-accent pointer-events-none inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold">
      <Truck className="size-3" aria-hidden />
      Envío 24h
    </span>
  );
}
