import { NextResponse } from 'next/server';

import { badRequest, toErrorResponse } from '@/lib/api-guard';
import { requireActiveUser } from '@/lib/auth';
import { orderHistoryQuerySchema } from '@/modules/orders/schemas/order-history.schema';
import type { OrderHistoryResponse } from '@/modules/orders/types/order.types';
import * as electronicDocumentRepository from '@/server/repositories/electronic-document.repository';
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

    // **Una sola consulta con `inArray` para toda la página**, no una por pedido: el
    // historial trae hasta 60 cabeceras y la versión ingenua serían 60 viajes al pool
    // serverless. Mismo patrón que las líneas (spec 008, §10).
    //
    // No hace falta volver a filtrar por propiedad: los ids salen de `findManyByUser`, que
    // ya lleva el `user_id` dentro de su `WHERE`, así que aquí no hay forma de pedir el
    // comprobante de un pedido ajeno.
    //
    // Con el enlace al PDF: es el comprobante del propio comprador, emitido a su nombre, y
    // el `WHERE` de arriba ya garantiza que solo salen sus pedidos (D-19).
    const documentsByOrder = await electronicDocumentRepository.findRowsByOrderIds(
      data.map((order) => order.id),
      { includePdfUrl: true },
    );

    const body: OrderHistoryResponse = {
      // Array vacío y no `undefined` cuando el pedido no tiene comprobante: la vista no
      // debe distinguir «no tiene» de «no vino».
      data: data.map((order) => ({ ...order, documents: documentsByOrder.get(order.id) ?? [] })),
      meta: { truncated },
    };
    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/orders',
      fallback: 'No se pudo obtener tu historial de compras',
    });
  }
}
