import { Star } from 'lucide-react';

const MAX_STARS = 5;

type StarRatingProps = {
  // `null` significa «este producto no tiene valoración», no «cero estrellas»:
  // con `null` el componente no renderiza nada. Hoy no existe tabla `reviews`,
  // así que la tarjeta pasa un valor fijo y esto es decoración declarada; el día
  // que haya reseñas basta con pasar la media real.
  value: number | null;
  className?: string;
};

// Sin `"use client"`: son cinco iconos y ningún manejador. La tarjeta que lo usa
// tiene que poder seguir siendo un Server Component.
//
// El contenedor va `aria-hidden` y sin texto alternativo a propósito: anunciar
// «5 de 5 estrellas» afirmaría ante un lector de pantalla un dato que no existe.
export function StarRating({ value, className }: StarRatingProps) {
  if (value === null) return null;

  const filled = Math.round(Math.min(MAX_STARS, Math.max(0, value)));

  return (
    <div className={`flex items-center gap-0.5 ${className ?? ''}`} aria-hidden>
      {Array.from({ length: MAX_STARS }, (_, index) => (
        <Star
          key={index}
          className={
            index < filled ? 'fill-nx-hot text-nx-hot size-3.5' : 'text-nx-faint size-3.5'
          }
        />
      ))}
    </div>
  );
}
