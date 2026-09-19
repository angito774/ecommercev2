import { NextResponse } from 'next/server';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { NotFoundError } from '@/lib/errors';
import { inventoryDocumentIdSchema } from '@/modules/inventory/schemas/inventory-document.schema';
import * as inventoryDocumentRepository from '@/server/repositories/inventory-document.repository';

type Context = RouteContext<'/api/admin/inventory/documents/[id]'>;

const INVALID_ID = 'El identificador del documento no es válido';

const DOCUMENT_NOT_FOUND_MESSAGE = 'El documento de inventario no existe.';

// Solo `GET`. El detalle es de lectura pura: el documento no se edita, no se borra y no
// se anula (AC11, D-9).
export async function GET(_request: Request, context: Context) {
  try {
    // La autorización va antes de mirar el id: sin `inventory.read` la respuesta es 403
    // y no 400, aunque el uuid venga mal (AC2).
    await authorize('inventory.read');

    // En Next 16 `params` es una promesa, por eso el await antes de validar.
    const { id } = await context.params;
    const parsedId = inventoryDocumentIdSchema.safeParse(id);
    if (!parsedId.success) return badRequest(INVALID_ID);

    const document = await inventoryDocumentRepository.findById(parsedId.data);
    if (!document) throw new NotFoundError(DOCUMENT_NOT_FOUND_MESSAGE);

    return NextResponse.json(document);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/inventory/documents/[id]',
      fallback: 'No se pudo obtener el documento de inventario',
    });
  }
}
