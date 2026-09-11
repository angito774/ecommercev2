import { Check, type LucideIcon } from 'lucide-react';

import type { CatalogProductDetail } from '@/modules/products/types/catalog.types';

import { STORE_GUARANTEES } from '../constants';

// Cuántas specs suben al resumen. Más de cuatro y deja de ser un vistazo rápido: la
// lista completa ya está más abajo, en `ProductSpecList`.
const MAX_HIGHLIGHTS = 4;

type Highlight = { icon: LucideIcon; text: string };

// Los bullets salen de `product.specs`, que es dato estructurado real, y no de
// partir la descripción por comas: eso produciría frases cortadas (spec 012, §5).
//
// Sin rama de `null`: el fallback son las dos garantías de la tienda, que siempre
// existen, así que la sección nunca se queda sin nada que decir.
export function ProductHighlights({ specs }: { specs: CatalogProductDetail['specs'] }) {
  const fromSpecs: Highlight[] = (specs ? Object.entries(specs) : [])
    .slice(0, MAX_HIGHLIGHTS)
    .map(([key, value]) => ({ icon: Check, text: `${key}: ${value}` }));

  const highlights: Highlight[] =
    fromSpecs.length > 0 ? fromSpecs : STORE_GUARANTEES.map((item) => ({ ...item }));

  return (
    <section aria-labelledby="destacado" className="mt-1">
      <h2
        id="destacado"
        className="text-nx-faint mb-3 text-xs font-semibold tracking-[0.15em] uppercase"
      >
        Lo que destaca
      </h2>

      <ul className="grid gap-2.5 sm:grid-cols-2">
        {highlights.map((highlight) => (
          <li
            key={highlight.text}
            className="border-border bg-card flex items-start gap-2.5 rounded-2xl border p-3 text-[13.5px] leading-relaxed"
          >
            <span className="bg-nx-accent-soft text-primary mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg">
              <highlight.icon className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0">{highlight.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
