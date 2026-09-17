import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext } from '@/lib/audit';
import { INVALID_PAYMENT_ID_MESSAGE } from '@/modules/payroll/constants';
import { payrollPaymentIdSchema } from '@/modules/payroll/schemas/payroll.schema';
import * as payrollService from '@/server/services/payroll.service';

type Context = RouteContext<'/api/admin/payroll/[id]'>;

// Anulación lógica y nunca borrado (D-7): la fila conserva su `amount_cents` intacto y
// aparece en el listado con el badge «Anulado». La operación es idempotente y devuelve
// 200 con el recurso en su estado final (AC15).
export async function DELETE(request: Request, context: Context) {
  try {
    const { actor } = await authorize('payroll.manage');

    // En Next 16 `params` es una promesa, por eso el await antes de validar.
    const { id } = await context.params;
    const parsedId = payrollPaymentIdSchema.safeParse(id);
    if (!parsedId.success) return badRequest(INVALID_PAYMENT_ID_MESSAGE);

    const payment = await payrollService.voidPayment({
      actor,
      context: getAuditContext(request),
      paymentId: parsedId.data,
    });

    return NextResponse.json(payment);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'DELETE /api/admin/payroll/[id]',
      fallback: 'No se pudo anular el pago',
    });
  }
}
