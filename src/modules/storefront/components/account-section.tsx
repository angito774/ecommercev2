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
// solo aporta el ancla, el encabezado y el espaciado. `scroll-mt-24` es lo que evita
// que el header pegajoso tape el título al saltar desde el rail (AC10).
export function AccountSection({ id, eyebrow, title, children }: AccountSectionProps) {
  const headingId = `${id}-titulo`;

  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-24">
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
