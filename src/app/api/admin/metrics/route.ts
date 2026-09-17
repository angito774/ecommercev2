import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import {
  LOW_STOCK_LIMIT,
  REPORTING_TIME_ZONE,
  TOP_PRODUCTS_LIMIT,
} from '@/modules/dashboard/constants';
import { averageTicketCents, percentChange } from '@/modules/dashboard/lib/metrics-math';
import { resolvePeriodRange } from '@/modules/dashboard/lib/period-range';
import { fillRevenueSeries } from '@/modules/dashboard/lib/revenue-series';
import { dashboardMetricsQuerySchema } from '@/modules/dashboard/schemas/dashboard.schema';
import type {
  DashboardMetricsResponse,
  MetricComparison,
} from '@/modules/dashboard/types/dashboard.types';
import { LOW_STOCK_THRESHOLD } from '@/modules/products/constants';
import * as metricsRepository from '@/server/repositories/metrics.repository';

function toComparison(value: number, previousValue: number): MetricComparison {
  return { value, previousValue, changePercent: percentChange(value, previousValue) };
}

// Los cuatro bloques en una sola respuesta: es una pantalla que se carga entera y
// se refresca entera, y cuatro rutas serían cuatro `authorize()`, cuatro viajes y
// cuatro estados de error para un solo botón de reintentar (D-5).
export async function GET(request: Request) {
  try {
    // Antes de tocar la query: sin permiso no se debe poder enumerar el contrato a
    // base de 400 antes de recibir el 403 (D-21, AC2).
    await authorize('dashboard.read');

    const { searchParams } = new URL(request.url);
    const parsed = dashboardMetricsQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const { period } = parsed.data;

    // Un único instante para el rango y para `generatedAt`: con dos `new Date()` el
    // «actualizado a las» podría pertenecer a un día distinto del que se consultó.
    const generatedAt = new Date();
    const { current, previous } = resolvePeriodRange(period, generatedAt);

    // En paralelo: son cuatro lecturas independientes, así que el coste es el de la
    // más lenta y no la suma (D-5). El stock bajo va sin rango a propósito (AC13).
    const [totals, seriesRows, topProducts, lowStock] = await Promise.all([
      metricsRepository.findKpiTotals({ current, previous }),
      metricsRepository.findRevenueSeries(current),
      metricsRepository.findTopProducts(current, TOP_PRODUCTS_LIMIT),
      metricsRepository.findLowStockProducts(LOW_STOCK_THRESHOLD, LOW_STOCK_LIMIT),
    ]);

    // Un período sin ventas es un 200 con ceros y listas vacías, no un 404 ni un
    // 204: el recurso «métricas del período» existe siempre (AC10).
    const body: DashboardMetricsResponse = {
      data: {
        kpis: {
          revenueCents: toComparison(totals.current.revenueCents, totals.previous.revenueCents),
          orderCount: toComparison(totals.current.orderCount, totals.previous.orderCount),
          averageTicketCents: toComparison(
            averageTicketCents(totals.current.revenueCents, totals.current.orderCount),
            averageTicketCents(totals.previous.revenueCents, totals.previous.orderCount),
          ),
        },
        // La consulta solo devuelve los días con ventas; el rango es lo que decide
        // cuántos puntos tiene la serie (AC11).
        revenueSeries: fillRevenueSeries(seriesRows, current),
        topProducts,
        lowStock,
      },
      meta: {
        period,
        range: { from: current.from.toISOString(), to: current.to.toISOString() },
        previousRange: { from: previous.from.toISOString(), to: previous.to.toISOString() },
        timeZone: REPORTING_TIME_ZONE,
        lowStockThreshold: LOW_STOCK_THRESHOLD,
        generatedAt: generatedAt.toISOString(),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/metrics',
      fallback: 'No se pudieron obtener las métricas del panel',
    });
  }
}
