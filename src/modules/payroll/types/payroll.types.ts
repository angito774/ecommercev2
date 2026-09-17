import type { payrollPayments } from '@/server/db/schema';

import type { EmployeeListMeta } from './employee.types';

type PayrollPaymentSelect = typeof payrollPayments.$inferSelect;

// 'voided' no es un estado de la columna: lo deriva el servidor de `voidedAt`, igual
// que `resolveStockStatus` deriva el estado de stock (spec 016, D-9).
export type PayrollPaymentStatus = 'paid' | 'voided';

export type PayrollPaymentRow = Omit<PayrollPaymentSelect, 'voidedAt' | 'createdAt'> & {
  status: PayrollPaymentStatus;
  // Del join con `employees`: la tabla de pagos muestra a quién se le pagó y no debe
  // pedir una segunda petición por fila.
  employeeCode: string;
  employeeFullName: string;
};

export type PayrollListMeta = EmployeeListMeta;
export type PayrollListResponse = { data: PayrollPaymentRow[]; meta: PayrollListMeta };
