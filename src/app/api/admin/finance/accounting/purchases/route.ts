import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { REPORTING_TIME_ZONE } from '@/lib/reporting';
import { resolveFinanceRange } from '@/modules/finance/lib/finance-range';
import { accountingQuerySchema } from '@/modules/finance/schemas/accounting.schema';
import type { PurchaseRegistryResponse } from '@/modules/finance/types/accounting.types';
import * as accountingRepository from '@/server/repositories/accounting.repository';

// Gemelo del registro de ventas y con el mismo permiso: las dos pestañas de la misma
// pantalla (AC25).
export async function GET(request: Request) {
  try {
    await authorize('finance.read');

    const { searchParams } = new URL(request.url);
    const parsed = accountingQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const now = new Date();
    const range = resolveFinanceRange(parsed.data, now);
    const { page, pageSize } = parsed.data;

    // Los **días** del rango y no sus instantes: `incurred_on` es `date` sin hora y sus dos
    // extremos son inclusivos tal y como se leen (AC9). Los dos salen del mismo
    // `resolveFinanceRange()`, así que las dos pestañas no pueden discrepar sobre el
    // período.
    const { data, total } = await accountingRepository.findPurchaseRegistry(range, {
      page,
      pageSize,
    });

    const body: PurchaseRegistryResponse = {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        range: { from: range.fromDay, to: range.toDay },
        timeZone: REPORTING_TIME_ZONE,
        generatedAt: now.toISOString(),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/finance/accounting/purchases',
      fallback: 'No se pudo obtener el registro de compras',
    });
  }
}
