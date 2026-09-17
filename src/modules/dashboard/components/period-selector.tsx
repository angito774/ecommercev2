'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import { PERIOD_LABELS } from '../constants';
import { DASHBOARD_PERIODS, type DashboardPeriod } from '../schemas/dashboard.schema';

type PeriodSelectorProps = {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
};

// Las opciones se derivan de `DASHBOARD_PERIODS`, no se escriben aquí: el schema es
// el único sitio donde vive la lista, así que añadir `90d` no obliga a tocar la UI.
export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      onValueChange={(next) => {
        // Radix manda cadena vacía al pulsar la opción ya activa. El dashboard
        // siempre tiene un período, así que esa deselección se ignora en vez de
        // dejar la vista sin rango; `find` además estrecha el tipo sin castear.
        const selected = DASHBOARD_PERIODS.find((period) => period === next);
        if (selected) onChange(selected);
      }}
      aria-label="Período de las métricas"
    >
      {DASHBOARD_PERIODS.map((period) => (
        <ToggleGroupItem key={period} value={period}>
          {PERIOD_LABELS[period]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
