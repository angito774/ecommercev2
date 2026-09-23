import { logAudit, type AuditContext } from '@/lib/audit';
import { seriesKeyFor, type AdjustmentIntent } from '@/lib/electronic-documents';
import { ConflictError, NotFoundError, UpstreamError, ValidationError } from '@/lib/errors';
import { stripe } from '@/lib/stripe';
import { splitIgv } from '@/modules/finance/lib/igv';
import {
  BUYER_CORRECTION_NEEDS_CLEAN_ORDER_MESSAGE,
  CONCURRENT_ADJUSTMENT_MESSAGE,
  NO_ISSUED_ORIGINAL_MESSAGE,
  NO_PAYMENT_INTENT_MESSAGE,
  NOTHING_LEFT_TO_REFUND_MESSAGE,
  orderNotAdjustableMessage,
  refundExceedsBalanceMessage,
  refundRejectedMessage,
  REFUND_UNAVAILABLE_MESSAGE,
} from '@/modules/invoicing/constants';
import { planAdjustment, type AdjustmentPlan } from '@/modules/invoicing/lib/adjustment';
import type { OrderAdjustmentInput } from '@/modules/invoicing/schemas/order-adjustment.schema';
import type { OrderAdjustmentResult } from '@/modules/invoicing/types/order-adjustment.types';
import {
  ADMIN_ORDER_NOT_FOUND_MESSAGE,
  ADMIN_ORDER_STATUS_LABELS,
} from '@/modules/orders/constants';
import { formatPrice } from '@/modules/products/lib/price';
import { db } from '@/server/db';
import type { electronicDocuments, orders, users } from '@/server/db/schema';
import * as documentSeriesRepository from '@/server/repositories/document-series.repository';
import * as electronicDocumentRepository from '@/server/repositories/electronic-document.repository';
import type { RowVisibility } from '@/server/repositories/electronic-document.repository';
import * as orderRepository from '@/server/repositories/order.repository';

type Order = typeof orders.$inferSelect;
type ElectronicDocument = typeof electronicDocuments.$inferSelect;
type User = typeof users.$inferSelect;

// **Con service** y no con la lógica en el handler, a diferencia del costo inicial del
// spec 021: esta operación cruza dos repositorios, un proveedor de pagos externo, dos
// transacciones y la bitácora. Es el caso que `docs/SETUP.md` §3 asigna a
// `server/services/` (§7.1).
//
// Orden normativo (§6.4): **leer, cobrar, escribir**. La llamada a Stripe ocurre **fuera
// de toda transacción** (spec 022, D-9): una llamada HTTP dentro de `db.transaction`
// retiene una conexión del pool serverless de Neon durante segundos, compitiendo con las
// peticiones de la tienda por un recurso escaso.

/**
 * El original ya validado: emitido, con su par serie-número y con su importe. El tipo lo
 * estrecha una sola vez, en `assertAdjustable`, para que ni el plan ni la escritura tengan
 * que volver a comprobar nulos que los `CHECK` de la tabla ya garantizan.
 */
export type IssuedOriginal = {
  id: string;
  kind: 'boleta' | 'factura';
  amountCents: number;
  issuedAt: Date;
};

/**
 * **La clave de idempotencia se deriva del estado y no de un uuid** (D-4): el pedido y el
 * importe ya reembolsado del que parte la operación, y **nada más**.
 *
 * El importe del refund **no entra en la clave**, y esa ausencia es la propiedad
 * importante. Con el importe dentro, dos administradores que parten del mismo
 * `refundedBefore` pero piden cantidades distintas producen claves distintas y Stripe crea
 * **dos** refunds reales; el perdedor del `UPDATE` condicional sale por 409 y su dinero ya
 * salió sin que quede rastro. Sin el importe, los dos comparten clave: Stripe entrega el
 * mismo refund si los parámetros coinciden y **rechaza** el segundo si no, así que el peor
 * caso es un error explícito en vez de un reembolso fantasma (AC8, AC9, AC10).
 *
 * El precio es acotado y deliberado: dos ajustes legítimos por importes distintos desde el
 * mismo estado no pueden ocurrir a la vez —solo uno gana la `tx B`—, y el segundo, una vez
 * confirmado el primero, parte de un `refundedBefore` distinto y tiene su propia clave.
 *
 * Un uuid generado en el cliente cubriría el reintento del mismo botón pero no a dos
 * administradores simultáneos, y persistirlo exigiría una columna que 022 se comprometió a
 * no necesitar.
 */
