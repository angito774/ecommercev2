import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { REPORTING_TIME_ZONE } from '@/lib/reporting';
import { resolveFinanceRange } from '@/modules/finance/lib/finance-range';
import { accountingQuerySchema } from '@/modules/finance/schemas/accounting.schema';
import type { SalesRegistryResponse } from '@/modules/finance/types/accounting.types';
import * as accountingRepository from '@/server/repositories/accounting.repository';

// Solo lectura, con `finance.read` y sin ningún permiso nuevo: el registro es el detalle
// documento a documento detrás de la cifra «Ventas declarables» del resumen, no un recurso
// que se consulte por separado (AC25).
export async function GET(request: Request) {
  try {
    // Antes de tocar la query: un `?page=abc` de quien no tiene permiso responde 403 y no
    // 400, para que no se pueda enumerar el contrato a base de errores de validación (AC2).
    await authorize('finance.read');

    const { searchParams } = new URL(request.url);
    const parsed = accountingQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    // Un único instante para el rango y para `generatedAt`: con dos `new Date()` el sello
    // de la respuesta podría pertenecer a un día distinto del que se consultó. La misma
    // función que el resumen y que impuestos, así que el rango por defecto de las cuatro
    // pantallas no puede divergir (AC6).
    const now = new Date();
    const range = resolveFinanceRange(parsed.data, now);
    const { page, pageSize } = parsed.data;

    const { data, total } = await accountingRepository.findSalesRegistry(range, {
      page,
      pageSize,
    });

    // Un rango sin documentos es un 200 con `data: []`, nunca un 404: el recurso «registro
    // del rango» existe siempre (AC23).
    const body: SalesRegistryResponse = {
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
      label: 'GET /api/admin/finance/accounting/sales',
      fallback: 'No se pudo obtener el registro de ventas',
    });
  }
}
