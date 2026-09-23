import { NextResponse } from 'next/server';
import { z } from 'zod';

import { authorize, badRequest, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext } from '@/lib/audit';
import {
  INVALID_DOCUMENT_ID_MESSAGE,
  ISSUE_FAILED_FALLBACK_MESSAGE,
} from '@/modules/invoicing/constants';
import { issueDocument } from '@/server/services/electronic-document.service';

type Context = RouteContext<'/api/admin/invoicing/documents/[id]/issue'>;

const documentIdSchema = z.uuid();

/**
 * **La única puerta de emisión**, válida tanto para el primer intento (`pending`) como para
 * cualquiera posterior (`failed`): sin automatismo detrás, emitir por primera vez y volver
 * a emitir son la misma operación sobre la misma fila, con el mismo par serie-número, así
 * que dos endpoints serían dos copias de lo mismo con un `if` de estado distinto —y ese
 * estado ya vive en el `WHERE` del reclamo— (D-10).
 *
 * `POST` y no `PATCH`: no se propone ningún cambio de campos, se dispara una acción sobre
 * un recurso. Y **sin cuerpo**: todo lo que hace falta para emitir —serie, número,
 * importes, comprador— está en la fila desde que se creó (D-6), así que no hay nada que
 * validar más allá del id.
 */
export async function POST(request: Request, context: Context) {
  try {
    // Mismo preámbulo que el resto de /api/admin: la verificación corre **dentro del
    // recurso** (CLAUDE.md regla 8), nunca en `proxy.ts`, y nunca `auth.protect()`, que en
    // un Route Handler redirige con 307 al login y dejaría a axios leyendo HTML (AC18).
    const { actor } = await authorize('invoicing.issue');

    // En Next 16 `params` es una promesa, por eso el await antes de validar.
    const { id } = await context.params;
    const parsedId = documentIdSchema.safeParse(id);
    if (!parsedId.success) return badRequest(INVALID_DOCUMENT_ID_MESSAGE);

    const document = await issueDocument(actor, parsedId.data, getAuditContext(request));

    return NextResponse.json(document);
  } catch (error) {
    // El 404, el 409 de «ya emitido» y el 502 del proveedor salen de aquí sin un solo `if`
    // nuevo: el service lanza `NotFoundError`, `ConflictError` y `UpstreamError`, y
    // `toErrorResponse` es la única traducción fallo → status de toda la API de admin.
    return toErrorResponse(error, {
      label: 'POST /api/admin/invoicing/documents/[id]/issue',
      fallback: ISSUE_FAILED_FALLBACK_MESSAGE,
    });
  }
}
