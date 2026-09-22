import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext, logAudit } from '@/lib/audit';
import { can } from '@/lib/permissions';
import { PRODUCT_CONFLICT_MESSAGES } from '@/modules/products/constants';
import { toAuditableProduct } from '@/modules/products/lib/product-audit';
import {
  createProductSchema,
  productQuerySchema,
} from '@/modules/products/schemas/product.schema';
import type { ProductListResponse } from '@/modules/products/types/product.types';
import { db } from '@/server/db';
import * as productRepository from '@/server/repositories/product.repository';

const CATEGORY_NOT_FOUND_MESSAGE = 'La categoría elegida no existe.';

export async function GET(request: Request) {
  try {
    // Autenticación y autorización antes de mirar la query: quien no tiene permiso
    // recibe 403 sin poder enumerar el contrato a base de 400.
    const { granted } = await authorize('products.read');

    const { searchParams } = new URL(request.url);
    const parsed = productQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const { data, total } = await productRepository.findMany(parsed.data);
    const { page, pageSize } = parsed.data;

    const body: ProductListResponse = {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        // El cliente no decide permisos: los recibe resueltos y solo los usa para
        // ocultar controles. `audit` ve la tabla y ninguna acción (AC15).
        canCreate: can(granted, 'products.create'),
        canUpdate: can(granted, 'products.update'),
        canDelete: can(granted, 'products.delete'),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/products',
      fallback: 'No se pudieron obtener los productos',
    });
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await authorize('products.create');

    const body = await parseJsonBody(request, createProductSchema, 'Datos del producto inválidos');
    if (!body.ok) return body.response;

    const created = await db.transaction(async (tx) => {
      // Dentro de la transacción: si la categoría desapareciera entre la
      // comprobación y el INSERT, la FK aborta y revierte todo igualmente. Esto
      // solo convierte el caso normal en un 400 que nombra el campo en vez de un
      // 500 de clave foránea (AC11).
      if (!(await productRepository.categoryExists(body.data.categoryId, tx))) return null;

      const product = await productRepository.create(tx, body.data);

      await logAudit(tx, {
        actorId: actor.id,
        action: 'product.created',
        entityType: 'product',
        entityId: product.id,
        // Sin `averageCostCents`: `audit` lee la bitácora y no tiene `finance.read`
        // (spec 021, D-9, AC17). El alta nunca fija un costo, así que aquí sería un
        // `null` que además abriría el camino.
        changes: { before: null, after: toAuditableProduct(product) },
        context: getAuditContext(request),
      });

      return product;
    });

    if (!created) return badRequest(CATEGORY_NOT_FOUND_MESSAGE);

    // La misma proyección en la respuesta: el costo no sale del módulo financiero por
    // ninguna de las dos puertas (AC17).
    return NextResponse.json(toAuditableProduct(created), { status: 201 });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/admin/products',
      fallback: 'No se pudo crear el producto',
      uniqueViolationMessage: PRODUCT_CONFLICT_MESSAGES,
    });
  }
}
