import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext, logAudit } from '@/lib/audit';
import { PRODUCT_CONFLICT_MESSAGES } from '@/modules/products/constants';
import {
  COMPARE_AT_PRICE_MESSAGE,
  isValidComparePrice,
  productIdSchema,
  updateProductSchema,
} from '@/modules/products/schemas/product.schema';
import { db } from '@/server/db';
import * as productRepository from '@/server/repositories/product.repository';

type Context = RouteContext<'/api/admin/products/[id]'>;

const NOT_FOUND = { message: 'Producto no encontrado' };
const INVALID_ID_MESSAGE = 'El identificador del producto no es válido';
const CATEGORY_NOT_FOUND_MESSAGE = 'La categoría elegida no existe.';

// En Next 16 `params` es una promesa, por eso el await antes de validar.
async function parseId(context: Context) {
  const { id } = await context.params;
  return productIdSchema.safeParse(id);
}

export async function GET(_request: Request, context: Context) {
  try {
    await authorize('products.read');

    const parsedId = await parseId(context);
    if (!parsedId.success) return badRequest(INVALID_ID_MESSAGE);

    const product = await productRepository.findByIdWithCategory(parsedId.data);
    if (!product) return NextResponse.json(NOT_FOUND, { status: 404 });

    return NextResponse.json(product);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/products/[id]',
      fallback: 'No se pudo obtener el producto',
    });
  }
}

// Distingue "no existe el producto" de "no existe la categoría": los dos casos
// abortan la transacción devolviendo null y sin ese matiz el PATCH respondería 404
// cuando el fallo real está en el cuerpo.
type UpdateOutcome =
  | { kind: 'ok'; product: Awaited<ReturnType<typeof productRepository.update>> }
  | { kind: 'not-found' }
  | { kind: 'invalid-category' }
  | { kind: 'invalid-compare-price' };

export async function PATCH(request: Request, context: Context) {
  try {
    const { actor } = await authorize('products.update');

    const parsedId = await parseId(context);
    if (!parsedId.success) return badRequest(INVALID_ID_MESSAGE);

    const body = await parseJsonBody(request, updateProductSchema, 'Datos del producto inválidos');
    if (!body.ok) return body.response;

    const outcome = await db.transaction(async (tx): Promise<UpdateOutcome> => {
      // El `before` se lee con el `tx` y no con el `db` global: así la bitácora
      // registra exactamente el estado sobre el que corre el UPDATE.
      const before = await productRepository.findById(parsedId.data, tx);
      if (!before) return { kind: 'not-found' };

      const { categoryId } = body.data;
      if (categoryId && !(await productRepository.categoryExists(categoryId, tx))) {
        return { kind: 'invalid-category' };
      }

      // El invariante precio anterior > precio actual es cruzado, y un PATCH puede
      // traer solo uno de los dos campos: se comprueba sobre la fila resultante
      // —lo que ya hay en la tabla más lo que llega—, no sobre el cuerpo suelto.
      // `updateProductSchema` no puede hacerlo por ser parcial (spec 004, C-4).
      const merged = { ...before, ...body.data };
      if (!isValidComparePrice(merged.priceCents, merged.compareAtPriceCents)) {
        return { kind: 'invalid-compare-price' };
      }

      const after = await productRepository.update(tx, parsedId.data, body.data);
      if (!after) return { kind: 'not-found' };

      await logAudit(tx, {
        actorId: actor.id,
        action: 'product.updated',
        entityType: 'product',
        entityId: after.id,
        changes: { before, after },
        context: getAuditContext(request),
      });

      return { kind: 'ok', product: after };
    });

    if (outcome.kind === 'not-found') return NextResponse.json(NOT_FOUND, { status: 404 });
    if (outcome.kind === 'invalid-category') return badRequest(CATEGORY_NOT_FOUND_MESSAGE);
    if (outcome.kind === 'invalid-compare-price') return badRequest(COMPARE_AT_PRICE_MESSAGE);

    return NextResponse.json(outcome.product);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'PATCH /api/admin/products/[id]',
      fallback: 'No se pudo actualizar el producto',
      uniqueViolationMessage: PRODUCT_CONFLICT_MESSAGES,
    });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { actor } = await authorize('products.delete');

    const parsedId = await parseId(context);
    if (!parsedId.success) return badRequest(INVALID_ID_MESSAGE);

    // Borrado lógico: la fila permanece con is_active = false para no romper las
    // referencias futuras de order_items.
    const deactivated = await db.transaction(async (tx) => {
      const before = await productRepository.findById(parsedId.data, tx);
      if (!before) return null;

      // Idempotente: desactivar lo ya desactivado no cambia nada, así que devuelve
      // la fila sin escribir una entrada de bitácora con before === after. No es un
      // 404: el producto existe.
      if (!before.isActive) return before;

      const product = await productRepository.softDelete(tx, parsedId.data);
      if (!product) return null;

      await logAudit(tx, {
        actorId: actor.id,
        action: 'product.deactivated',
        entityType: 'product',
        entityId: product.id,
        changes: { before: { isActive: before.isActive }, after: { isActive: product.isActive } },
        context: getAuditContext(request),
      });

      return product;
    });

    if (!deactivated) return NextResponse.json(NOT_FOUND, { status: 404 });

    return NextResponse.json(deactivated);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'DELETE /api/admin/products/[id]',
      fallback: 'No se pudo desactivar el producto',
    });
  }
}