export function buildIdempotencyKey(orderId: string, refundedBefore: number): string {
  return `refund:${orderId}:${refundedBefore}`;
}

// Los dos `type` con los que el SDK marca un fallo de red o del propio Stripe. Un rechazo
// de validación —método no reembolsable, importe por debajo del mínimo, cargo ya
// devuelto— llega con otro `type` y **su mensaje sí describe qué pasó**, así que se cita
// (§10). Los dos casos salen por 502 igualmente (AC11); lo que cambia es el texto.
const TRANSIENT_STRIPE_ERROR_TYPES: ReadonlySet<string> = new Set([
  'StripeConnectionError',
  'StripeAPIError',
]);

export function toRefundErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return REFUND_UNAVAILABLE_MESSAGE;

  const type = 'type' in error && typeof error.type === 'string' ? error.type : null;
  if (type === null || TRANSIENT_STRIPE_ERROR_TYPES.has(type)) {
    return REFUND_UNAVAILABLE_MESSAGE;
  }

  const message = error.message.trim();
  return message === '' ? REFUND_UNAVAILABLE_MESSAGE : refundRejectedMessage(message);
}

/**
 * Lo que se escribe en `audit_logs`. **Sin el documento del comprador, sin su razón social,
 * sin el objeto `Refund` de Stripe y sin el `payment_intent`** (AC19, §10): `audit` y
 * `manager` leen la bitácora con `audit_logs.read` y la vista renderiza `changes` y
 * `metadata` íntegros, así que un RUC por cada corrección convertiría `/admin/audit-logs`
 * en el padrón de clientes.
 *
 * Tampoco entra el `re_…` del refund: el panel ya publica los ids de Stripe del pedido bajo
 * `orders.read` (spec 014, D-6) y repetirlo aquí solo añadiría un sitio donde revisar qué
 * se expone. Lo que hace falta para trazar —qué pedido, qué intención, qué mecanismo, qué
 * motivo y por cuánto— cabe entero aquí.
 */
export function toAuditMetadata(args: {
  orderId: string;
  intent: AdjustmentIntent;
  plan: AdjustmentPlan;
  documentId: string;
}): Record<string, unknown> {
  return {
    orderId: args.orderId,
    intent: args.intent,
    kind: args.plan.kind,
    reasonCode: args.plan.reasonCode,
    amountCents: args.plan.amountCents,
    refundCents: args.plan.refundCents,
    documentId: args.documentId,
  };
}

/**
 * Todo lo que tiene que ser cierto **antes** de planificar, en el orden en que importa.
 * Lanza en vez de devolver: así el handler traduce cada fallo por el mismo camino que el
 * resto de la API de admin y es imposible ignorar el resultado.
 *
 * Es puro —no toca base ni red— y por eso se prueba sin montar nada: es la lista de
 * precondiciones que separan «este ajuste se puede hacer» de «este ajuste devuelve dinero
 * que no existe».
 */
