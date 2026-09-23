// La frontera que impide que el RUC de un proveedor llegue a `audit_logs`.
//
// Es el mismo canal que ya se cerró dos veces en el proyecto —los sueldos del spec 018
// (D-8) y el costo promedio del spec 021 (D-9)—: `expense.created`, `expense.updated` y
// `expense.deleted` escriben `changes` con las filas **enteras** —`findExpenseById` hace
// `select()` a secas y `createExpense`/`updateExpense` devuelven `returning()` completo—
// y `audit-log-columns.tsx` renderiza `changes` y `metadata` íntegros. `/admin/audit-logs`
// lo leen `manager` y `audit`, que tienen `audit_logs.read` y **no** `finance.read`.
//
// El dato concreto es `supplier_ruc`: un RUC que empieza por `10` es el de una persona
// natural y lleva su DNI en los ocho primeros dígitos, así que es PII y no solo un
// identificador tributario. `supplier_name` se conserva —es una razón social, no un
// documento de identidad— y sin él la bitácora no diría de qué proveedor se habla.
//
// Es una función pura y probada, no un `delete` suelto en el handler: nada en el tipo de
// `AuditInput` lo impediría, porque `changes` es `unknown`.

import type { expenses } from '@/server/db/schema';

type Expense = typeof expenses.$inferSelect;

/** El proyectado que sí puede entrar en la bitácora. */
export type AuditableExpense = Omit<Expense, 'supplierRuc'>;

export function toAuditableExpense(row: Expense): AuditableExpense {
  // Proyección positiva y no `delete`/rest: se enumera lo que sale, así que una columna
  // nueva y sensible en `expenses` no se cuela sola en el log por haberla añadido al
  // schema. Mismo criterio que `toAuditableProduct()` del spec 021.
  return {
    id: row.id,
    concept: row.concept,
    amountCents: row.amountCents,
    category: row.category,
    incurredOn: row.incurredOn,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    receiptType: row.receiptType,
    supplierName: row.supplierName,
    receiptSeries: row.receiptSeries,
    receiptNumber: row.receiptNumber,
    igvCents: row.igvCents,
  };
}
