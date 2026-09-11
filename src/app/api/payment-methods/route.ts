import { NextResponse } from 'next/server';

import { toErrorResponse } from '@/lib/api-guard';
import { requireActiveUser } from '@/lib/auth';
import type { SavedCardListResponse } from '@/modules/payments/types/payment-method.types';
import * as paymentMethodRepository from '@/server/repositories/payment-method.repository';

// Mismo preámbulo que `POST /api/payment-methods/setup`: sin permiso RBAC, con
// `requireActiveUser()` y con la propiedad de la fila como autorización real. El
// filtro por `user_id` va dentro del `WHERE` del repositorio, no después de leer
// (D-4, AC9).
//
// Sin schema Zod porque no hay entrada: la consulta no acepta ningún parámetro y el
// único dato que la parametriza es el `user.id` de la sesión.
export async function GET() {
  try {
    const user = await requireActiveUser();

    // La lista la sirve nuestra base, no Stripe: el requerimiento pide persistir la
    // referencia, y una llamada de red por cada apertura de `/account` pagaría
    // latencia en la ruta más visitada de la cuenta para pintar cuatro campos que no
    // cambian (D-5).
    const data = await paymentMethodRepository.findManyByUser(user.id);

    const body: SavedCardListResponse = { data };
    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/payment-methods',
      fallback: 'No se pudieron obtener tus tarjetas guardadas',
    });
  }
}
