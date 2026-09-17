import type { employees } from '@/server/db/schema';

// Inferido del schema Drizzle, no reescrito a mano (CLAUDE.md regla 5).
type EmployeeSelect = typeof employees.$inferSelect;

// `createdAt` y `updatedAt` fuera: son `Date` en el tipo y `string` en el JSON, y esa
// discrepancia ya es deuda declarada de `ProductListResponse` (spec 016 §11). Este
// módulo no la hereda: ningún campo `Date` viaja en sus respuestas (D-11).
export type EmployeeRow = Omit<EmployeeSelect, 'createdAt' | 'updatedAt'>;

export type EmployeeListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  // Resuelto en el servidor; la UI solo oculta controles. La frontera real es el 403
  // de cada mutación (AC3).
  canManage: boolean;
};

export type EmployeeListResponse = { data: EmployeeRow[]; meta: EmployeeListMeta };
