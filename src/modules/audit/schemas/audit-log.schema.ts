import { z } from 'zod';

// `entityType` y `action` quedan como texto acotado y no como enum: el catálogo de
// acciones lo escriben los servicios, y un enum aquí rechazaría con 400 el filtro
// por una acción que la bitácora sí contiene. El catálogo que ve el usuario en los
// desplegables vive en `../constants.ts`.
export const auditLogQuerySchema = z.object({
  actorId: z.uuid().optional(),
  entityType: z.string().trim().max(40).optional(),
  action: z.string().trim().max(80).optional(),
  severity: z.enum(['all', 'info', 'warning', 'error']).default('all'),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AuditLogQueryParams = z.output<typeof auditLogQuerySchema>;
