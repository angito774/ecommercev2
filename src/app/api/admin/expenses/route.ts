import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext, logAudit } from '@/lib/audit';
import { can } from '@/lib/permissions';
import { resolveFinanceRange } from '@/modules/finance/lib/finance-range';
import {
  createExpenseSchema,
  expenseQuerySchema,
} from '@/modules/finance/schemas/finance.schema';
import type {
  ExpenseListResponse,
  ExpenseMutated,
} from '@/modules/finance/types/finance.types';
import { db } from '@/server/db';
import * as financeRepository from '@/server/repositories/finance.repository';

// Se autoriza con `finance.read` y no con un `expenses.read` propio: el listado es el
// detalle que hay detrás de la cifra «Gastos» del resumen, no un recurso que se
// consulte por separado (D-2, D-16).
export async function GET(request: Request) {
  try {
    // Antes de tocar la query: un `?page=abc` de quien no tiene permiso responde 403 y
    // no 400 (D-14, AC2).
    const { granted } = await authorize('finance.read');

    const { searchParams } = new URL(request.url);
    const parsed = expenseQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    // La misma función que el resumen: el rango por defecto de las dos pantallas no
    // puede divergir (AC4).
    const range = resolveFinanceRange(parsed.data, new Date());

    const { data, total } = await financeRepository.findManyExpenses(parsed.data, range);
    const { page, pageSize } = parsed.data;

    const body: ExpenseListResponse = {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        range: { from: range.fromDay, to: range.toDay },
        // Resueltos en el servidor; la UI solo oculta controles. La frontera real es
        // el 403 de cada verbo, que se vuelve a comprobar (AC17).
        canCreate: can(granted, 'expenses.create'),
        canUpdate: can(granted, 'expenses.update'),
        canDelete: can(granted, 'expenses.delete'),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/expenses',
      fallback: 'No se pudieron obtener los gastos',
    });
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await authorize('expenses.create');

    const body = await parseJsonBody(request, createExpenseSchema, 'Datos del gasto inválidos');
    if (!body.ok) return body.response;

    // La fila y su entrada de bitácora en la misma transacción: si el INSERT falla, no
    // queda ninguna de las dos (D-15, AC14).
    const created = await db.transaction(async (tx) => {
      const expense = await financeRepository.createExpense(tx, {
        ...body.data,
        // Lo pone el servidor a partir de la sesión, nunca el cuerpo: quien registra el
        // gasto es quien está autenticado.
        createdById: actor.id,
      });

      await logAudit(tx, {
        actorId: actor.id,
        action: 'expense.created',
        entityType: 'expense',
        entityId: expense.id,
        changes: { before: null, after: expense },
        context: getAuditContext(request),
      });

      return expense;
    });

    // Sin marcas de tiempo en la respuesta: cruzarían el JSON como `string` bajo un
    // tipo `Date` y el cliente solo necesita el concepto para el toast.
    const mutated: ExpenseMutated = {
      id: created.id,
      concept: created.concept,
      amountCents: created.amountCents,
      category: created.category,
      incurredOn: created.incurredOn,
      createdById: created.createdById,
    };

    return NextResponse.json(mutated, { status: 201 });
  } catch (error) {
    // Sin `uniqueViolationMessage`: la tabla no tiene constraints unique y dos facturas
    // iguales el mismo día son un caso legítimo, así que este verbo nunca da 409 (§5.1).
    return toErrorResponse(error, {
      label: 'POST /api/admin/expenses',
      fallback: 'No se pudo registrar el gasto',
    });
  }
}
