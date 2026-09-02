import type { InferSelectModel } from 'drizzle-orm';

// `import type` obligatorio: un import de valor arrastraría el schema Drizzle y
// @neondatabase/serverless al bundle del cliente (spec 002 §10).
import type { auditLogs } from '@/server/db/schema/audit-log';

export type AuditLog = InferSelectModel<typeof auditLogs>;

export type AuditSeverity = AuditLog['severity'];

// El email del actor viaja resuelto por el servidor: la bitácora conserva la fila
// del usuario aunque se le quite el acceso, y `actor_id` es null cuando la acción
// la ejecutó el webhook o el seed.
export type AuditLogWithActor = AuditLog & { actorEmail: string | null };

export type AuditLogListResponse = {
  data: AuditLogWithActor[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};