export function assertAdjustable(args: {
  input: OrderAdjustmentInput;
  order: Pick<Order, 'status' | 'amountTotalCents' | 'refundedAmountCents'>;
  original: Pick<ElectronicDocument, 'id' | 'kind' | 'amountCents' | 'issuedAt'> | null;
}): IssuedOriginal {
  const { input, order, original } = args;

  // AC4: antes que nada y **antes de llamar a Stripe**. Un pedido que no está `paid` no
  // tiene nada cobrado que devolver.
  if (order.status !== 'paid') {
    throw new ConflictError(orderNotAdjustableMessage(ADMIN_ORDER_STATUS_LABELS[order.status]));
  }

  // AC5: no se puede acreditar un documento que SUNAT todavía no tiene. El mensaje dirige
  // a emitir primero el original, que es una acción disponible en la misma pantalla.
  if (!original) throw new ConflictError(NO_ISSUED_ORIGINAL_MESSAGE);

  // Imposible por los `CHECK` de la tabla —un original lleva siempre importe, y un
  // `issued` lleva siempre fecha—, pero el tipo no lo sabe y tragárselo con un `!`
  // escondería un dato corrupto detrás de un rechazo de SUNAT.
  if (original.amountCents === null || original.issuedAt === null) {
    throw new ConflictError(NO_ISSUED_ORIGINAL_MESSAGE);
  }
  if (original.kind !== 'boleta' && original.kind !== 'factura') {
    throw new ConflictError(NO_ISSUED_ORIGINAL_MESSAGE);
  }

  const refundableCents = order.amountTotalCents - order.refundedAmountCents;

  // AC16 / D-7: corregir datos y devolver dinero son dos historias que no se mezclan en una
  // sola fila. Con una devolución parcial ya aplicada, el comprobante reemitido tendría que
  // ser por el neto, y ese neto no coincide con ninguna línea del pedido.
  if (input.intent === 'correccion_comprador' && order.refundedAmountCents > 0) {
    throw new ConflictError(BUYER_CORRECTION_NEEDS_CLEAN_ORDER_MESSAGE);
  }

  // La anulación total no trae importe: el suyo **es** el saldo, así que un saldo agotado
  // no es un importe inválido sino un pedido que ya no tiene nada que anular. Sin este
  // guard el plan saldría con `amountCents: 0` y `splitIgv()` reventaría dentro de la
  // transacción, donde el mensaje ya no diría de dónde vino.
  if (input.intent === 'anulacion_total' && refundableCents <= 0) {
    throw new ConflictError(NOTHING_LEFT_TO_REFUND_MESSAGE);
  }

  // AC6: un 400 y no un 409 (§6.1) —el recurso no está en conflicto, el importe enviado es
  // incorrecto— y **sin ninguna llamada a Stripe**, porque esto corre en la `tx A`. El
  // saldo viaja en el mensaje para poder corregirlo sin cerrar el diálogo.
  if (input.intent === 'devolucion_parcial' && input.amountCents > refundableCents) {
    throw new ValidationError(refundExceedsBalanceMessage(formatPrice(refundableCents)));
  }

  return {
    id: original.id,
    kind: original.kind,
    amountCents: original.amountCents,
    issuedAt: original.issuedAt,
  };
}

/** El pedido tiene con qué devolver. Separado porque solo aplica cuando el plan mueve dinero. */
function assertRefundable(order: Pick<Order, 'stripePaymentIntentId'>): string {
  if (!order.stripePaymentIntentId) throw new ConflictError(NO_PAYMENT_INTENT_MESSAGE);
  return order.stripePaymentIntentId;
}

type PreparedAdjustment = {
  order: Order;
  original: IssuedOriginal;
  plan: AdjustmentPlan;
  /** El valor que la `tx A` leyó, y que la `tx B` exige que no se haya movido (D-5). */
  refundedBefore: number;
};

/**
 * `tx A` — lectura bajo lock. Corta a propósito: toma el `FOR UPDATE`, valida, planifica y
 * **suelta el lock antes de la llamada de red** (§6.4). Que el estado pueda moverse entre
 * las dos transacciones no es un agujero: lo detecta el `UPDATE` condicional de la `tx B`,
 * y la clave de idempotencia impide que el refund del perdedor sea un cobro distinto.
 */
async function prepare(
  orderId: string,
  input: OrderAdjustmentInput,
  now: Date,
): Promise<PreparedAdjustment> {
  return db.transaction(async (tx) => {
    const order = await orderRepository.findByIdForUpdate(tx, orderId);
    if (!order) throw new NotFoundError(ADMIN_ORDER_NOT_FOUND_MESSAGE);

    const original = await electronicDocumentRepository.findIssuedOriginal(orderId, tx);
    const issued = assertAdjustable({ input, order, original });

    const plan = planAdjustment({
      input,
      original: issued,
      amountTotalCents: order.amountTotalCents,
      refundedAmountCents: order.refundedAmountCents,
      now,
    });

    return { order, original: issued, plan, refundedBefore: order.refundedAmountCents };
  });
}

