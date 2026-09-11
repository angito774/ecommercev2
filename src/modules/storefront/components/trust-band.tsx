import { Lock, RotateCcw, ShieldCheck, Truck } from 'lucide-react';

// Las mismas cuatro afirmaciones que ya hacen `FeaturesSection`, la barra de avisos
// y el pie del carrito, resumidas a su etiqueta. Ninguna promesa nueva escrita para
// esta banda (spec 012, D-8).
const BENEFITS = [
  { icon: Truck, label: 'Envío en 24 h' },
  { icon: ShieldCheck, label: 'Garantía de 2 años' },
  { icon: RotateCcw, label: '30 días para devolver' },
  { icon: Lock, label: 'Pago seguro con Stripe' },
] as const;

// Server Component: iconos y texto fijo. `bg-primary` y no un color escrito a mano,
// así que hereda el acento de la tienda en los dos temas (AC12).
export function TrustBand() {
  return (
    <div className="bg-primary text-primary-foreground">
      <ul className="mx-auto grid w-full max-w-[1240px] grid-cols-2 gap-x-4 gap-y-3 px-[clamp(1rem,4vw,2rem)] py-4 lg:grid-cols-4">
        {BENEFITS.map((benefit) => (
          <li key={benefit.label} className="flex items-center gap-2.5 text-[13.5px] font-medium">
            <benefit.icon className="size-4 shrink-0" aria-hidden />
            {benefit.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
