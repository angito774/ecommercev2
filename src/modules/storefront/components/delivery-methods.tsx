import { Store, Truck } from 'lucide-react';

// Decorativo y así está documentado en el spec 012, §5: no hay modelo de tiendas ni
// de cobertura logística detrás, así que el badge es fijo para todos los productos y
// no promete una disponibilidad calculada que nadie calcula.
const METHODS = [
  {
    icon: Truck,
    title: 'Despacho a domicilio',
    body: 'Lima en 24 h y provincias en 2–4 días hábiles.',
  },
  {
    icon: Store,
    title: 'Retiro en tienda',
    body: 'Listo para recoger el mismo día en nuestro almacén de Lima.',
  },
] as const;

// Server Component: es texto fijo con iconos. `.nx-hover-lift` viene de globals.css
// (spec 011) y ya trae su propia neutralización bajo reduced-motion.
export function DeliveryMethods() {
  return (
    <section aria-labelledby="entrega" className="mt-2">
      <h2
        id="entrega"
        className="text-nx-faint mb-3 text-xs font-semibold tracking-[0.15em] uppercase"
      >
        Entrega
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {METHODS.map((method) => (
          <article
            key={method.title}
            className="nx-hover-lift border-border bg-card hover:border-nx-line rounded-[18px] border p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="bg-nx-accent-soft text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                <method.icon className="size-5" aria-hidden />
              </span>
              <span className="bg-nx-ok/12 text-nx-ok rounded-full px-2.5 py-1 text-[11.5px] font-semibold">
                Disponible
              </span>
            </div>
            <h3 className="mt-3.5 text-[15px] font-semibold tracking-[-0.02em]">{method.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-[13.5px] leading-relaxed">
              {method.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
