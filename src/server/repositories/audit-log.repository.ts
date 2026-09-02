import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import { db, type Tx } from '@/server/db';
import { auditLogs, users } from '@/server/db/schema';

type AuditLog = typeof auditLogs.$inferSelect;
type NewAuditLog = typeof auditLogs.$inferInsert;

// `audit_logs` es append-only: este archivo no expone `update` ni `delete` a
// propósito (docs/SETUP.md §5.2, regla dura 1). El único parámetro de escritura es
// un `Tx`, de modo que el log siempre viaja en la transacción de la mutación
// auditada y revierte con ella.
export async function insert(tx: Tx, values: NewAuditLog): Promise<AuditLog> {
  const [created] = await tx.insert(auditLogs).values(values).returning();
  return created;
}

export type AuditLogListParams = {
  actorId?: string;
  entityType?: string;
  action?: string;
  severity: 'all' | AuditLog['severity'];
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

export type AuditLogWithActor = AuditLog & { actorEmail: string | null };

export type AuditLogListResult = { data: AuditLogWithActor[]; total: number };

function buildFilters(params: AuditLogListParams): SQL | undefined {
  const conditions: SQL[] = [];

  if (params.actorId) conditions.push(eq(auditLogs.actorId, params.actorId));

  // `entityType` y `action` van como parámetros ligados y no contra un mapa cerrado
  // como el `SORT_COLUMNS` de `category.repository.ts`: aquel mapa existe porque un
  // identificador de columna no se puede parametrizar, y esto es un valor. Cerrar
  // la lista aquí obligaría a editar el repositorio cada vez que se audite una
  // entidad nueva, y el filtro dejaría de encontrarla en silencio.
  if (params.entityType) conditions.push(eq(auditLogs.entityType, params.entityType));
  if (params.action) conditions.push(eq(auditLogs.action, params.action));
  if (params.severity !== 'all') conditions.push(eq(auditLogs.severity, params.severity));

  if (params.from) conditions.push(gte(auditLogs.createdAt, new Date(params.from)));
  if (params.to) conditions.push(lte(auditLogs.createdAt, new Date(params.to)));

  return conditions.length === 0 ? undefined : and(...conditions);
}

export async function findMany(params: AuditLogListParams): Promise<AuditLogListResult> {
  const { page, pageSize } = params;
  const where = buildFilters(params);

  const [pageRows, [totals]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        changes: auditLogs.changes,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        severity: auditLogs.severity,
        createdAt: auditLogs.createdAt,
        // `leftJoin`: `actor_id` es nullable —el webhook y el seed escriben sin
        // actor— y un `innerJoin` escondería justamente esas filas, que son las que
        // más interesa poder auditar.
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(where)
      // El `id` desempata: dos entradas de la misma transacción comparten
      // `created_at` al milisegundo y sin criterio estable Postgres puede repetir o
      // saltarse una fila entre páginas.
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(auditLogs).where(where),
  ]);

  return { data: pageRows, total: totals?.value ?? 0 };
}
