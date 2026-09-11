'use client';

import { Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';

type QuantitySelectorProps = {
  value: number;
  onChange: (value: number) => void;
  // Tope superior. El panel de compra pasa `MAX_LINE_QUANTITY`, y 1 cuando el
  // producto está agotado: así AC4 no necesita una bandera `disabled` aparte.
  max: number;
};

// Controlado y sin estado propio: quien lo usa ya guarda la cantidad porque la
// necesita para `add(product, quantity)`. Duplicarla aquí dejaría dos fuentes de
// verdad para el mismo número.
//
// El lenguaje visual —píldora, botones de 44 px, `output` con `tabular-nums`— es el
// del stepper del cart drawer a propósito: es el mismo gesto en dos sitios.
export function QuantitySelector({ value, onChange, max }: QuantitySelectorProps) {
  const clamp = (next: number) => Math.min(max, Math.max(1, next));

  return (
    <div
      role="group"
      aria-label="Cantidad"
      className="border-border bg-card flex w-fit items-center gap-0.5 rounded-full border p-0.5"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= 1}
        className="text-muted-foreground size-11 rounded-full"
        aria-label="Reducir la cantidad"
      >
        <Minus className="size-4" aria-hidden />
      </Button>

      <output className="min-w-8 text-center text-[15px] font-semibold tabular-nums">
        {value}
      </output>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className="text-muted-foreground size-11 rounded-full"
        aria-label="Aumentar la cantidad"
      >
        <Plus className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
