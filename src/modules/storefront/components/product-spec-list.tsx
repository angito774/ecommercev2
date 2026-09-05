import type { CatalogProductDetail } from '@/modules/products/types/catalog.types';

// Lista de definición y no una tabla: son pares clave/valor de un solo objeto, no
// una matriz de filas comparables. Las líneas finas entre filas son el dispositivo
// estructural de la ficha, y sostienen contenido real —lo que el panel redactó—,
// no decoración (spec 005, D-14).
//
// Devuelve `null` con `specs` nulo o vacío: un encabezado sobre una lista vacía es
// peor que no tener sección (AC7).
export function ProductSpecList({ specs }: { specs: CatalogProductDetail['specs'] }) {
  const entries = specs ? Object.entries(specs) : [];
  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="ficha-tecnica" className="mt-2">
      <h2
        id="ficha-tecnica"
        className="text-nx-faint mb-1 text-xs font-semibold tracking-[0.15em] uppercase"
      >
        Ficha técnica
      </h2>

      <dl className="text-[14.5px]">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="border-border grid grid-cols-[minmax(7rem,38%)_1fr] gap-4 border-b py-3 last:border-b-0"
          >
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
