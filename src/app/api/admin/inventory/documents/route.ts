import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext } from '@/lib/audit';
import { can } from '@/lib/permissions';
import {
  createInventoryDocumentSchema,
  DUPLICATE_ITEM_MESSAGE,
  inventoryDocumentQuerySchema,
} from '@/modules/inventory/schemas/inventory-document.schema';
import type { InventoryDocumentListResponse } from '@/modules/inventory/types/inventory-document.types';
import * as inventoryDocumentRepository from '@/server/repositories/inventory-document.repository';
import * as inventoryDocumentService from '@/server/services/inventory-document.service';

// Sin `PATCH` ni `DELETE` (AC11): los documentos no se editan, ni se borran, ni se
// anulan, y la tabla no tiene columna de anulación. La corrección es un documento en
// sentido contrario (D-9). Next responde `405` a esos verbos por no existir el export.

export async function GET(request: Request) {
  try {
    // Antes de tocar la query: un usuario sin permiso no debe poder enumerar el contrato
    // de la API a base de 400 antes de recibir su 403 (AC2).
    const { granted } = await authorize('inventory.read');

    const { searchParams } = new URL(request.url);
    const parsed = inventoryDocumentQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const { data, total } = await inventoryDocumentRepository.findMany(parsed.data);
    const { page, pageSize } = parsed.data;

    // Cero documentos es un 200 con `data: []`, nunca un 404.
    const body: InventoryDocumentListResponse = {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        // Se resuelve en el servidor y viaja en el `meta`: la UI oculta los botones de
        // nota, pero quien decide es el permiso, y el POST lo vuelve a comprobar (AC3).
        canMove: can(granted, 'inventory.move'),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/inventory/documents',
      fallback: 'No se pudieron obtener los documentos de inventario',
    });
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await authorize('inventory.move');

    const body = await parseJsonBody(
      request,
      createInventoryDocumentSchema,
      'Datos del documento inválidos',
    );
    if (!body.ok) return body.response;

    // El service cruza tres repositorios (producto, documento, bitácora) y corre en una
    // sola transacción. Lanza `NotFoundError`/`ConflictError`, que `toErrorResponse`
    // traduce a 404 y 409 (D-12).
    const document = await inventoryDocumentService.createDocument({
      actor,
      context: getAuditContext(request),
      input: body.data,
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/admin/inventory/documents',
      fallback: 'No se pudo registrar el documento',
      // Red del índice único de `(document_id, product_id)`: si algo burlase el `refine`
      // de Zod, cae como 409 y no como 500 (AC8).
      uniqueViolationMessage: DUPLICATE_ITEM_MESSAGE,
    });
  }
}
