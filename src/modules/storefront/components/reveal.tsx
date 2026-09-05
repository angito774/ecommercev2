'use client';

import { motion } from 'motion/react';
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
//
// Sin rama por `useReducedMotion()`: ese hook resuelve `matchMedia` de forma
// síncrona en el primer render del cliente (no en un efecto), mientras que en
// el servidor vale `null`. Ramificar el árbol con ese valor hacía que el primer
// render del cliente no coincidiera con el HTML del servidor cuando el sistema
// operativo tiene activado el movimiento reducido, y React descartaba el
// subárbol entero al hidratar. `reducedMotion="user"` en `MotionProvider` ya
// desactiva las transformaciones para todo `motion.*` sin que cada componente
// tenga que comprobarlo, y la media query de `globals.css` sobre `[data-reveal]`
// cubre el resto sin depender de JavaScript.
export function Reveal({ children, className, delay = 0 }: RevealProps) {
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
