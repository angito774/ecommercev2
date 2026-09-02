import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { auditLogQuerySchema } from '@/modules/audit/schemas/audit-log.schema';
import type { AuditLogListResponse } from '@/modules/audit/types/audit-log.types';
import * as auditLogRepository from '@/server/repositories/audit-log.repository';

// Solo lectura. La ausencia de POST, PATCH y DELETE es la que hace append-only a la
// tabla desde fuera del proceso: `audit_logs` solo se escribe dentro de la
// transacción de la mutación auditada, vía `logAudit` (CLAUDE.md regla 11).
export async function GET(request: Request) {
  try {
    await authorize('audit_logs.read');

    const { searchParams } = new URL(request.url);
    const parsed = auditLogQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const { data, total } = await auditLogRepository.findMany(parsed.data);
    const { page, pageSize } = parsed.data;

    const body: AuditLogListResponse = {
      data,
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/audit-logs',
      fallback: 'No se pudo obtener la bitácora',
    });
  }
}
