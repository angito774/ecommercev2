import type { InferSelectModel } from 'drizzle-orm';

import type { RoleSlug } from '@/lib/permissions';
// `import type` obligatorio: un import de valor arrastraría el schema Drizzle y
// @neondatabase/serverless al bundle del cliente (spec 002 §10).
import type { users } from '@/server/db/schema/user';

export type User = InferSelectModel<typeof users>;

export type UserWithRoles = User & { roleSlugs: RoleSlug[] };

export type UserListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  // El cliente NO decide permisos: los recibe ya resueltos por el servidor. La UI
  // solo usa estos dos campos para deshabilitar controles; la frontera real es el
  // 403 del handler.
  currentUserId: string;
  canAssignElevatedRoles: boolean;
};

export type UserListResponse = {
  data: UserWithRoles[];
  meta: UserListMeta;
};

export type InvitationResult = {
  invitationId: string;
  email: string;
  roleSlugs: RoleSlug[];
};