/**
 * La única llamada de red del ajuste, y **fuera de toda transacción**. Devuelve el id del
 * refund; un fallo sale como `UpstreamError`, que el handler traduce a 502 sin un solo `if`
 * (AC11).
 */
async function createRefund(prepared: PreparedAdjustment): Promise<string> {
  const paymentIntentId = assertRefundable(prepared.order);

  try {
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntentId, amount: prepared.plan.refundCents },
      { idempotencyKey: buildIdempotencyKey(prepared.order.id, prepared.refundedBefore) },
    );

    return refund.id;
  } catch (error) {
    // Sin el objeto de Stripe ni el `payment_intent` en el log: la etiqueta y el pedido
    // bastan para localizarlo, y el resto es el cuerpo de un proveedor de pagos (§10).
    console.error('adjustOrder.refund', prepared.order.id, error);
    throw new UpstreamError(toRefundErrorMessage(error), { cause: error });
  }
}

/**
 * `tx B` — escritura. Todo dentro de la **misma transacción**: el `UPDATE` condicional del
 * importe, el correlativo, la fila del documento, los datos del comprador cuando toca y la
 * bitácora (AC7). Si algo revienta, no queda ni el número consumido ni un log huérfano.
 */
async function persist(
  actor: User,
  prepared: PreparedAdjustment,
  input: OrderAdjustmentInput,
  stripeRefundId: string | null,
  auditContext: AuditContext,
  visibility: RowVisibility,
): Promise<OrderAdjustmentResult> {
  const { order, original, plan, refundedBefore } = prepared;

  return db.transaction(async (tx) => {
    // `UPDATE … WHERE refunded_amount_cents = $refundedBefore`: 0 filas significa que otro
    // ajuste se adelantó. Sale por 409 sin haber duplicado el reembolso: la clave de
    // idempotencia, que no lleva el importe dentro, hizo que el intento perdedor reutilizara
    // el refund del ganador o fuera rechazado por Stripe, nunca que creara uno nuevo
    // (D-4, D-5, AC9).
    const updated = await orderRepository.applyRefund(tx, order.id, {
      refundedBefore,
      refundCents: plan.refundCents,
    });
    if (!updated) throw new ConflictError(CONCURRENT_ADJUSTMENT_MESSAGE);

    // La letra de la serie la decide el comprobante que se modifica, no la corrección
    // (spec 022, §5.6). `null` = el documento no consume correlativo propio, que hoy solo
    // es la comunicación de baja.
    const seriesKey = seriesKeyFor(plan.kind, original.kind);
    const assigned = seriesKey ? await documentSeriesRepository.nextNumber(tx, seriesKey) : null;

    // El desglose se calcula al crear la fila y es el mismo que se enviará al proveedor:
    // no es una estimación posterior. `null` entero en la baja, que no lleva importe.
    const breakdown = plan.amountCents === null ? null : splitIgv(plan.amountCents);

    const document = await electronicDocumentRepository.create(tx, {
      orderId: order.id,
      // Apunta siempre al documento que se modifica, que es lo que convierte la tabla en un
      // árbol y permite pintarlo sin adivinar por fecha (D-11).
      relatedDocumentId: original.id,
      kind: plan.kind,
      reasonCode: plan.reasonCode,
      series: assigned?.series ?? null,
      number: assigned?.number ?? null,
      amountCents: plan.amountCents,
      baseCents: breakdown?.baseCents ?? null,
      igvCents: breakdown?.igvCents ?? null,
      // **`pending`, nunca `issued`**: este spec no tiene camino de emisión propio. El
      // documento espera a que alguien pulse «Emitir comprobante», que es el handler del
      // spec 022 sin un solo cambio (D-13, AC23).
      status: 'pending',
      stripeRefundId,
      createdById: actor.id,
    });

    if (input.intent === 'correccion_comprador') {
      // El único camino de este spec que escribe PII, y va a `orders` y a ningún sitio más:
      // ni a la bitácora, ni a la respuesta (§10).
      await orderRepository.updateBuyer(tx, order.id, {
        buyerDocumentType: input.buyer.documentType,
        buyerDocumentNumber: input.buyer.documentNumber,
        // `null` y nunca `''`, que es lo que el `CHECK orders_buyer_legal_name_requires_ruc`
        // no admite en una boleta.
        buyerLegalName: input.buyer.legalName ?? null,
      });
    }

    await logAudit(tx, {
      actorId: actor.id,
      // Dos acciones y no una: «se devolvió dinero» y «se documentó un ajuste» son hechos
      // distintos y se filtran distinto en la bitácora.
      action: plan.refundCents > 0 ? 'order.refunded' : 'order.adjusted',
      entityType: 'order',
      entityId: order.id,
      // `warning` y no `info`: devolver dinero es un hecho permanente y con `info` su rastro
      // se purgaría a los 180 días (mismo criterio que `invoice.issued`, spec 022).
      severity: 'warning',
      metadata: toAuditMetadata({
        orderId: order.id,
        intent: input.intent,
        plan,
        documentId: document.id,
      }),
      context: auditContext,
    });

    const documents = await electronicDocumentRepository.findRowsByOrderId(
      order.id,
      visibility,
      tx,
    );

    return {
      orderId: order.id,
      refundedAmountCents: updated.refundedAmountCents,
      refundableCents: updated.amountTotalCents - updated.refundedAmountCents,
      documents,
    };
  });
}

