'use client';

import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { FinanceRange } from '../types/finance.types';

type FinanceRangeFilterProps = {
  /** El rango aplicado, que manda: los inputs son un borrador sobre él. */
  value: FinanceRange;
  onChange: (range: FinanceRange) => void;
  /** Mes en curso en Lima, ya resuelto por el contenedor. */
  currentMonth: FinanceRange;
};

// `<input type="date">` nativo: dos fechas no justifican traer `react-day-picker`, y el
// control del navegador ya es accesible y está localizado. Precedente:
// `admin-order-filters.tsx`.
export function FinanceRangeFilter({ value, onChange, currentMonth }: FinanceRangeFilterProps) {
  // Borrador y aplicado por separado: teclear una fecha no dispara una consulta por
  // cada dígito, y mientras se escribe «2026-01-» el rango está a medias.
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);

  // El rango invertido no llega a pedirse: el endpoint respondería 400 y quien filtra
  // vería un error por algo que la UI ya sabe (AC5). Los `min`/`max` lo evitan con el
  // ratón; esto cubre el teclado y el pegado.
  const isInverted = draftFrom !== '' && draftTo !== '' && draftFrom > draftTo;
  const isDirty = draftFrom !== value.from || draftTo !== value.to;
  const isCurrentMonth = value.from === currentMonth.from && value.to === currentMonth.to;

  function apply() {
    onChange({ from: draftFrom, to: draftTo });
  }

  function resetToCurrentMonth() {
    setDraftFrom(currentMonth.from);
    setDraftTo(currentMonth.to);
    onChange(currentMonth);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="finance-from">Desde</Label>
          <Input
            id="finance-from"
            type="date"
            value={draftFrom}
            max={draftTo === '' ? undefined : draftTo}
            onChange={(event) => setDraftFrom(event.target.value)}
            aria-invalid={isInverted}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="finance-to">Hasta</Label>
          <Input
            id="finance-to"
            type="date"
            value={draftTo}
            min={draftFrom === '' ? undefined : draftFrom}
            onChange={(event) => setDraftTo(event.target.value)}
            aria-invalid={isInverted}
            className="w-40"
          />
        </div>

        <Button
          variant="outline"
          disabled={isInverted || !isDirty || draftFrom === '' || draftTo === ''}
          onClick={apply}
        >
          Aplicar
        </Button>

        {isCurrentMonth && !isDirty ? null : (
          <Button variant="ghost" size="sm" onClick={resetToCurrentMonth}>
            <RotateCcw className="size-4" aria-hidden />
            Mes en curso
          </Button>
        )}
      </div>

      {isInverted ? (
        <p className="text-destructive text-sm" role="alert">
          La fecha inicial no puede ser posterior a la final.
        </p>
      ) : null}
    </div>
  );
}
