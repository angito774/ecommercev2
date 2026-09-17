import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext, logAudit } from '@/lib/audit';
import {
  EMPLOYEE_CONFLICT_MESSAGES,
  EMPLOYEE_NOT_FOUND_MESSAGE,
  INVALID_EMPLOYEE_ID_MESSAGE,
} from '@/modules/payroll/constants';
import { hasSalaryChange, toAuditableEmployee } from '@/modules/payroll/lib/auditable-employee';
import {
  employeeIdSchema,
  updateEmployeeSchema,
} from '@/modules/payroll/schemas/employee.schema';
import { db } from '@/server/db';
import * as employeeRepository from '@/server/repositories/employee.repository';

type Context = RouteContext<'/api/admin/employees/[id]'>;

const NOT_FOUND = { message: EMPLOYEE_NOT_FOUND_MESSAGE };

// En Next 16 `params` es una promesa, por eso el await antes de validar.
async function parseId(context: Context) {
  const { id } = await context.params;
  return employeeIdSchema.safeParse(id);
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { actor } = await authorize('payroll.manage');

    const parsedId = await parseId(context);
    if (!parsedId.success) return badRequest(INVALID_EMPLOYEE_ID_MESSAGE);

    const body = await parseJsonBody(request, updateEmployeeSchema, 'Datos del empleado inválidos');
    if (!body.ok) return body.response;

    const updated = await db.transaction(async (tx) => {
      // El `before` se lee con el `tx` y no con el `db` global: así la bitácora registra
      // exactamente el estado sobre el que corre el UPDATE.
      const before = await employeeRepository.findById(parsedId.data, tx);
      if (!before) return null;

      const after = await employeeRepository.update(tx, parsedId.data, body.data);
      if (!after) return null;

      await logAudit(tx, {
        actorId: actor.id,
        action: 'employee.updated',
        entityType: 'employee',
        entityId: after.id,
        severity: 'warning',
        // Los dos extremos saneados: un cambio de salario se registra como el booleano
        // de abajo, nunca con las cifras (D-8, AC17).
        changes: { before: toAuditableEmployee(before), after: toAuditableEmployee(after) },
        metadata: {
          employeeCode: after.employeeCode,
          salaryChanged: hasSalaryChange(before, after),
        },
        context: getAuditContext(request),
      });

      return after;
    });

    if (!updated) return NextResponse.json(NOT_FOUND, { status: 404 });

    return NextResponse.json(updated);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'PATCH /api/admin/employees/[id]',
      fallback: 'No se pudo actualizar al empleado',
      uniqueViolationMessage: EMPLOYEE_CONFLICT_MESSAGES,
    });
  }
}

// Baja lógica y nunca borrado: la fila sigue existiendo con `is_active = false` y sus
// pagos anteriores siguen siendo consultables (AC7).
export async function DELETE(request: Request, context: Context) {
  try {
    const { actor } = await authorize('payroll.manage');

    const parsedId = await parseId(context);
    if (!parsedId.success) return badRequest(INVALID_EMPLOYEE_ID_MESSAGE);

    const deactivated = await db.transaction(async (tx) => {
      const before = await employeeRepository.findById(parsedId.data, tx);
      if (!before) return null;

      // Idempotente: repetir la baja devuelve 200 sin escribir una segunda entrada en la
      // bitácora (AC7). Una entrada por clic haría imposible contar las bajas reales.
      if (!before.isActive) return before;

      const after = await employeeRepository.setActive(tx, parsedId.data, false);
      if (!after) return null;

      await logAudit(tx, {
        actorId: actor.id,
        action: 'employee.deactivated',
        entityType: 'employee',
        entityId: after.id,
        severity: 'warning',
        changes: { before: { isActive: before.isActive }, after: { isActive: after.isActive } },
        metadata: { employeeCode: after.employeeCode },
        context: getAuditContext(request),
      });

      return after;
    });

    if (!deactivated) return NextResponse.json(NOT_FOUND, { status: 404 });

    return NextResponse.json(deactivated);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'DELETE /api/admin/employees/[id]',
      fallback: 'No se pudo dar de baja al empleado',
    });
  }
}
