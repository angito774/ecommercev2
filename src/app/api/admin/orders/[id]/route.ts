import { NextResponse } from 'next/server';

import { authorize, badRequest, parseJsonBody, toErrorResponse } from '@/lib/api-guard';
import { getAuditContext, logAudit } from '@/lib/audit';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import {
  ADMIN_ORDER_NOT_FOUND_MESSAGE,
  orderNotCancelableMessage,
} from '@/modules/orders/constants';
import { canCancelOrder } from '@/modules/orders/lib/order-transitions';
import { cancelOrderSchema, orderIdSchema } from '@/modules/orders/schemas/admin-order.schema';
import type {
  AdminOrderDetailResponse,
  OrderStatusChangeResult,
} from '@/modules/orders/types/order.types';
import { db } from '@/server/db';
import * as electronicDocumentRepository from '@/server/repositories/electronic-document.repository';
import * as orderRepository from '@/server/repositories/order.repository';

type Context = RouteContext<'/api/admin/orders/[id]'>;

const INVALID_ID = 'El identificador del pedido no es válido';

export async function GET(_request: Request, context: Context) {
  try {
    const { granted } = await authorize('orders.read');

    // En Next 16 `params` es una promesa, por eso el await antes de validar.
    const { id } = await context.params;
    const parsedId = orderIdSchema.safeParse(id);
    if (!parsedId.success) return badRequest(INVALID_ID);

    const order = await orderRepository.findByIdForAdmin(parsedId.data);
    if (!order) throw new NotFoundError(ADMIN_ORDER_NOT_FOUND_MESSAGE);

    // Segunda consulta y no un join en la anterior: los comprobantes son 0..N por pedido y
    // el join repetiría la cabecera por documento, obligando a deduplicarla al leer. Se
    // lanza después de resolver el 404 para no consultarlos de un pedido que no existe.
    //
    // El enlace al PDF solo viaja con `invoicing.issue`: es una URL sin sesión y el PDF
    // lleva el documento del comprador, su razón social y el desglose base/IGV, que §6.3
    // reserva a finanzas. `manager` y `audit` tienen `orders.read` y ninguno de los dos
    // alcanza (D-19). Se filtra aquí, en servidor, y no ocultándolo en el cliente.
    const documents = await electronicDocumentRepository.findRowsByOrderId(order.id, {
      includePdfUrl: can(granted, 'invoicing.issue'),
    });

    const body: AdminOrderDetailResponse = {
      // `documents` trae la proyección de `ElectronicDocumentRow`, que **no** incluye
      // `provider_response`; y ni `buyerDocumentNumber` ni `buyerLegalName` salen por aquí,
      // porque `ADMIN_ORDER_DETAIL_COLUMNS` no los enumera (AC22).
      data: { ...order, documents },
      // El sheet tiene su propia consulta: si leyera el `meta` del listado quedaría
      // acoplado al orden de carga de otra query (D-11). `canIssueInvoice` se resuelve en
      // servidor sobre el set efectivo: la UI solo oculta el botón, y el `POST` vuelve a
      // comprobar el permiso por su cuenta (AC20).
      meta: {
        canUpdateStatus: can(granted, 'orders.update_status'),
        canIssueInvoice: can(granted, 'invoicing.issue'),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/orders/[id]',
      fallback: 'No se pudo obtener el pedido',
    });
  }
}

// Única mutación del panel de pedidos. El cuerpo es `{ status: 'canceled' }` y el
// schema lo fija con un `literal`: no hay forma de proponer otra transición desde
// fuera, así que la regla no depende de un `if` que alguien pueda olvidar (D-2).
export async function PATCH(request: Request, context: Context) {
  try {
    const { actor } = await authorize('orders.update_status');

    const { id } = await context.params;
    const parsedId = orderIdSchema.safeParse(id);
    if (!parsedId.success) return badRequest(INVALID_ID);

    const body = await parseJsonBody(request, cancelOrderSchema, 'Datos del pedido inválidos');
    if (!body.ok) return body.response;

    const auditContext = getAuditContext(request);

    const updated = await db.transaction(async (tx) => {
      // Lectura previa dentro de la transacción: sin ella, cancelar un pedido ya
      // `paid` respondería «no encontrado», que es falso y deja al administrador sin
      // saber qué pasó (D-5).
      const current = await orderRepository.findById(parsedId.data, tx);
      if (!current) throw new NotFoundError(ADMIN_ORDER_NOT_FOUND_MESSAGE);
      if (!canCancelOrder(current.status)) {
        throw new ConflictError(orderNotCancelableMessage(current.status));
      }

      // UPDATE condicional `WHERE status = 'pending'`, el mismo que protege al
      // webhook: si otra transacción llegó antes, no encuentra fila y devuelve null
      // (D-4). La carrera la resuelve el motor, no la lectura de arriba.
      const canceled = await orderRepository.markCanceled(tx, current.id);
      if (!canceled) throw new ConflictError(orderNotCancelableMessage(current.status));

      // Dentro de la misma transacción que el UPDATE: si la mutación revierte, el
      // log también (AC15). `changes` lleva solo el estado — ni la dirección de
      // envío ni el correo del comprador entran en la bitácora (§10).
      await logAudit(tx, {
        actorId: actor.id,
        action: 'order.status_changed',
        entityType: 'order',
        entityId: canceled.id,
        changes: {
          before: { status: current.status },
          after: { status: canceled.status },
        },
        context: auditContext,
      });

      return canceled;
    });

    const result: OrderStatusChangeResult = {
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'PATCH /api/admin/orders/[id]',
      fallback: 'No se pudo cancelar el pedido',
    });
  }
}
