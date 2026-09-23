import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext, logAudit } from '@/lib/audit';
import { COST_ALREADY_SET_MESSAGE } from '@/modules/finance/constants';
import {
  pricingProductIdSchema,
  setInitialCostSchema,
} from '@/modules/finance/schemas/pricing.schema';
import type { InitialCostSet } from '@/modules/finance/types/pricing.types';
import { db } from '@/server/db';
import * as productRepository from '@/server/repositories/product.repository';

type Context = RouteContext<'/api/admin/pricing/[id]/initial-cost'>;

const NOT_FOUND = { message: 'Producto no encontrado' };
const INVALID_ID_MESSAGE = 'El identificador del producto no es válido';

// Distingue «no existe el producto» de «ya tiene costo»: los dos salen de la transacción
// sin escribir (la `tx` hace commit vacío) y sin ese matiz el POST respondería 404 cuando
// lo que ocurre es un conflicto de estado.
type Outcome =
  | { kind: 'ok'; product: InitialCostSet }
  | { kind: 'not-found' }
  | { kind: 'already-set' };

// `POST` y no `PATCH /api/admin/products/[id]` (D-5): aquel se autoriza con
// `products.update`, que tienen `manager` y `admin`, y además **permitiría reescribir** el
// costo, que es justo lo que este spec prohíbe. Y `200` y no `201`: no nace ninguna fila y
// la operación no es idempotente-por-repetición sino irrepetible —el segundo intento es
// 409, no un no-op—.
//
// Sin service dedicado: la operación cruza **un** repositorio y la bitácora, que es el
// caso del `PATCH` de productos, no el de la nota de inventario —que cruza tres y por eso
// tiene service (spec 020, D-12)—.
export async function POST(request: Request, context: Context) {
  try {
    const { actor } = await authorize('pricing.set_initial_cost');

    const { id } = await context.params;
    const parsedId = pricingProductIdSchema.safeParse(id);
    if (!parsedId.success) return badRequest(INVALID_ID_MESSAGE);

    const body = await parseJsonBody(request, setInitialCostSchema, 'Costo inválido');
    if (!body.ok) return body.response;

    const outcome = await db.transaction(async (tx): Promise<Outcome> => {
      // Con el `tx`: distingue «no existe» de «ya tiene costo» viendo el mismo estado
      // sobre el que corre el UPDATE.
      const before = await productRepository.findById(parsedId.data, tx);
      if (!before) return { kind: 'not-found' };

      const updated = await productRepository.setInitialCost(tx, {
        productId: parsedId.data,
        unitCostCents: body.data.unitCostCents,
      });
      // `null` con el producto existiendo solo puede ser el guard `IS NULL` del WHERE, que
      // es lo que hace que dos peticiones simultáneas resuelvan una en 200 y otra en 409
      // (AC14).
      if (!updated) return { kind: 'already-set' };

      await logAudit(tx, {
        actorId: actor.id,
        action: 'product.cost_initialized',
        entityType: 'product',
        entityId: before.id,
        // `warning` y no `info`: es irrepetible por diseño y no queda registrada en
        // ninguna otra tabla, a diferencia del costo de una compra, que vive en
        // `stock_movements`. Con `info` se purgaría a los 180 días (D-10).
        severity: 'warning',
        // **Sin el importe, ni aquí ni en `changes`** (D-10): `audit` lee la bitácora con
        // `audit_logs.read` y no tiene `finance.read`, y la vista renderiza `changes` y
        // `metadata` íntegros. La trazabilidad que hace falta —quién fijó el costo de qué
        // producto y cuándo— se conserva con `actorId`, `entityId` y el SKU.
        metadata: { sku: before.sku },
        context: getAuditContext(request),
      });

      return {
        kind: 'ok',
        product: {
          id: before.id,
          sku: before.sku,
          name: before.name,
          // El valor que se acaba de escribir, no la fila entera: la proyección estrecha
          // evita publicar por la puerta de atrás lo que las de productos excluyen (D-8).
          averageCostCents: body.data.unitCostCents,
        },
      };
    });

    if (outcome.kind === 'not-found') return NextResponse.json(NOT_FOUND, { status: 404 });
    if (outcome.kind === 'already-set') {
      return NextResponse.json({ message: COST_ALREADY_SET_MESSAGE }, { status: 409 });
    }

    return NextResponse.json(outcome.product);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/admin/pricing/[id]/initial-cost',
      fallback: 'No se pudo registrar el costo inicial',
    });
  }
}
