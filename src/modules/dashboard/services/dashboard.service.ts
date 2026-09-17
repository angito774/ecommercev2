import { api } from '@/lib/axios';

import type { DashboardMetricsQueryParams } from '../schemas/dashboard.schema';
import type { DashboardMetricsResponse } from '../types/dashboard.types';

const BASE_URL = '/admin/metrics';

export async function fetchDashboardMetrics(
  params: DashboardMetricsQueryParams,
): Promise<DashboardMetricsResponse> {
  const { data } = await api.get<DashboardMetricsResponse>(BASE_URL, { params });
  return data;
}
