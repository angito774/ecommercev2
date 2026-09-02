import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext, logAudit } from '@/lib/audit';
import { CATEGORY_SLUG_CONFLICT_MESSAGE } from '@/modules/categories/constants';
import {
  categoryQuerySchema,
  createCategorySchema,
} from '@/modules/categories/schemas/category.schema';
import type { CategoryListResponse } from '@/modules/categories/types/category.types';
import { db } from '@/server/db';
import * as categoryRepository from '@/server/repositories/category.repository';

export async function GET(request: Request) {
  try {
    // Autenticación y autorización antes de mirar la query: quien no tiene permiso
    // recibe 403 sin poder enumerar el contrato a base de 400.
    await authorize('categories.read');

    const { searchParams } = new URL(request.url);
    const parsed = categoryQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const { data, total } = await categoryRepository.findMany(parsed.data);
    const { page, pageSize } = parsed.data;

    const body: CategoryListResponse = {
      data,
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/categories',
      fallback: 'No se pudo obtener las categorías',
    });
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await authorize('categories.create');

    const body = await parseJsonBody(request, createCategorySchema, 'Datos de la categoría inválidos');
    if (!body.ok) return body.response;

    const created = await db.transaction(async (tx) => {
      const category = await categoryRepository.create(tx, body.data);

      await logAudit(tx, {
        actorId: actor.id,
        action: 'category.created',
        entityType: 'category',
        entityId: category.id,
        changes: { before: null, after: category },
        context: getAuditContext(request),
      });

      return category;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/admin/categories',
      fallback: 'No se pudo crear la categoría',
      uniqueViolationMessage: CATEGORY_SLUG_CONFLICT_MESSAGE,
    });
  }
}
