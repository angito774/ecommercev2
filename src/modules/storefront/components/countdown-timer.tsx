'use client';

import { useEffect, useState } from 'react';

import { prefersReducedMotion } from '../lib/motion';

// DECORATIVO Y DECLARADO. No existe `discount_ends_at` en `products`: el objetivo es
// siempre las 23:59:59 del día en curso y se recalcula solo al recargar. No hay
// ninguna promoción que caduque de verdad a esa hora (spec 013, §5). El día que la
// tabla tenga una fecha real, este componente recibe el instante por prop y deja de
// ser decoración; hasta entonces la urgencia honesta la sigue dando `stockLevel`.

// Primer render sin números: calcular el tiempo restante durante el SSR daría un
// valor distinto al del cliente y React descartaría el subárbol al hidratar
// (spec 013, §8; el mismo fallo del commit 6f20f2a).
const PLACEHOLDER = ['--', '--', '--'] as const;

const UNITS = ['h', 'min', 's'] as const;

function remainingParts(now: Date): string[] {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const seconds = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));

  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(
    (part) => String(part).padStart(2, '0'),
  );
}

export function CountdownTimer() {
  const [parts, setParts] = useState<readonly string[]>(PLACEHOLDER);

  useEffect(() => {
    const tick = () => {
      const next = remainingParts(new Date());
      setParts(next);
      return next;
    };

    // Una lectura inmediata para que los guiones no se queden un segundo en
    // pantalla, y ya fuera del render: aquí el cliente puede leer el reloj sin
    // contradecir al HTML del servidor.
    if (tick().every((part) => part === '00')) return;

    // `matchMedia` se consulta en el efecto y nunca durante el render (lib/motion.ts).
    // Con movimiento reducido el contador se queda en el valor de entrada: un número
    // que cambia cada segundo es contenido en movimiento y AC16 no admite ninguno.
    if (prefersReducedMotion()) return;

    const timer = setInterval(() => {
      // Se detiene en 00:00:00 y no reinicia: pasada la medianoche el objetivo del
      // día siguiente solo se recalcula al recargar la página.
      if (tick().every((part) => part === '00')) clearInterval(timer);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2.5">
      {/* Los lectores de pantalla reciben la etiqueta y no el goteo de números: un
          `aria-live` por segundo haría inusable la sección. */}
      <span className="sr-only">Oferta del día</span>

      <div className="flex items-center gap-1.5" aria-hidden>
        {parts.map((part, index) => (
          <span key={UNITS[index]} className="flex items-baseline gap-1">
            <span className="border-border bg-card font-nx-display min-w-[2.4rem] rounded-xl border px-2 py-1.5 text-center text-[17px] font-semibold tabular-nums">
              {part}
            </span>
            <span className="text-nx-faint text-[11px] font-medium">{UNITS[index]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
