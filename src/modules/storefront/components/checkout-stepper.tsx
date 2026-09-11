import { Check } from 'lucide-react';

const STEPS = ['Carrito', 'Pago', 'Confirmación'] as const;

// El paso vivo es siempre el segundo: `/checkout` es la única pantalla que usa este
// componente, y detrás no hay máquina de estados —el pago sigue siendo un salto
// único a la página alojada de Stripe (spec 012, §5).
const CURRENT_STEP = 2;

// Decoración de proceso, no navegación: los pasos no son enlaces ni botones porque
// prometerían un checkout multi-paso que no existe. `<ol>` con `aria-current="step"`
// es lo que comunica dónde está el usuario sin inventar controles (AC10).
export function CheckoutStepper() {
  return (
    <nav aria-label="Progreso de la compra">
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {STEPS.map((label, index) => {
          const position = index + 1;
          const done = position < CURRENT_STEP;
          const current = position === CURRENT_STEP;

          return (
            <li
              key={label}
              aria-current={current ? 'step' : undefined}
              className="flex items-center gap-3"
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold tabular-nums ${
                  done
                    ? 'bg-nx-accent-soft text-primary'
                    : current
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-nx-faint'
                }`}
              >
                {done ? <Check className="size-4" aria-hidden /> : position}
              </span>

              <span
                className={`text-[14px] ${
                  current ? 'text-foreground font-semibold' : 'text-muted-foreground'
                }`}
              >
                {label}
                {done ? <span className="sr-only"> (completado)</span> : null}
              </span>

              {/* La raya es el vínculo visual entre pasos; tras el último sobra. */}
              {position < STEPS.length ? (
                <span aria-hidden className="bg-border ml-1 h-px w-8 sm:w-14" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
