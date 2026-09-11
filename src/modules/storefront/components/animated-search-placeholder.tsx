'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

// Sugerencias del disparador de búsqueda. Fijas y no derivadas del catálogo: son
// una invitación a buscar, no resultados, y pedirlas al servidor añadiría una
// consulta al render del header por un texto de relleno.
const PHRASES = [
  'Buscar productos',
  'Prueba con «laptop gamer»',
  'Prueba con «monitor 27»',
  'Prueba con «ssd nvme»',
] as const;

const ROTATE_MS = 3200;

// El texto rota, pero el PRIMER render —servidor y cliente— pinta siempre
// `PHRASES[0]`: el índice solo avanza dentro del efecto, que corre después de
// hidratar. Arrancar la rotación durante el render haría que el HTML del servidor
// y el primer render del cliente no coincidieran.
//
// `useReducedMotion()` se lee, pero no ramifica el árbol: solo decide si el
// intervalo llega a montarse. Ramificar con él en el render es exactamente lo que
// rompía la hidratación en `reveal.tsx`.
export function AnimatedSearchPlaceholder() {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const interval = setInterval(
      () => setIndex((current) => (current + 1) % PHRASES.length),
      ROTATE_MS,
    );
    return () => clearInterval(interval);
  }, [reduced]);

  return <span className="flex-1 truncate text-left">{PHRASES[index] ?? PHRASES[0]}</span>;
}
