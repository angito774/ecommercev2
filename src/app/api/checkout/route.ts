import { NextResponse } from 'next/server';

import { parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { requireActiveUser } from '@/lib/auth';
import { checkoutSchema } from '@/modules/orders/schemas/checkout.schema';
import type { CheckoutResponse } from '@/modules/orders/schemas/checkout.schema';
import { startCheckout } from '@/server/services/checkout.service';

export async function POST(request: Request) {
  try {
    // Sin código de permiso: comprar no es una capacidad administrativa y exigir un
    // permiso RBAC obligaría a concedérselo al rol `customer`, que está vacío a
    // propósito. La autorización real es que `orders.user_id` sea el usuario de la
    // sesión (D-12). `requireActiveUser()` y no `requireAuth()` porque sin
    // `requirePermission()` detrás nadie miraría `is_active`, y un usuario que un
    // admin acaba de desactivar seguiría pagando con su sesión de Clerk viva.
    //
    // Nunca `auth.protect()`: en un Route Handler redirige con 307 al formulario de
    // login y axios acabaría leyendo HTML (docs/SETUP.md §6).
    const user = await requireActiveUser();

    const body = await parseJsonBody(request, checkoutSchema, 'Carrito inválido');
    if (!body.ok) return body.response;

    const url = await startCheckout(user, body.data);

    const payload: CheckoutResponse = { url };
    return NextResponse.json(payload);
  } catch (error) {
    // El 409 de stock/producto inactivo y el 502 de Stripe salen de aquí sin un solo
    // `if` nuevo: los servicios lanzan `ConflictError` y `UpstreamError`.
    return toErrorResponse(error, {
      label: 'POST /api/checkout',
      fallback: 'No se pudo iniciar el pago',
    });
  }
}
