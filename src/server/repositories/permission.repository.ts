import { asc } from 'drizzle-orm';

import { db } from '@/server/db';
import { permissions } from '@/server/db/schema';

type Permission = typeof permissions.$inferSelect;

export async function findAll(): Promise<Permission[]> {
  return db.select().from(permissions).orderBy(asc(permissions.resource), asc(permissions.action));
}
