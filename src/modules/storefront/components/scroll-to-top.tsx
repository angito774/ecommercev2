'use client';

import { ArrowUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { scrollBehavior } from '../lib/motion';

// Por debajo de este umbral el botón estorba más de lo que ayuda: el inicio del
// documento todavía está a un gesto de distancia.
const SHOW_AFTER_PX = 400;

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

// Botón flotante de vuelta al inicio. Se monta una sola vez, junto a los overlays
// diferidos, y no por página: es cromo de la tienda, no de una vista concreta.
export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Solo se guarda el booleano derivado, no `scrollY`: pasar la posición a
    // estado re-renderizaría en cada píxel de scroll, mientras que este `set`
    // con el mismo valor React lo descarta sin volver a renderizar
    // (regla `rerender-derived-state`).
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    // `passive`: nunca llama a preventDefault y sin la marca el navegador espera
    // a que termine el listener antes de desplazar.
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          onClick={scrollToTop}
          aria-label="Volver arriba"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          // `--nx-fab-bottom` en vez de un `bottom-6` fijo: la barra inferior de
          // móvil del spec 013 solo tendrá que redefinir la variable.
          className="nx-shadow-lg border-nx-line bg-card text-foreground hover:bg-secondary fixed right-[clamp(1rem,4vw,2rem)] bottom-[var(--nx-fab-bottom)] z-40 grid size-11 place-items-center rounded-full border transition-colors"
        >
          <ArrowUp className="size-5" aria-hidden />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

// El mismo gesto que el botón flotante, pero en el flujo del pie y siempre visible.
// Vive en este archivo y no en uno propio porque comparte `scrollToTop()`: dos
// copias del mismo manejador acabarían tratando distinto el movimiento reducido.
// Es la única isla cliente que necesita el footer, que sigue siendo Server Component.
export function ScrollTopButton() {
  return (
    <button
      type="button"
      onClick={scrollToTop}
      className="text-muted-foreground hover:text-primary inline-flex min-h-11 items-center gap-2 text-[13px] transition-colors"
    >
      <ArrowUp className="size-4" aria-hidden />
      Subir
    </button>
  );
}
