import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/modules/products/lib/price';

import { FINANCE_SUMMARY_ERROR_MESSAGE, NO_REVENUE_MESSAGE } from '../constants';
import type { FinanceSummary } from '../types/finance.types';

const percentFormatter = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

function SummaryCard({
  title,
  value,
  footer,
}: {
  title: string;
  value: string;
  footer: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {footer}
      </CardContent>
    </Card>
  );
}

// El signo del resultado se comunica con icono y etiqueta además del color: solo color
// es inaccesible para daltonismo y en impresión (AC9).
function NetResult({ netCents, marginPercent }: Pick<FinanceSummary, 'netCents' | 'marginPercent'>) {
  const Icon = netCents === 0 ? Minus : netCents > 0 ? ArrowUpRight : ArrowDownRight;
  const label = netCents === 0 ? 'Equilibrio' : netCents > 0 ? 'Ganancia' : 'Pérdida';
  const tone =
    netCents === 0
      ? 'text-muted-foreground'
      : netCents > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-destructive';

  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
      <span className={`flex items-center gap-0.5 font-medium ${tone}`}>
        <Icon className="size-3.5" aria-hidden />
        {label}
      </span>
      {/* `null` no es un fallo: es que el rango no tuvo ingresos y sin base no hay
          porcentaje que calcular. Nunca `Infinity`, `NaN` ni «0 %» (AC10). */}
      {marginPercent === null ? (
        <span>· {NO_REVENUE_MESSAGE}</span>
      ) : (
        <span>· margen {percentFormatter.format(marginPercent)} %</span>
      )}
    </p>
  );
}

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-40" />
      </CardContent>
    </Card>
  );
}

type FinanceSummaryCardsProps = {
  summary: FinanceSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  message?: string;
  onRetry: () => void;
};

export function FinanceSummaryCards({
  summary,
  isLoading,
  isError,
  message,
  onRetry,
}: FinanceSummaryCardsProps) {
  // Un error no puede verse igual que una carga eterna: la fila no se queda en
  // esqueletos cuando la consulta falla (AC21).
  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="text-destructive text-sm font-medium">
            {message ?? FINANCE_SUMMARY_ERROR_MESSAGE}
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCardSkeleton />
        <SummaryCardSkeleton />
        <SummaryCardSkeleton />
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SummaryCard
        title="Ingresos por ventas"
        value={formatPrice(summary.revenueCents)}
        footer={
          <p className="text-muted-foreground text-xs">
            {summary.orderCount} {summary.orderCount === 1 ? 'pedido pagado' : 'pedidos pagados'}
          </p>
        }
      />
      <SummaryCard
        title="Gastos operativos"
        value={formatPrice(summary.expensesCents)}
        footer={
          <p className="text-muted-foreground text-xs">
            {summary.expenseCount}{' '}
            {summary.expenseCount === 1 ? 'gasto registrado' : 'gastos registrados'}
          </p>
        }
      />
      <SummaryCard
        title="Resultado del período"
        value={formatPrice(summary.netCents)}
        footer={
          <NetResult netCents={summary.netCents} marginPercent={summary.marginPercent} />
        }
      />
    </div>
  );
}
