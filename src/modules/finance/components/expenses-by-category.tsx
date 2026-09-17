import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/modules/products/lib/price';

import {
  EMPTY_BREAKDOWN_MESSAGE,
  EXPENSE_CATEGORY_LABELS,
  FINANCE_SUMMARY_ERROR_MESSAGE,
} from '../constants';
import type { ExpenseCategoryTotal } from '../types/finance.types';

const percentFormatter = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });

type ExpensesByCategoryProps = {
  rows: readonly ExpenseCategoryTotal[];
  /** Total de gastos del rango: la base de los porcentajes. */
  totalCents: number;
  isLoading: boolean;
  isError: boolean;
  message?: string;
  onRetry: () => void;
};

// Sin gráfico (D-13): son como mucho 8 categorías con un importe cada una, y una lista
// ordenada con su barra responde «en qué se va el dinero» mejor que un donut, que
// obliga a comparar ángulos. La barra es ancho porcentual en CSS, no una librería.
export function ExpensesByCategory({
  rows,
  totalCents,
  isLoading,
  isError,
  message,
  onRetry,
}: ExpensesByCategoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gasto por categoría</CardTitle>
      </CardHeader>
      <CardContent>
        {isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <p className="text-destructive text-sm font-medium">
              {message ?? FINANCE_SUMMARY_ERROR_MESSAGE}
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Reintentar
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={`breakdown-skeleton-${index}`} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          // Cero categorías no es un error ni una carga: es que nadie registró gastos
          // en el rango (AC11).
          <p className="text-muted-foreground py-8 text-center text-sm">
            {EMPTY_BREAKDOWN_MESSAGE}
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => {
              // El total llega del mismo agregado que las filas, así que la división
              // solo puede ser por cero si no hay filas, y en ese caso no se llega aquí.
              const share = totalCents === 0 ? 0 : (row.amountCents / totalCents) * 100;

              return (
                <li key={row.category} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {EXPENSE_CATEGORY_LABELS[row.category]}
                      <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                        ({row.count})
                      </span>
                    </span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      <span>{formatPrice(row.amountCents)}</span>
                      <span className="text-muted-foreground text-xs">
                        {percentFormatter.format(share)} %
                      </span>
                    </span>
                  </div>
                  {/* El porcentaje ya está escrito al lado, así que la barra es
                      decorativa: `aria-hidden` evita que el lector lo diga dos veces. */}
                  <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
                    <div className="bg-primary h-full rounded-full" style={{ width: `${share}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
