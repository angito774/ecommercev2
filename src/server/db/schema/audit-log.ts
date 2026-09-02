import { index, inet, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './user';

export const auditSeverity = pgEnum('audit_severity', ['info', 'warning', 'error']);

// Tabla append-only: sin UPDATE ni DELETE desde la aplicación, y por eso sin
// `updated_at` (docs/SETUP.md §5.2, regla dura 1).
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // null = acción del sistema, cron o webhook.
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    changes: jsonb('changes').$type<{ before: unknown; after: unknown }>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    severity: auditSeverity('severity').notNull().default('info'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_actor_created_at_idx').on(t.actorId, t.createdAt.desc()),
    index('audit_logs_action_idx').on(t.action),
    index('audit_logs_created_at_idx').on(t.createdAt.desc()),
  ],
);
