'use client';

import { useEffect, useRef } from 'react';

// Barra de progreso de lectura de la ficha de producto.
//
// `aria-hidden` y sin `role="progressbar"`: el progreso de scroll ya lo comunica
// la barra del propio navegador, y anunciarlo otra vez solo añade ruido a un
// lector de pantalla. Es decoración.
//
// Sin estado de React: el ancho se escribe directamente sobre el nodo desde un
// `requestAnimationFrame`. Guardar el progreso en `useState` provocaría un
// render por evento de scroll —cientos por pantalla— para animar una única
// propiedad CSS (regla `rerender-use-ref-transient-values`).
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;

    const paint = () => {
      frame = 0;
      const node = barRef.current;
      if (!node) return;

      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      // Documento más corto que el viewport: sin recorrido no hay progreso que
      // pintar, y dividir por cero daría `Infinity`.
      const progress = scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0;
      node.style.transform = `scaleX(${progress})`;
    };

    const onScroll = () => {
      // Un solo repintado por frame: sin esta guarda, el navegador dispara el
      // evento muchas más veces de las que puede pintar.
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5" aria-hidden>
      <div
        ref={barRef}
        className="bg-primary h-full w-full origin-left"
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  );
}
