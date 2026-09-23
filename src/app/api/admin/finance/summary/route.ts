import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { REPORTING_TIME_ZONE } from '@/lib/reporting';
import { resolveFinanceRange } from '@/modules/finance/lib/finance-range';
import { buildPeriodProfit } from '@/modules/finance/lib/profit';
import { estimateRerIncomeTax } from '@/modules/finance/lib/rer';
import { financeRangeSchema } from '@/modules/finance/schemas/finance.schema';
import type {
  DeclarableSales,
  FinanceSummaryResponse,
  PeriodProfit,
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

    // En paralelo: ocho lecturas fijas e independientes, así que el coste es el de la
    // más lenta y no la suma (015, D-5). Las tres últimas son las del spec 027.
    const [
      sales,
      expenseTotals,
      byCategory,
      declarableByKind,
      uninvoicedOrderCount,
      declarableTax,
      cogs,
      payroll,
    ] = await Promise.all([
      financeRepository.findSalesTotals(range),
      financeRepository.findExpenseTotals(range),
      financeRepository.findExpenseTotalsByCategory(range),
      financeRepository.findDeclarableSalesByKind(range),
      financeRepository.findUninvoicedPaidOrderCount(range),
      // La misma función que alimenta `/admin/finance/taxes`: es lo que hace imposible que
      // las dos pantallas discrepen sobre el ingreso neto del rango (027, AC8, D-1).
      financeRepository.findDeclarableTaxTotals(range),
      financeRepository.findCogsTotals(range),
      financeRepository.findPayrollTotals(range),
    ]);

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

    // El total se **deriva del desglose** con una suma entera y no con una segunda
    // consulta: así es imposible que el total y sus partes discrepen (025, AC13, D-4).
    // Misma técnica que la resta con la que se deriva `nonCreditableCents`.
    const declarableSales: DeclarableSales = {
      amountCents: declarableByKind.reduce((total, row) => total + row.amountCents, 0),
      byKind: declarableByKind,
      uninvoicedOrderCount,
    };

    // Las tres restas viven en un módulo puro con test, no aquí: el handler orquesta y no
    // calcula (027, §6.4). El IGV **no** es un parámetro —no resta de ninguno de los tres
    // niveles (D-10, AC20)— y la división por 100 solo ocurre al formatear (AC26).
    const profit: PeriodProfit = buildPeriodProfit({
      netRevenueCents: declarableTax.baseCents,
      cogs,
      // Resta entera sobre dos campos que salen de la **misma fila del mismo SELECT** que
      // el handler ya pide: ni una consulta nueva ni una función nueva (D-6, AC14). Un
      // gasto con factura resta solo su base; uno con boleta, recibo por honorarios, otro
      // comprobante o sin comprobante resta su importe completo.
      operatingExpensesCents: expenseTotals.expensesCents - expenseTotals.igvCreditableCents,
      payrollCents: payroll.amountCents,
      payrollPaymentCount: payroll.paymentCount,
      // La misma función pura que `/admin/finance/taxes`, sobre la misma base: los dos
      // números no pueden discrepar (AC19).
      incomeTaxCents: estimateRerIncomeTax(declarableTax.baseCents),
    });

    // Un rango sin ventas y sin gastos es un 200 con ceros, nunca un 404: el recurso
    // «resumen del rango» existe siempre (AC11, 025 AC14).
    const body: FinanceSummaryResponse = {
      data: {
        ...sales,
        ...expenseSums,
        expensesByCategory: byCategory,
        // Dato al lado y no un sumando: el IGV de compras es el insumo del crédito fiscal,
        // no un costo de la empresa (027, D-10).
        purchaseIgv,
        declarableSales,
        // Reemplaza a `netCents` y `marginPercent`, que ya no existen en el contrato
        // (027, D-11, AC24).
        profit,
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
