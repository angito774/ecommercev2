import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { purchaseRegistryCsv, registryFileName } from '@/modules/finance/lib/accounting-csv';
import { resolveFinanceRange } from '@/modules/finance/lib/finance-range';
import { financeRangeSchema } from '@/modules/finance/schemas/finance.schema';
import * as accountingRepository from '@/server/repositories/accounting.repository';

// Gemelo de la exportación de ventas (D-13): un `Content-Type` y una responsabilidad por
// archivo.
export async function GET(request: Request) {
  try {
    await authorize('finance.read');

    const { searchParams } = new URL(request.url);
    const parsed = financeRangeSchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const range = resolveFinanceRange(parsed.data, new Date());

    // Sin paginar: el archivo trae todas las compras del rango (AC19, D-7).
    const { data } = await accountingRepository.findPurchaseRegistry(range, null);

    return new NextResponse(purchaseRegistryCsv(data), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${registryFileName('purchases', {
          from: range.fromDay,
          to: range.toDay,
        })}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/finance/accounting/purchases/export',
      fallback: 'No se pudo exportar el registro de compras',
    });
  }
}
