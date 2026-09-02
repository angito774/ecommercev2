import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext, logAudit } from '@/lib/audit';
import { CATEGORY_SLUG_CONFLICT_MESSAGE } from '@/modules/categories/constants';
import {
  categoryIdSchema,
  updateCategorySchema,
} from '@/modules/categories/schemas/category.schema';
import { db } from '@/server/db';
import * as categoryRepository from '@/server/repositories/category.repository';

type Context = RouteContext<'/api/admin/categories/[id]'>;

const NOT_FOUND = { message: 'Categoría no encontrada' };

// En Next 16 `params` es una promesa, por eso el await antes de validar.
async function parseId(context: Context) {
  const { id } = await context.params;
  return categoryIdSchema.safeParse(id);
}

export async function GET(_request: Request, context: Context) {
  try {
    await authorize('categories.read');

    const parsedId = await parseId(context);
    if (!parsedId.success) return badRequest('El identificador de la categoría no es válido');

    const category = await categoryRepository.findById(parsedId.data);
    if (!category) return NextResponse.json(NOT_FOUND, { status: 404 });

    return NextResponse.json(category);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/categories/[id]',
      fallback: 'No se pudo obtener la categoría',
    });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { actor } = await authorize('categories.update');

    const parsedId = await parseId(context);
    if (!parsedId.success) return badRequest('El identificador de la categoría no es válido');

    const body = await parseJsonBody(request, updateCategorySchema, 'Datos de la categoría inválidos');
    if (!body.ok) return body.response;

    const updated = await db.transaction(async (tx) => {
      // El `before` se lee con el `tx` y no con el `db` global: así la bitácora
      // registra exactamente el estado sobre el que corre el UPDATE.
      const before = await categoryRepository.findById(parsedId.data, tx);
      if (!before) return null;

      const after = await categoryRepository.update(tx, parsedId.data, body.data);
      if (!after) return null;

      await logAudit(tx, {
        actorId: actor.id,
        action: 'category.updated',
        entityType: 'category',
        entityId: after.id,
        changes: { before, after },
        context: getAuditContext(request),
      });

      return after;
    });

    if (!updated) return NextResponse.json(NOT_FOUND, { status: 404 });

    return NextResponse.json(updated);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'PATCH /api/admin/categories/[id]',
      fallback: 'No se pudo actualizar la categoría',
      uniqueViolationMessage: CATEGORY_SLUG_CONFLICT_MESSAGE,
    });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { actor } = await authorize('categories.delete');

    const parsedId = await parseId(context);
    if (!parsedId.success) return badRequest('El identificador de la categoría no es válido');

    // Borrado lógico: la fila permanece con is_active = false para no romper las
    // futuras referencias de products.category_id.
    const deactivated = await db.transaction(async (tx) => {
      const before = await categoryRepository.findById(parsedId.data, tx);
      if (!before) return null;

      // Idempotente: desactivar lo ya desactivado no cambia nada, así que devuelve
      // la fila sin escribir una entrada de bitácora con before === after. No es un
      // 404: la categoría existe.
      if (!before.isActive) return before;

      const category = await categoryRepository.softDelete(tx, parsedId.data);
      if (!category) return null;

      await logAudit(tx, {
        actorId: actor.id,
        action: 'category.deactivated',
        entityType: 'category',
        entityId: category.id,
        changes: { before: { isActive: before.isActive }, after: { isActive: category.isActive } },
        context: getAuditContext(request),
      });

      return category;
    });

    if (!deactivated) return NextResponse.json(NOT_FOUND, { status: 404 });

    return NextResponse.json(deactivated);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'DELETE /api/admin/categories/[id]',
      fallback: 'No se pudo desactivar la categoría',
    });
  }
}
