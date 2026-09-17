'use client';

import { useState } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { formatPrice } from '@/modules/products/lib/price';

import { LOW_STOCK_THRESHOLD } from '../constants';
import { useDashboardMetrics } from '../hooks/use-dashboard-metrics';
import type { DashboardPeriod } from '../schemas/dashboard.schema';

import { KpiCard, KpiCardSkeleton } from './kpi-card';
import { LowStockWidget } from './low-stock-widget';
import { MetricsError } from './metrics-error';
import { PeriodSelector } from './period-selector';
import { RevenueChart } from './revenue-chart';
import { TopProductsList } from './top-products-list';

// Una sola referencia estable para las tres listas: un `[]` en línea sería un array
// nuevo en cada render y rompería la memoización de las secciones sin necesidad.
const EMPTY_LIST: never[] = [];

const updatedAtFormatter = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
});

export function DashboardOverview() {
  // Un solo consumidor y muere al desmontar: no es estado global ni de URL (D-18).
  const [period, setPeriod] = useState<DashboardPeriod>('7d');

  const query = useDashboardMetrics(period);
  const metrics = query.data?.data;

  // `isPending` y no `isFetching`: con `keepPreviousData` el refresco del polling y
  // el cambio de período siguen mostrando los datos anteriores en vez de saltar a
  // los esqueletos (AC16). Solo la primera carga es un esqueleto (AC17).
  const isLoading = query.isPending;
  const isError = query.isError;
  const onRetry = () => void query.refetch();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />

        {query.data ? (
          // Hace visible el polling: sin esta marca, un dashboard congelado por un
          // fallo silencioso se ve igual que uno recién refrescado (D-3).
          <p className="text-muted-foreground text-sm" aria-live="polite">
            Actualizado a las {updatedAtFormatter.format(new Date(query.data.meta.generatedAt))}
          </p>
        ) : null}
      </div>

      {isError ? (
        // La fila de KPI no se queda en esqueletos cuando la consulta falla: sin
        // este estado, un error se vería igual que una carga eterna (AC17).
        <Card>
          <CardContent>
            <MetricsError message={query.error?.message} onRetry={onRetry} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading || !metrics ? (
            <>
              <KpiCardSkeleton />
              <KpiCardSkeleton />
              <KpiCardSkeleton />
            </>
          ) : (
            <>
              <KpiCard
                title="Ventas totales"
                value={formatPrice(metrics.kpis.revenueCents.value)}
                changePercent={metrics.kpis.revenueCents.changePercent}
              />
              <KpiCard
                title="Pedidos"
                value={`${metrics.kpis.orderCount.value} ${
                  metrics.kpis.orderCount.value === 1 ? 'pedido' : 'pedidos'
                }`}
                changePercent={metrics.kpis.orderCount.changePercent}
              />
              <KpiCard
                title="Ticket promedio"
                value={formatPrice(metrics.kpis.averageTicketCents.value)}
                changePercent={metrics.kpis.averageTicketCents.changePercent}
              />
            </>
          )}
        </div>
      )}

      <RevenueChart
        series={metrics?.revenueSeries ?? EMPTY_LIST}
        isLoading={isLoading}
        isError={isError}
        message={query.error?.message}
        onRetry={onRetry}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <TopProductsList
          products={metrics?.topProducts ?? EMPTY_LIST}
          isLoading={isLoading}
          isError={isError}
          message={query.error?.message}
          onRetry={onRetry}
        />
        <LowStockWidget
          products={metrics?.lowStock ?? EMPTY_LIST}
          // El umbral que usó la consulta, con la constante solo como respaldo
          // mientras la primera respuesta no ha llegado.
          threshold={query.data?.meta.lowStockThreshold ?? LOW_STOCK_THRESHOLD}
          isLoading={isLoading}
          isError={isError}
          message={query.error?.message}
          onRetry={onRetry}
        />
      </div>
    </div>
  );
}
