import { NextResponse } from 'next/server';

import { toErrorResponse } from '@/lib/api-guard';
import { requireActiveUser } from '@/lib/auth';
import type { CardSetupResponse } from '@/modules/payments/types/payment-method.types';
import { startCardSetup } from '@/server/services/card-setup.service';

// Sin código de permiso RBAC, por lo mismo que `POST /api/checkout` (spec 007, D-12)
// y `GET /api/orders` (spec 008): gestionar los propios medios de pago no es una
// capacidad administrativa, y exigir un permiso obligaría a concedérselo al rol
// `customer`, vacío a propósito (D-4).
//
// `requireActiveUser()` y no `requireAuth()`: sin `requirePermission()` detrás no
// queda nadie que mire `is_active`, y una cuenta desactivada desde el panel seguiría
// guardando tarjetas mientras su sesión de Clerk siguiera viva (AC2). Nunca
// `auth.protect()`: en un Route Handler redirige con 307 al formulario de login y
// axios acabaría leyendo HTML (docs/SETUP.md §6, AC1).
//
// Sin cuerpo y sin schema Zod porque no hay entrada que validar: todo lo que el
// servidor necesita —quién es y qué Customer le corresponde— sale de la sesión. Es
// la misma garantía estructural que el spec 007 AC3.
export async function POST() {
  try {
    const user = await requireActiveUser();

    const url = await startCardSetup(user);

    const body: CardSetupResponse = { url };
    return NextResponse.json(body);
  } catch (error) {
    // El 409 del tope y el 502 de Stripe salen de aquí sin un solo `if`: el servicio
    // lanza `ConflictError` y `UpstreamError`.
    return toErrorResponse(error, {
      label: 'POST /api/payment-methods/setup',
      fallback: 'No se pudo iniciar el registro de la tarjeta',
    });
  }
}
