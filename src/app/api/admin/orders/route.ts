import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { can } from '@/lib/permissions';
import { adminOrderQuerySchema } from '@/modules/orders/schemas/admin-order.schema';
import type { AdminOrderListResponse } from '@/modules/orders/types/order.types';
import * as orderRepository from '@/server/repositories/order.repository';

// Solo lectura: la única mutación del panel es la cancelación, y vive en
// `[id]/route.ts` bajo otro permiso.
export async function GET(request: Request) {
  try {
    // Antes de tocar la query: un usuario sin permiso no debe poder enumerar el
    // contrato de la API a base de 400 antes de recibir su 403 (AC2).
    const { granted } = await authorize('orders.read');

    const { searchParams } = new URL(request.url);
    const parsed = adminOrderQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const { data, total } = await orderRepository.findManyForAdmin(parsed.data);
    const { page, pageSize } = parsed.data;

    // Cero resultados es un 200 con `data: []`: «no hay pedidos que casen» no es un
    // recurso ausente (§6).
    const body: AdminOrderListResponse = {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        // Se resuelve en el servidor y viaja en el `meta`: la UI oculta controles,
        // pero quien decide es el permiso, y el PATCH lo vuelve a comprobar (D-11).
        canUpdateStatus: can(granted, 'orders.update_status'),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/orders',
      fallback: 'No se pudo obtener el listado de pedidos',
    });
  }
}
