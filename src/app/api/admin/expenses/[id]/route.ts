import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext, logAudit } from '@/lib/audit';
import { toAuditableExpense } from '@/modules/finance/lib/expense-audit';
import { resolveReceiptColumns } from '@/modules/finance/lib/expense-receipt';
import {
  expenseIdSchema,
  updateExpenseSchema,
} from '@/modules/finance/schemas/finance.schema';
import type { ExpenseMutated } from '@/modules/finance/types/finance.types';
import { db } from '@/server/db';
import { expenses } from '@/server/db/schema';
import * as financeRepository from '@/server/repositories/finance.repository';

type Context = RouteContext<'/api/admin/expenses/[id]'>;
type Expense = typeof expenses.$inferSelect;

const NOT_FOUND = { message: 'Gasto no encontrado' };
const INVALID_ID_MESSAGE = 'El identificador del gasto no es válido';

// En Next 16 `params` es una promesa, por eso el await antes de validar.
async function parseId(context: Context) {
  const { id } = await context.params;
  return expenseIdSchema.safeParse(id);
}

// La respuesta de las tres mutaciones. Sin `createdAt` ni `updatedAt`, y no por
// olvido: cruzarían el JSON como `string` bajo un tipo `Date`.
function toMutated(expense: Expense): ExpenseMutated {
  return {
    id: expense.id,
    concept: expense.concept,
    amountCents: expense.amountCents,
    category: expense.category,
    incurredOn: expense.incurredOn,
    createdById: expense.createdById,
  };
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { actor } = await authorize('expenses.update');

    const parsedId = await parseId(context);
    if (!parsedId.success) return badRequest(INVALID_ID_MESSAGE);

    const body = await parseJsonBody(request, updateExpenseSchema, 'Datos del gasto inválidos');
    if (!body.ok) return body.response;

    const updated = await db.transaction(async (tx) => {
      // El `before` se lee con el `tx` y no con el `db` global: así la bitácora registra
      // exactamente el estado sobre el que corre el UPDATE (D-15, AC15).
      const before = await financeRepository.findExpenseById(parsedId.data, tx);
      if (!before) return null;

      // El comprobante se separa de los cuatro campos del gasto: las columnas del
      // primero las resuelve `resolveReceiptColumns`, y `receipt` no es una columna.
      const { receipt, ...expenseValues } = body.data;

      // Decide sobre el estado **fusionado** —el `before` que ya está leído más el
      // cuerpo—, no solo sobre lo que llega (D-7): cambiar únicamente el importe de un
      // gasto que ya tenía factura tiene que recalcular su IGV, o quedaría el del
      // importe anterior, que el `CHECK` no atrapa porque sigue siendo menor (AC9).
      //
      // `null` significa «no hay nada que escribir»: el `UPDATE` no toca las seis
      // columnas y omitir `receipt` no borra el comprobante (AC11).
      const receiptColumns = resolveReceiptColumns(before, { ...expenseValues, receipt });

      const after = await financeRepository.updateExpense(tx, parsedId.data, {
        ...expenseValues,
        ...(receiptColumns ?? {}),
      });
      if (!after) return null;

      await logAudit(tx, {
        actorId: actor.id,
        action: 'expense.updated',
        entityType: 'expense',
        entityId: after.id,
        // Las dos filas pasan por la proyección: `manager` y `audit` leen la bitácora
        // con `audit_logs.read` y sin `finance.read`, y `supplier_ruc` de una persona
        // natural lleva su DNI embebido. Mismo criterio que el spec 021 (D-9).
        changes: { before: toAuditableExpense(before), after: toAuditableExpense(after) },
        context: getAuditContext(request),
      });

      return after;
    });

    if (!updated) return NextResponse.json(NOT_FOUND, { status: 404 });

    return NextResponse.json(toMutated(updated));
  } catch (error) {
    return toErrorResponse(error, {
      label: 'PATCH /api/admin/expenses/[id]',
      fallback: 'No se pudo actualizar el gasto',
    });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { actor } = await authorize('expenses.delete');

    const parsedId = await parseId(context);
    if (!parsedId.success) return badRequest(INVALID_ID_MESSAGE);

    // Borrado físico (D-7): `expenses` no tiene dependientes. La traza no se pierde
    // porque `expense.deleted` guarda la fila completa y `audit_logs` es append-only.
    const deleted = await db.transaction(async (tx) => {
      const before = await financeRepository.findExpenseById(parsedId.data, tx);
      if (!before) return null;

      const removed = await financeRepository.deleteExpense(tx, parsedId.data);
      if (!removed) return null;

      await logAudit(tx, {
        actorId: actor.id,
        action: 'expense.deleted',
        entityType: 'expense',
        entityId: before.id,
        // `after: null` porque la fila ya no existe: la bitácora es la única copia que
        // queda de lo que se borró (AC16). Copia sin el RUC del proveedor, que no puede
        // quedar en un registro append-only que leen `manager` y `audit`.
        changes: { before: toAuditableExpense(before), after: null },
        context: getAuditContext(request),
      });

      return removed;
    });

    if (!deleted) return NextResponse.json(NOT_FOUND, { status: 404 });

    return NextResponse.json(toMutated(deleted));
  } catch (error) {
    return toErrorResponse(error, {
      label: 'DELETE /api/admin/expenses/[id]',
      fallback: 'No se pudo eliminar el gasto',
    });
  }
}
