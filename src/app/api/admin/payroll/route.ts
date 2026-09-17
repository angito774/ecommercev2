import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext } from '@/lib/audit';
import { can } from '@/lib/permissions';
import { PAYROLL_CONFLICT_MESSAGES } from '@/modules/payroll/constants';
import {
  createPayrollPaymentSchema,
  payrollQuerySchema,
} from '@/modules/payroll/schemas/payroll.schema';
import type { PayrollListResponse } from '@/modules/payroll/types/payroll.types';
import * as payrollPaymentRepository from '@/server/repositories/payroll-payment.repository';
import * as payrollService from '@/server/services/payroll.service';

export async function GET(request: Request) {
  try {
    const { granted } = await authorize('payroll.read');

    const { searchParams } = new URL(request.url);
    const parsed = payrollQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const { data, total } = await payrollPaymentRepository.findMany(parsed.data);
    const { page, pageSize } = parsed.data;

    const body: PayrollListResponse = {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        canManage: can(granted, 'payroll.manage'),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/payroll',
      fallback: 'No se pudieron obtener los pagos de nómina',
    });
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await authorize('payroll.manage');

    const body = await parseJsonBody(request, createPayrollPaymentSchema, 'Datos del pago inválidos');
    if (!body.ok) return body.response;

    // El service cruza dos repositorios (empleado + pago) y escribe la bitácora dentro
    // de la misma transacción. Lanza NotFoundError/ConflictError/ValidationError, que
    // `toErrorResponse` traduce (D-9).
    const payment = await payrollService.registerPayment({
      actor,
      context: getAuditContext(request),
      input: body.data,
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/admin/payroll',
      fallback: 'No se pudo registrar el pago',
      // Red de seguridad del índice parcial: si dos pestañas registran el mismo periodo
      // a la vez, el segundo INSERT cae aquí como 409 y no como 500 (D-19).
      uniqueViolationMessage: PAYROLL_CONFLICT_MESSAGES,
    });
  }
}
