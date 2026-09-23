'use client';

import { Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

import { useFinanceSummary } from '../hooks/use-finance-summary';
import { currentMonthRange } from '../lib/finance-range';
import type { FinanceRange } from '../types/finance.types';

import { ExpensesByCategory } from './expenses-by-category';
import { ExpensesTable } from './expenses-table';
import { FinanceRangeFilter } from './finance-range-filter';
import { FinanceSummaryCards } from './finance-summary-cards';
import { PeriodProfitCard } from './period-profit-card';
import { UninvoicedOrdersNotice } from './uninvoiced-orders-notice';

const EMPTY_BREAKDOWN: never[] = [];

export function FinanceOverview() {
  // El mes en curso se resuelve una vez en el montaje: recalcularlo en cada render
  // devolvería un objeto nuevo y reiniciaría la página de la tabla en bucle.
  const currentMonth = useMemo(() => currentMonthRange(new Date()), []);

  // Un solo consumidor y muere al desmontar: no es estado global ni de URL (D-21).
  const [range, setRange] = useState<FinanceRange>(currentMonth);
  const [canCreate, setCanCreate] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Estables entre renders: la tabla los lleva en las dependencias de un efecto y de
  // un `useMemo`.
  const handleCanCreateChange = useCallback((value: boolean) => setCanCreate(value), []);
  const handleFormOpenChange = useCallback((open: boolean) => setFormOpen(open), []);

  const query = useFinanceSummary(range);
  const summary = query.data?.data;

  // `isPending` y no `isFetching`: con `keepPreviousData`, cambiar de rango sigue
  // mostrando las cifras anteriores en vez de saltar a los esqueletos. Solo la primera
  // carga es un esqueleto (AC21).
  const isLoading = query.isPending;
  const onRetry = useCallback(() => void query.refetch(), [query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FinanceRangeFilter value={range} onChange={setRange} currentMonth={currentMonth} />

        {/* Solo con `expenses.create`, resuelto por el servidor. La frontera real es el
            403 del POST, que responde igualmente (AC17). */}
        {canCreate ? (
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Registrar gasto
          </Button>
        ) : null}
      </div>

      <FinanceSummaryCards
        summary={summary}
        isLoading={isLoading}
        isError={query.isError}
        message={query.error?.message}
        onRetry={onRetry}
      />

      {/* Bajo las cards: explica la brecha entre las dos cifras de ventas que acaban de
          leerse. No se pinta con cero ni mientras carga (D-12). */}
      <UninvoicedOrdersNotice count={summary?.declarableSales.uninvoicedOrderCount} />

      {/* Bajo el indicador de pedidos sin comprobante y sobre el desglose de gastos: la
          utilidad cuelga de las ventas declarables que las dos cifras de arriba acaban de
          comparar, y el desglose de gastos es el detalle de uno de sus sustraendos.
          Mismos `isLoading`, `isError`, `message` y `onRetry` que el resto, porque es la
          misma consulta (AC28). */}
      <PeriodProfitCard
        profit={summary?.profit}
        isLoading={isLoading}
        isError={query.isError}
        message={query.error?.message}
        onRetry={onRetry}
      />

      <ExpensesByCategory
        rows={summary?.expensesByCategory ?? EMPTY_BREAKDOWN}
        totalCents={summary?.expensesCents ?? 0}
        isLoading={isLoading}
        isError={query.isError}
        message={query.error?.message}
        onRetry={onRetry}
      />

      {/* El filtro de categoría de la tabla no toca estos importes: la categoría filtra
          el detalle, no el resultado del período (D-17, AC20). */}
      <ExpensesTable
        range={range}
        onCanCreateChange={handleCanCreateChange}
        formOpen={formOpen}
        onFormOpenChange={handleFormOpenChange}
      />
    </div>
  );
}
