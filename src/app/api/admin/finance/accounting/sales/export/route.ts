import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { registryFileName, salesRegistryCsv } from '@/modules/finance/lib/accounting-csv';
import { resolveFinanceRange } from '@/modules/finance/lib/finance-range';
import { financeRangeSchema } from '@/modules/finance/schemas/finance.schema';
import * as accountingRepository from '@/server/repositories/accounting.repository';

// Ruta propia y no el listado con `?format=csv` (D-13): una ruta que devuelve JSON o texto
// según un query param obliga a cada consumidor a decidir primero qué forma le va a
// llegar, y mezcla dos contratos de error en un mismo handler. Lo que comparten —permiso,
// rango, repositorio y serializador— se importa, que es lo único que valía la pena
// compartir.
export async function GET(request: Request) {
  try {
    await authorize('finance.read');

    // `financeRangeSchema` tal cual: la exportación no pagina, así que no tiene `page` ni
    // `pageSize` que validar (AC19).
    const { searchParams } = new URL(request.url);
    const parsed = financeRangeSchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const range = resolveFinanceRange(parsed.data, new Date());

    // `null` de paginación: el archivo trae **todas** las filas del rango, sin tope que
    // trunque en silencio. Un registro contable truncado es un registro incorrecto (D-7).
    const { data } = await accountingRepository.findSalesRegistry(range, null);

    // `NextResponse` con cuerpo de texto y no `NextResponse.json`. Los errores siguen
    // saliendo por `toErrorResponse()` como JSON, que es lo que el cliente convierte en
    // toast sin descargar nada (AC22).
    return new NextResponse(salesRegistryCsv(data), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        // El mismo nombre que pone el cliente en el `a.download`, construido por la misma
        // función pura (AC20).
        'Content-Disposition': `attachment; filename="${registryFileName('sales', {
          from: range.fromDay,
          to: range.toDay,
        })}"`,
        // Un archivo con RUCs, razones sociales e importes no se queda en ninguna caché
        // intermedia (AC21).
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/finance/accounting/sales/export',
      fallback: 'No se pudo exportar el registro de ventas',
    });
  }
}