/**
 * Las tres fases de §6.4. El ajuste **registra** el documento de corrección; emitirlo es la
 * acción manual del spec 022 y no hay ningún camino nuevo (D-13).
 *
 * `visibility` llega del handler y no se decide aquí: el enlace al PDF depende de
 * `invoicing.issue`, y resolver permisos dentro de un service lo ataría al catálogo de
 * autorización. Que hoy los dos permisos vayan a los mismos dos roles (§5.1) es una
 * decisión de la matriz, no una propiedad de la que este código pueda depender.
 */
export async function adjustOrder(
  actor: User,
  orderId: string,
  input: OrderAdjustmentInput,
  auditContext: AuditContext,
  visibility: RowVisibility,
): Promise<OrderAdjustmentResult> {
  const prepared = await prepare(orderId, input, new Date());

  // Solo cuando el plan mueve dinero: la corrección de comprador y la nota de débito no
  // llaman a Stripe en absoluto (AC18, D-8).
  const stripeRefundId = prepared.plan.refundCents > 0 ? await createRefund(prepared) : null;

  try {
    return await persist(actor, prepared, input, stripeRefundId, auditContext, visibility);
  } catch (error) {
    // El dinero ya salió de Stripe y la base no llegó a registrar la referencia: sin esta
    // línea el `re_…` se pierde y nadie puede conciliarlo. No cambia el error que ve el
    // administrador —se relanza tal cual—, solo deja el rastro mínimo para cuadrarlo a mano
    // en el Dashboard. El id del refund no es PII y es lo único que permite encontrarlo.
    //
    // `ConflictError` aquí solo puede venir del `UPDATE … WHERE refunded_amount_cents =
    // $refundedBefore` de `persist` (línea de `applyRefund` arriba): dos ajustes concurrentes
    // con el MISMO importe comparten clave de idempotencia y Stripe les devuelve el mismo
    // refund; el perdedor no tiene nada huérfano que conciliar porque el ganador ya lo dejó
    // escrito en su fila. Loguearlo igual sería ruido que dispara la deuda de §11 sin que
    // exista el problema que esa deuda describe.
    if (stripeRefundId && !(error instanceof ConflictError)) {
      console.error(
        'adjustOrder.orphanRefund',
        prepared.order.id,
        stripeRefundId,
        prepared.plan.refundCents,
      );
    }

    throw error;
  }
}
