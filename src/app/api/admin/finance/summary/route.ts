import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { REPORTING_TIME_ZONE } from '@/lib/reporting';
import { marginPercent } from '@/modules/finance/lib/finance-math';
import { resolveFinanceRange } from '@/modules/finance/lib/finance-range';
import { financeRangeSchema } from '@/modules/finance/schemas/finance.schema';
import type {
  FinanceSummaryResponse,
  PurchaseIgvTotals,
} from '@/modules/finance/types/finance.types';
import * as financeRepository from '@/server/repositories/finance.repository';

// Solo lectura. El endpoint no acepta `category` a propósito: «resultado del período»
// tiene que significar lo mismo mientras se explora el detalle, y la firma es lo que
// hace imposible colárselo (D-17, AC20).
export async function GET(request: Request) {
  try {
    // Antes de tocar la query: sin permiso no se debe poder enumerar el contrato a
    // base de 400 antes de recibir el 403 (D-14, AC2).
    await authorize('finance.read');

    const { searchParams } = new URL(request.url);
    const parsed = financeRangeSchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    // Un único instante para el rango y para `generatedAt`: con dos `new Date()` el
    // sello de la respuesta podría pertenecer a un día distinto del que se consultó.
    const now = new Date();
    const range = resolveFinanceRange(parsed.data, now);

    // En paralelo: tres lecturas fijas e independientes, así que el coste es el de la
    // más lenta y no la suma.
    const [sales, expenseTotals, byCategory] = await Promise.all([
      financeRepository.findSalesTotals(range),
      financeRepository.findExpenseTotals(range),
      financeRepository.findExpenseTotalsByCategory(range),
    ]);

    // Resta de enteros en céntimos; puede ser negativo (AC9). La división por 100 solo
    // ocurre al formatear en la vista (AC22).
    const netCents = sales.revenueCents - expenseTotals.expensesCents;

    const {
      igvCreditableCents,
      igvCreditableCount,
      igvTotalCents,
      igvCount,
      ...expenseSums
    } = expenseTotals;

    // Lo no deducible se **deriva por resta entera** y no con una quinta consulta: al
    // salir los dos de la misma fila del mismo SELECT, es imposible que diverjan (D-9).
    // Los dos números se publican por separado y nunca sumados (AC14, D-10).
    const purchaseIgv: PurchaseIgvTotals = {
      creditableCents: igvCreditableCents,
      creditableCount: igvCreditableCount,
      nonCreditableCents: igvTotalCents - igvCreditableCents,
      nonCreditableCount: igvCount - igvCreditableCount,
    };

    // Un rango sin ventas y sin gastos es un 200 con ceros, nunca un 404: el recurso
    // «resumen del rango» existe siempre (AC11).
    const body: FinanceSummaryResponse = {
      data: {
        ...sales,
        ...expenseSums,
        netCents,
        marginPercent: marginPercent(sales.revenueCents, netCents),
        expensesByCategory: byCategory,
        // Dato al lado, no un sumando: `netCents` y `marginPercent` siguen diciendo
        // exactamente lo que decían antes de este spec (§3).
        purchaseIgv,
      },
      meta: {
        range: { from: range.fromDay, to: range.toDay },
        timeZone: REPORTING_TIME_ZONE,
        generatedAt: now.toISOString(),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/finance/summary',
      fallback: 'No se pudo obtener el resumen financiero',
    });
  }
}
