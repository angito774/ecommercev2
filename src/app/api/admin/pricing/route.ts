import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { can } from '@/lib/permissions';
import { pricingQuerySchema } from '@/modules/finance/schemas/pricing.schema';
import type { PricingListResponse } from '@/modules/finance/types/pricing.types';
import * as pricingRepository from '@/server/repositories/pricing.repository';

// Se autoriza con `finance.read`, el mismo permiso que el resumen: las dos pantallas son
// el módulo financiero y aparecen y desaparecen juntas de la navegación (spec 021, D-13).
export async function GET(request: Request) {
  try {
    // Antes de tocar la query: un `?page=abc` de quien no tiene permiso responde 403 y no
    // 400, así que nadie enumera el contrato a base de 400 antes de recibir su 403
    // (AC2).
    const { granted } = await authorize('finance.read');

    const { searchParams } = new URL(request.url);
    const parsed = pricingQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const { data, total } = await pricingRepository.findPricingRows(parsed.data);
    const { page, pageSize } = parsed.data;

    // Cero filas es `200` con `data: []` y no un 404: un catálogo sin productos activos,
    // o una búsqueda sin resultados, son respuestas legítimas y la tabla tiene su propio
    // estado vacío para cada caso (AC24).
    const body: PricingListResponse = {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        // Resuelto en el servidor; la UI solo oculta la acción. La frontera real es el
        // 403 del POST, que lo vuelve a comprobar (AC4).
        canSetInitialCost: can(granted, 'pricing.set_initial_cost'),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/pricing',
      fallback: 'No se pudo obtener el precio unitario',
    });
  }
}
