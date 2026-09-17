import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext, logAudit } from '@/lib/audit';
import { can } from '@/lib/permissions';
import { EMPLOYEE_CONFLICT_MESSAGES } from '@/modules/payroll/constants';
import { toAuditableEmployee } from '@/modules/payroll/lib/auditable-employee';
import {
  createEmployeeSchema,
  employeeQuerySchema,
} from '@/modules/payroll/schemas/employee.schema';
import type { EmployeeListResponse } from '@/modules/payroll/types/employee.types';
import { db } from '@/server/db';
import * as employeeRepository from '@/server/repositories/employee.repository';

// El recurso se llama `/employees` pero el código de permiso es del dominio
// (`payroll.*`): el nombre del permiso es lo que se concede, no la ruta (D-10).
export async function GET(request: Request) {
  try {
    // Antes de tocar la query: un `?page=abc` de quien no tiene permiso responde 403 y
    // no 400 (AC2).
    const { granted } = await authorize('payroll.read');

    const { searchParams } = new URL(request.url);
    const parsed = employeeQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const { data, total } = await employeeRepository.findMany(parsed.data);
    const { page, pageSize } = parsed.data;

    const body: EmployeeListResponse = {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        // Resuelto en el servidor; la UI solo oculta controles. La frontera real es el
        // 403 de cada mutación, que se vuelve a comprobar (AC3).
        canManage: can(granted, 'payroll.manage'),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/employees',
      fallback: 'No se pudo obtener el personal',
    });
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await authorize('payroll.manage');

    const body = await parseJsonBody(request, createEmployeeSchema, 'Datos del empleado inválidos');
    if (!body.ok) return body.response;

    // El alta y su entrada de bitácora en la misma transacción: si el INSERT falla, no
    // queda ninguna de las dos (AC16). Se orquesta aquí y no en un service porque toca
    // un solo repositorio, igual que productos y categorías (D-9).
    const created = await db.transaction(async (tx) => {
      const employee = await employeeRepository.create(tx, body.data);

      await logAudit(tx, {
        actorId: actor.id,
        action: 'employee.created',
        entityType: 'employee',
        entityId: employee.id,
        // `severity: 'warning'` en las cinco acciones del módulo: con `info` el alta se
        // purgaría a los 180 días mientras sus pagos siguen ahí (D-20).
        severity: 'warning',
        // Saneado por `toAuditableEmployee()`: el salario no entra en la bitácora, que
        // leen roles sin `payroll.read` (D-8, AC17).
        changes: { before: null, after: toAuditableEmployee(employee) },
        metadata: { employeeCode: employee.employeeCode },
        context: getAuditContext(request),
      });

      return employee;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/admin/employees',
      fallback: 'No se pudo registrar al empleado',
      // El conflicto lo detecta el constraint y no un SELECT previo: un pre-check
      // dejaría una carrera entre la lectura y el INSERT (AC5).
      uniqueViolationMessage: EMPLOYEE_CONFLICT_MESSAGES,
    });
  }
}
