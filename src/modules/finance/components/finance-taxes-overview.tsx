'use client';

import { useCallback, useMemo, useState } from 'react';

import { useFinanceTaxes } from '../hooks/use-finance-taxes';
import { currentMonthRange } from '../lib/finance-range';
import type { FinanceRange } from '../types/finance.types';

import { FinanceRangeFilter } from './finance-range-filter';
import { FinanceTaxesCards } from './finance-taxes-cards';

export function FinanceTaxesOverview() {
  // El mes en curso se resuelve una vez en el montaje: recalcularlo en cada render
  // devolvería un objeto nuevo y reiniciaría la consulta en bucle.
  const currentMonth = useMemo(() => currentMonthRange(new Date()), []);

  // Un solo consumidor y muere al desmontar: no es estado global ni de URL.
  const [range, setRange] = useState<FinanceRange>(currentMonth);

  const query = useFinanceTaxes(range);

  const onRetry = useCallback(() => void query.refetch(), [query]);

  return (
    <div className="space-y-6">
      {/* El mismo filtro que el resumen y no otro (D-9): aquí el rango significa
          exactamente lo mismo, y un rango invertido no llega a pedirse (AC24). */}
      <FinanceRangeFilter value={range} onChange={setRange} currentMonth={currentMonth} />

      <FinanceTaxesCards
        taxes={query.data?.data}
        // `isPending` y no `isFetching`: con `keepPreviousData`, cambiar de rango sigue
        // mostrando las cifras anteriores en vez de saltar a los esqueletos. Solo la
        // primera carga es un esqueleto (AC23).
        isLoading={query.isPending}
        isError={query.isError}
        message={query.error?.message}
        onRetry={onRetry}
      />
    </div>
  );
}
