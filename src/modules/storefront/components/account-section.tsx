import type { ReactNode } from 'react';

import type { AccountSectionId } from '@/modules/account/constants';

import { Eyebrow } from './section-heading';

type AccountSectionProps = {
  id: AccountSectionId;
  eyebrow: string;
  title: string;
  children: ReactNode;
};

// Envoltura sin conocimiento de qué sección envuelve: recibe su `id` y su copy y
// solo aporta el ancla, el encabezado y el espaciado. El margen de anclaje sale de
// `--nx-header-h` y no de un número fijo: el header pegajoso cambia de alto en `lg`
// y así el título nunca queda tapado al saltar desde el rail (AC10).
export function AccountSection({ id, eyebrow, title, children }: AccountSectionProps) {
  const headingId = `${id}-titulo`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      // Solo el respiro: el alto del header ya lo descuenta el `scroll-padding-top`
      // de `html` en `globals.css`.
      className="scroll-mt-6"
    >
      <div className="mb-[clamp(1.25rem,2.5vw,1.75rem)]">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2
          id={headingId}
          className="text-[clamp(1.375rem,3vw,1.875rem)] font-semibold tracking-[-0.03em]"
        >
          {title}
        </h2>
      </div>

      {children}
    </section>
  );
}
