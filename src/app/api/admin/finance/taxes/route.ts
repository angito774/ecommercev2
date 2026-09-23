import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { REPORTING_TIME_ZONE } from '@/lib/reporting';
import { resolveFinanceRange } from '@/modules/finance/lib/finance-range';
import { estimateRerIncomeTax } from '@/modules/finance/lib/rer';
import { financeRangeSchema } from '@/modules/finance/schemas/finance.schema';
import type {
  FinanceTaxesResponse,
  IgvSettlement,
  IncomeTaxEstimate,
} from '@/modules/finance/types/finance.types';
import * as financeRepository from '@/server/repositories/finance.repository';

// Solo lectura. Endpoint propio y no un campo más de `/summary` (D-1): esta pantalla no
// consume ninguno de los ocho campos del resumen ni el resumen ninguno de estos, y
// compartirlo haría que cada una pagara las lecturas de la otra.
export async function GET(request: Request) {
  try {
    // Antes de tocar la query: sin permiso no se debe poder enumerar el contrato a base
    // de 400 antes de recibir el 403 (AC2).
    await authorize('finance.read');

    const { searchParams } = new URL(request.url);
    const parsed = financeRangeSchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    // Un único instante para el rango y para `generatedAt`: con dos `new Date()` el sello
    // de la respuesta podría pertenecer a un día distinto del que se consultó.
    const now = new Date();
    const range = resolveFinanceRange(parsed.data, now);

    // Dos lecturas independientes: el coste es el de la más lenta (015, D-5). El débito
    // usa los instantes de `issued_at` y el crédito los días de `incurred_on`, los dos
    // derivados del mismo par de días (AC5).
    const [declarable, expenseTotals] = await Promise.all([
      financeRepository.findDeclarableTaxTotals(range),
      // La misma función que alimenta la card «IGV de compras» del resumen, con la tabla
      // de elegibilidad del spec 024 ya aplicada: las dos pantallas no pueden discrepar
      // (D-4, AC13, AC14).
      financeRepository.findExpenseTotals(range),
    ]);

    // Resta entera, con signo. La etiqueta la elige la vista (D-5, AC15). La división por
    // 100 solo ocurre al formatear (AC22).
    const igv: IgvSettlement = {
      debitCents: declarable.igvCents,
      debitDocumentCount: declarable.documentCount,
      debitAdjustmentCount: declarable.adjustmentCount,
      creditCents: expenseTotals.igvCreditableCents,
      creditReceiptCount: expenseTotals.igvCreditableCount,
      netCents: declarable.igvCents - expenseTotals.igvCreditableCents,
    };

    // La base viaja con su signo real aunque el estimado sea `0`: devolver `0` con una
    // base negativa es honesto y no destruye el dato crudo (D-6, AC18).
    const incomeTax: IncomeTaxEstimate = {
      baseCents: declarable.baseCents,
      estimatedCents: estimateRerIncomeTax(declarable.baseCents),
    };

    // Un rango sin comprobantes y sin gastos es un 200 con ceros, nunca un 404: el recurso
    // «impuestos del rango» existe siempre (AC21).
    const body: FinanceTaxesResponse = {
      data: { igv, incomeTax },
      meta: {
        range: { from: range.fromDay, to: range.toDay },
        timeZone: REPORTING_TIME_ZONE,
        generatedAt: now.toISOString(),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/finance/taxes',
      fallback: 'No se pudo obtener el cálculo de impuestos',
    });
  }
}
