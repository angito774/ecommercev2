'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

import { scrollBehavior } from '../lib/motion';

// Margen de tolerancia en píxeles para decidir si el carril está en un extremo. Sin
// él, un `scrollLeft` fraccionario —zoom del navegador, densidad de pantalla— deja
// la flecha habilitada al final sin nada que desplazar.
const EDGE_TOLERANCE_PX = 2;

// Cuánto avanza cada pulsación: casi un "pantallazo", dejando a la vista una tarjeta
// de la anterior para no perder el hilo.
const SCROLL_RATIO = 0.9;

type CarouselTrackProps = {
  children: ReactNode;
  // Nombre accesible de los dos controles: "Ver más de Laptops" es más útil que
  // "Anterior" suelto cuando hay varios carruseles en la misma página.
  label: string;
};

// Pass-through, igual que `Reveal`: los hijos se renderizan tal cual y pueden seguir
// siendo Server Components. Aquí solo vive el desplazamiento, que es lo único que
// necesita el navegador (spec 012, §8).
//
// Scroll nativo con `scroll-snap` en vez de `translateX` con índice: rueda, trackpad,
// arrastre táctil y recorrido con Tab funcionan sin escribir una línea. Las flechas
// solo llaman a `scrollBy`.
export function CarouselTrack({ children, label }: CarouselTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const syncEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const maxScroll = track.scrollWidth - track.clientWidth;
    setAtStart(track.scrollLeft <= EDGE_TOLERANCE_PX);
    // Si la lista cabe entera, `maxScroll` es 0 y las dos flechas quedan
    // deshabilitadas, que es exactamente lo que corresponde.
    setAtEnd(track.scrollLeft >= maxScroll - EDGE_TOLERANCE_PX);
  }, []);

  useEffect(() => {
    syncEdges();

    // El ancho del carril cambia al girar el móvil o al redimensionar, y con él
    // cambia si sobra contenido por desplazar.
    window.addEventListener('resize', syncEdges);
    return () => window.removeEventListener('resize', syncEdges);
  }, [syncEdges]);

  const scrollByPage = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;

    track.scrollBy({
      left: direction * track.clientWidth * SCROLL_RATIO,
      behavior: scrollBehavior(),
    });
  };

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => scrollByPage(-1)}
          disabled={atStart}
          className="size-11 rounded-full"
          aria-label={`Ver los productos anteriores de ${label}`}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => scrollByPage(1)}
          disabled={atEnd}
          className="size-11 rounded-full"
          aria-label={`Ver los productos siguientes de ${label}`}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      {/* Sin `tabindex`: las tarjetas ya llevan enlaces, así que el carril se recorre
          con Tab y el navegador desplaza solo al enfocar la siguiente. Añadir una
          parada extra solo haría tabular dos veces en el mismo sitio.

          El ancho de cada hijo se fija desde aquí con `[&>*]`: así `ProductCard` no
          tiene que saber que está dentro de un carrusel. El `py` deja sitio a la
          elevación del hover y al anillo de foco, que `overflow-x` recortaría. */}
      <div
        ref={trackRef}
        onScroll={syncEdges}
        className="-mx-1.5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1.5 py-2 xl:gap-5 [&>*]:w-[clamp(13.75rem,68vw,16.75rem)] [&>*]:shrink-0 [&>*]:snap-start"
      >
        {children}
      </div>
    </div>
  );
}
