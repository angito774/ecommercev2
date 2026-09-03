'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

type RevealProps = {
  children: ReactNode;
  className?: string;
  // Escalona la entrada de los hijos de una rejilla sin que cada tarjeta tenga que
  // saber su posición: el llamador pasa su índice.
  delay?: number;
};

// Pass-through: el hijo se renderiza tal cual —puede seguir siendo un Server
// Component— y este envoltorio solo aporta el `div` animado. Es el `div`
// contenedor y nunca un `<svg>`, por la regla `rendering-animate-svg-wrapper`.
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reduced = useReducedMotion();

  // `data-reveal` va en las DOS ramas y es la parte que de verdad cumple AC16.
  // `useReducedMotion()` devuelve false en el servidor, así que el HTML se emite
  // igualmente con `opacity:0; transform:translateY(18px)` inline; solo al hidratar
  // se sabe la preferencia real. Si el usuario la tiene activa y algo impide la
  // hidratación, ese estilo inline dejaría el contenido invisible para siempre.
  // La media query de globals.css lo neutraliza a través de este atributo, sin
  // depender de que corra JavaScript.
  if (reduced) {
    return (
      <div data-reveal className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      data-reveal
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      // `once` evita que la animación se rearme al volver a subir, que además de
      // molestar mantiene vivo el observer toda la sesión.
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
