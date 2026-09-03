import type { ReactNode } from 'react';

// Antetítulo compartido por las cuatro secciones de la portada. Se extrae aquí y no
// se exporta desde una de ellas para que ninguna sección dependa de otra solo por
// un fragmento de estilo.
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-nx-faint mb-3.5 inline-flex items-center gap-2.5 text-xs font-semibold tracking-[0.15em] uppercase">
      <span className="bg-primary h-px w-[22px]" aria-hidden />
      {children}
    </span>
  );
}
