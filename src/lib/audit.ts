import { isIP } from 'node:net';

import { type Tx } from '@/server/db';
import { auditSeverity } from '@/server/db/schema';
import * as auditLogRepository from '@/server/repositories/audit-log.repository';

type AuditSeverity = (typeof auditSeverity.enumValues)[number];

export type AuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type AuditInput = {
  // null = acción del sistema, cron o webhook.
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  changes?: { before: unknown; after: unknown } | null;
  metadata?: Record<string, unknown> | null;
  severity?: AuditSeverity;
  context?: AuditContext;
};

// El `Tx` es obligatorio y no admite el `db` global: así es imposible escribir la
// bitácora fuera de la transacción de la mutación auditada. Si la mutación
// revierte, el log también (docs/SETUP.md §5.2, regla dura 2).
//
// Nunca se pasan contraseñas, tokens, claves ni payloads crudos en `changes` o
// `metadata`: la tabla es de consulta para humanos, no un volcado de request
// (regla dura 3).
export async function logAudit(tx: Tx, input: AuditInput): Promise<void> {
  await auditLogRepository.insert(tx, {
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    changes: input.changes ?? null,
    metadata: input.metadata ?? null,
    ipAddress: input.context?.ipAddress ?? null,
    userAgent: input.context?.userAgent ?? null,
    severity: input.severity ?? 'info',
  });
}

const MAX_USER_AGENT_LENGTH = 512;

// `x-forwarded-for` lo pone el proxy y el cliente puede falsificarlo: la IP de la
// bitácora es indicio, nunca prueba, y no debe sostener ninguna decisión de
// seguridad. Se valida la forma con `isIP` porque la columna es `inet` y un valor
// corrupto haría reventar la transacción de negocio entera.
export function getAuditContext(request: Request): AuditContext {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const candidate = forwardedFor?.split(',')[0]?.trim();
  const userAgent = request.headers.get('user-agent');

  return {
    ipAddress: candidate && isIP(candidate) !== 0 ? candidate : null,
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
}
