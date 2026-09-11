'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

import { currentMonthRange, dayRange, toDayInputValue } from '../lib/order-history-range';
import type { OrderHistoryRange } from '../types/order.types';

type OrderHistoryFilterProps = {
  onChange: (range: OrderHistoryRange) => void;
};

type FilterMode = 'current-month' | 'range';

const INVALID_RANGE_MESSAGE = 'La fecha inicial no puede ser posterior a la final.';

// Los dos días de partida del modo rango: el mes en curso, que es lo que el
// cliente acaba de ver. Empezar con los campos vacíos obligaría a rellenar dos
// fechas antes de poder pulsar nada.
function currentMonthDays(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);

  return { from: toDayInputValue(first), to: toDayInputValue(now) };
}

// Campos de fecha nativos, no un calendario de react-day-picker: dos fechas no
// justifican una dependencia nueva, y el control del sistema ya es accesible,
// localizado y táctil (D-12).
//
// El estado vive aquí y no en un store: tiene un solo consumidor y muere al
// desmontar la sección (D-9). El padre solo recibe el rango ya resuelto.
export function OrderHistoryFilter({ onChange }: OrderHistoryFilterProps) {
  const [mode, setMode] = useState<FilterMode>('current-month');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');

  // Comparación de cadenas y no de fechas: `YYYY-MM-DD` ordena lexicográficamente
  // igual que cronológicamente, así que no hace falta parsear para saberlo.
  const invalid = fromDay !== '' && toDay !== '' && fromDay > toDay;
  const incomplete = fromDay === '' || toDay === '';

  function selectCurrentMonth() {
    setMode('current-month');
    onChange(currentMonthRange());
  }

  function selectRange() {
    const days = currentMonthDays();
    setFromDay(days.from);
    setToDay(days.to);
    setMode('range');
  }

  function apply() {
    // La guarda de AC6: con el rango invertido no se dispara la consulta. El botón
    // ya está deshabilitado, pero un submit por teclado no debe colarse.
    if (invalid || incomplete) return;
    onChange(dayRange(fromDay, toDay));
  }

  return (
    <div className="border-border bg-card mb-6 rounded-[22px] border p-[clamp(1rem,3vw,1.5rem)]">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo del historial">
        <ModeChip
          active={mode === 'current-month'}
          onClick={selectCurrentMonth}
          label="Este mes"
        />
        <ModeChip active={mode === 'range'} onClick={selectRange} label="Rango de fechas" />
      </div>

      {mode === 'range' ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <DayField id="compras-desde" label="Desde" value={fromDay} onChange={setFromDay} />
          <DayField id="compras-hasta" label="Hasta" value={toDay} onChange={setToDay} />

          <Button
            onClick={apply}
            disabled={invalid || incomplete}
            className="h-11 rounded-full px-5"
          >
            Aplicar
          </Button>

          {invalid ? (
            // `role="alert"` y no un toast: el error pertenece a estos dos campos y
            // tiene que seguir visible mientras el rango siga invertido.
            <p role="alert" className="text-destructive w-full text-sm">
              {INVALID_RANGE_MESSAGE}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ModeChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // 44 px de alto: objetivo táctil mínimo de AC16.
      className={`h-11 shrink-0 rounded-full border px-4 text-[13.5px] font-medium transition-colors ${
        active
          ? 'bg-foreground text-background border-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-nx-line hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function DayField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-muted-foreground text-xs font-medium">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-border bg-background focus-visible:ring-ring/50 h-11 rounded-full border px-4 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
      />
    </div>
  );
}
