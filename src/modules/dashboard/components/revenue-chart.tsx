'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/modules/products/lib/price';

import { EMPTY_REVENUE_MESSAGE } from '../constants';
import type { RevenuePoint } from '../types/dashboard.types';

import { MetricsError } from './metrics-error';

const CHART_HEIGHT_CLASS = 'h-72';

// Eje Y en soles y en notación compacta: el valor exacto lo da el tooltip, y un
// «S/ 12,849.00» repetido cinco veces en el eje compite con la propia curva.
const axisFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  notation: 'compact',
  maximumFractionDigits: 1,
});

// 'YYYY-MM-DD' → 'DD/MM' por corte de cadena, sin construir un `Date`: parsear el
// día para volver a formatearlo es justo lo que desplazaría el huso (D-20).
function toAxisLabel(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

// Props propias en vez de las de Recharts: `TooltipProps` declara `label` y
// `payload[].payload` como `any`, y el proyecto no admite `any` (CLAUDE.md §6).
type RevenueTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: RevenuePoint }>;
};

function RevenueTooltip({ active, payload }: RevenueTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground text-xs">{point.day}</p>
      <p className="font-medium tabular-nums">{formatPrice(point.revenueCents)}</p>
    </div>
  );
}

type RevenueChartProps = {
  series: RevenuePoint[];
  isLoading: boolean;
  isError: boolean;
  message?: string;
  onRetry: () => void;
};

export function RevenueChart({ series, isLoading, isError, message, onRetry }: RevenueChartProps) {
  // Los ceros siguen viajando en la respuesta (AC11); lo que se decide aquí es el
  // render: una recta sobre el eje se lee como «vendimos poco», no como «no hay
  // nada» (D-17).
  const hasSales = series.some((point) => point.revenueCents > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ventas por día</CardTitle>
      </CardHeader>
      <CardContent>
        {isError ? (
          // Misma altura que el gráfico: el error no debe encoger la tarjeta y
          // empujar hacia arriba lo que hay debajo.
          <div className={`flex ${CHART_HEIGHT_CLASS} items-center justify-center`}>
            <MetricsError message={message} onRetry={onRetry} />
          </div>
        ) : isLoading ? (
          <Skeleton className={`${CHART_HEIGHT_CLASS} w-full`} />
        ) : hasSales ? (
          <div className={CHART_HEIGHT_CLASS}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  {/* `--primary` y no `--chart-1`: ese token es el mismo gris claro
                      en claro y en oscuro y no pasa el contraste sobre la
                      superficie clara (D-15, verificado en globals.css). */}
                  <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                {/* Grid recesivo: orienta sin competir con la serie (D-14). */}
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  tickFormatter={toAxisLabel}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <YAxis
                  width={72}
                  tickFormatter={(value: number) => axisFormatter.format(value / 100)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <Tooltip
                  content={<RevenueTooltip />}
                  cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                />
                {/* Una sola serie: sin leyenda, que el título ya la nombra (D-14). */}
                <Area
                  type="monotone"
                  dataKey="revenueCents"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#revenue-fill)"
                  // Un punto por día en 30d satura la curva; el hover sí lo marca.
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            className={`flex ${CHART_HEIGHT_CLASS} items-center justify-center text-center`}
            // Vacío, no error ni carga: es una respuesta legítima del período (AC10).
          >
            <p className="text-muted-foreground text-sm">{EMPTY_REVENUE_MESSAGE}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
