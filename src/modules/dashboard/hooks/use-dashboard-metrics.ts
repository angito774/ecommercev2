'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { DASHBOARD_REFETCH_INTERVAL_MS, dashboardKeys } from '../constants';
import type { DashboardPeriod } from '../schemas/dashboard.schema';
import { fetchDashboardMetrics } from '../services/dashboard.service';

export function useDashboardMetrics(period: DashboardPeriod) {
  return useQuery({
    queryKey: dashboardKeys.metrics(period),
    queryFn: () => fetchDashboardMetrics({ period }),
    // Polling: los agregados cambian cuando entra un pedido, no en continuo, así
    // que un intervalo basta y no hace falta un canal de push (D-3).
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
    // `refetchIntervalInBackground` se queda en su default (`false`): una pestaña
    // olvidada no debe consultar Neon toda la noche (D-4, AC15).
    //
    // Sin esto, cambiar de período vacía el dashboard y la altura salta a los
    // esqueletos; con datos previos solo se marca como "fetching" (AC16).
    placeholderData: keepPreviousData,
  });
}
