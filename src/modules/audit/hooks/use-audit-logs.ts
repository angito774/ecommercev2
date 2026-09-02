'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { auditLogKeys } from '../constants';
import type { AuditLogQueryParams } from '../schemas/audit-log.schema';
import { fetchAuditLogs } from '../services/audit-log.service';

export function useAuditLogs(params: AuditLogQueryParams) {
  return useQuery({
    queryKey: auditLogKeys.list(params),
    queryFn: () => fetchAuditLogs(params),
    // Sin esto la tabla se vacía en cada cambio de página o de filtro y la altura
    // salta; con datos previos solo se marca como "fetching".
    placeholderData: keepPreviousData,
  });
}
