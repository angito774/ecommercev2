import { NextResponse } from 'next/server';

import { badRequest, toErrorResponse } from '@/lib/api-guard';
import { requireActiveUser } from '@/lib/auth';
import { orderHistoryQuerySchema } from '@/modules/orders/schemas/order-history.schema';
import type { OrderHistoryResponse } from '@/modules/orders/types/order.types';
import * as orderRepository from '@/server/repositories/order.repository';

// Sin código de permiso RBAC, por lo mismo que `POST /api/checkout` (spec 007,
// D-12): ver las compras propias no es una capacidad administrativa y exigir un
// permiso obligaría a concedérselo al rol `customer`, vacío a propósito. La
// autorización real es la propiedad de la fila, y va dentro del `WHERE` del
// repositorio.
//
// `requireActiveUser()` y no `requireAuth()`: sin `requirePermission()` detrás no
// queda nadie que mire `is_active`, y una cuenta desactivada desde el panel
// seguiría leyendo su historial mientras su sesión de Clerk siguiera viva (AC13).
// Nunca `auth.protect()`: en un Route Handler redirige con 307 al formulario de
// login y axios acabaría leyendo HTML (docs/SETUP.md §6, AC1).
export async function GET(request: Request) {
  try {
    const user = await requireActiveUser();

    const { searchParams } = new URL(request.url);
    const parsed = orderHistoryQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Rango de fechas inválido', parsed.error.issues);
    }

    const { data, truncated } = await orderRepository.findManyByUser(user.id, parsed.data);

    const body: OrderHistoryResponse = { data, meta: { truncated } };
    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/orders',
      fallback: 'No se pudo obtener tu historial de compras',
    });
  }
}
