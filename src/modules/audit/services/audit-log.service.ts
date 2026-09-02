import { api } from '@/lib/axios';

import type { AuditLogQueryParams } from '../schemas/audit-log.schema';
import type { AuditLogListResponse } from '../types/audit-log.types';

const BASE_URL = '/admin/audit-logs';

// Sin `create`, `update` ni `remove`: la bitácora no se escribe desde el cliente.
export async function fetchAuditLogs(
  params: AuditLogQueryParams,
): Promise<AuditLogListResponse> {
  const { data } = await api.get<AuditLogListResponse>(BASE_URL, { params });
  return data;
}
