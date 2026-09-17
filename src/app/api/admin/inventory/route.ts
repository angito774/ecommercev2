import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { can } from '@/lib/permissions';
import { inventoryQuerySchema } from '@/modules/inventory/schemas/inventory.schema';
import type { InventoryListResponse } from '@/modules/inventory/types/inventory.types';
import { LOW_STOCK_THRESHOLD } from '@/modules/products/constants';
import * as inventoryRepository from '@/server/repositories/inventory.repository';

// Solo lectura: no hay verbo de escritura en este recurso. Corregir el stock sigue
// siendo `PATCH /api/admin/products/[id]` bajo `products.update`, que ya escribe
// `product.updated` en `audit_logs` dentro de su transacción (§3, §6).
export async function GET(request: Request) {
  try {
    // Antes de tocar la query: un usuario sin permiso no debe poder enumerar el
    // contrato de la API a base de 400 antes de recibir su 403 (D-15, AC2).
    const { granted } = await authorize('inventory.read');

    const { searchParams } = new URL(request.url);
    const parsed = inventoryQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    // El umbral lo pone el servidor y no la query: ningún parámetro puede ensanchar
    // el listado más allá de lo que es una alerta de reposición (D-9).
    const { data, total } = await inventoryRepository.findLowStock(
      parsed.data,
      LOW_STOCK_THRESHOLD,
    );
    const { page, pageSize } = parsed.data;

    // Cero filas es un 200 con `data: []`, nunca un 404: «ningún producto bajo el
    // umbral» es una respuesta legítima —y la buena— del recurso (AC12).
    const body: InventoryListResponse = {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        // El mismo número que filtró la consulta, para que el rótulo de la pantalla
        // no pueda decir otro.
        threshold: LOW_STOCK_THRESHOLD,
        // Se resuelve en el servidor y viaja en el `meta`: la UI oculta controles,
        // pero quien decide es el permiso, y el PATCH lo vuelve a comprobar (AC13).
        canUpdateProduct: can(granted, 'products.update'),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/inventory',
      fallback: 'No se pudo obtener el inventario',
    });
  }
}
