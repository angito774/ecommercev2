import { CreditCard, RotateCcw, ShieldCheck, Truck } from 'lucide-react';

import { Reveal } from './reveal';
import { Eyebrow } from './section-heading';

// Contenido estático de marca: son promesas comerciales, no datos de la base, y por
// eso viven en el componente y no en una tabla.
const FEATURES = [
  {
    icon: Truck,
    title: 'Envío en 24 h',
    body: 'Almacén propio en Lima. Los pedidos confirmados antes de las 18:00 salen el mismo día.',
  },
  {
    icon: ShieldCheck,
    title: 'Garantía de 2 años',
    body: 'Oficial del fabricante y gestionada por nosotros, sin reenvíos ni intermediarios.',
  },
  {
    icon: RotateCcw,
    title: '30 días para devolver',
    body: 'Lo abres, lo pruebas y si no te convence lo recogemos en casa sin coste.',
  },
  {
    icon: CreditCard,
    title: 'Pago en cuotas',
    body: 'Financiación transparente con las principales tarjetas, aprobada al momento.',
  },
] as const;

export function FeaturesSection() {
  return (
    <section
      id="ventajas"
      className="border-border bg-nx-inset scroll-mt-24 border-y py-[clamp(3.75rem,8.5vw,7.25rem)]"
    >
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)]">
        <div className="mb-[clamp(2rem,4vw,3.25rem)]">
          <Eyebrow>Por qué aquí</Eyebrow>
          <h2 className="text-[clamp(1.875rem,4.3vw,3.125rem)] font-semibold">
            Comprar tecnología,
            <br />
            sin la letra pequeña
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4.5">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 0.06}>
              <article className="border-border bg-card hover:border-nx-line hover:nx-shadow-md h-full rounded-[22px] border p-6 transition-[border-color,box-shadow]">
                <span className="bg-nx-accent-soft text-primary mb-4.5 grid size-11 place-items-center rounded-xl">
                  <feature.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mb-2.5 text-[17px] font-semibold tracking-[-0.025em]">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
