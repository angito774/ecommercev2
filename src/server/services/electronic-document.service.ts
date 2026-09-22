import { logAudit, type AuditContext } from '@/lib/audit';
import { seriesKeyFor, type OriginalDocumentKind } from '@/lib/electronic-documents';
import { ConflictError, NotFoundError, UpstreamError } from '@/lib/errors';
import { toReportingDayKey } from '@/lib/reporting';
import { splitIgv } from '@/modules/finance/lib/igv';
import {
  documentNotIssuableMessage,
  DOCUMENT_NOT_FOUND_MESSAGE,
  ELECTRONIC_DOCUMENT_STATUS_LABELS,
} from '@/modules/invoicing/constants';
import type { ElectronicDocumentRow } from '@/modules/invoicing/types/electronic-document.types';
import { SHIPPING_LINE_DESCRIPTION } from '@/modules/orders/constants';
import type { OrderLineDisplay } from '@/modules/orders/types/order.types';
import { db, type Tx } from '@/server/db';
import type { orders, users } from '@/server/db/schema';
import * as documentSeriesRepository from '@/server/repositories/document-series.repository';
import * as electronicDocumentRepository from '@/server/repositories/electronic-document.repository';
import * as orderRepository from '@/server/repositories/order.repository';

import { getInvoicingProvider } from './invoicing';
import {
  InvoicingProviderError,
  toProviderTrace,
  type IssueDocumentInput,
  type IssueDocumentLine,
  type IssueDocumentResult,
} from './invoicing/provider';

type Order = typeof orders.$inferSelect;
type User = typeof users.$inferSelect;
type ElectronicDocument = Awaited<ReturnType<typeof electronicDocumentRepository.findById>>;
type ClaimedDocument = NonNullable<ElectronicDocument>;

/** Identificadores del evento que encoló el documento. Nunca el payload de Stripe. */
type QueueSource = { eventId: string; sessionId: string };

// **Con service** y no con la lógica en el handler, a diferencia del costo inicial del
// spec 021: esta operación cruza dos repositorios, un proveedor externo, dos transacciones
// y la bitácora. Es el caso que `docs/SETUP.md` §3 asigna a `server/services/` (§7.3).

const TRANSIENT_FAILURE_MESSAGE =
  'No se pudo contactar con el proveedor. Vuelve a intentarlo.';

// ---------------------------------------------------------------------------
// Encolado desde el webhook (§7.2)
// ---------------------------------------------------------------------------

/**
 * Qué `kind` le toca al pedido. Una función y no un ternario suelto: es la única regla que
 * traduce «con qué documento se identificó el comprador» a «qué comprobante se emite», y
 * está probada.
 */
export function originalKindFor(documentType: 'dni' | 'ruc'): OriginalDocumentKind {
  return documentType === 'ruc' ? 'factura' : 'boleta';
}

/**
 * Las líneas del comprobante: una por cada `order_items` **más una de envío** cuando
 * `orders.shipping_cents > 0` (D-16). El total del documento es `amount_total_cents`, que
 * incluye el envío, y SUNAT exige que las líneas sumen el total; omitirlo daría un
 * comprobante por menos de lo cobrado —una venta subdeclarada—.
 *
 * La línea se añade **solo** cuando hay envío cobrado, porque un envío gratis no es una
 * línea de importe cero sino una línea que no existe.
 */
export function buildDocumentLines(
  items: ReadonlyArray<Pick<OrderLineDisplay, 'nameSnapshot' | 'priceCentsSnapshot' | 'quantity'>>,
  shippingCents: number,
): IssueDocumentLine[] {
  const lines: IssueDocumentLine[] = items.map((item) => ({
    description: item.nameSnapshot,
    quantity: item.quantity,
    unitPriceCents: item.priceCentsSnapshot,
    totalCents: item.priceCentsSnapshot * item.quantity,
  }));

  if (shippingCents > 0) {
    lines.push({
      description: SHIPPING_LINE_DESCRIPTION,
      quantity: 1,
      unitPriceCents: shippingCents,
      totalCents: shippingCents,
    });
  }

  return lines;
}

/**
 * Por qué un pedido pagado puede no encolar comprobante. `null` = sí encola. Se devuelve el
 * motivo en vez de un booleano porque es exactamente lo que se escribe en la bitácora, y
 * así el `invoice.skipped` no puede decir una razón distinta de la que decidió.
 */
export function skipReason(
  order: Pick<Order, 'buyerDocumentType' | 'buyerDocumentNumber' | 'amountTotalCents'>,
): string | null {
  // Pedido anterior a la migración `0010`: no se inventa ningún documento del comprador,
  // porque emitir una boleta a nombre de nadie sería un comprobante falso ante SUNAT (AC8).
  if (!order.buyerDocumentType || !order.buyerDocumentNumber) return 'missing_buyer_document';
  // Un comprobante de importe cero no existe: el `CHECK electronic_documents_amount_breakdown`
  // exige `amount_cents > 0` y `splitIgv()` lanza. Dejarlo llegar reventaría la transacción
  // del webhook y Stripe reintentaría el evento para siempre.
  if (order.amountTotalCents <= 0) return 'non_positive_amount';

  return null;
}

/**
 * Inserta la fila `pending` **dentro de la transacción del fulfillment** y **sin ninguna
 * llamada de red**: son dos consultas cortas sobre la conexión que ya está abierta, así que
 * no compite con el corte de ~10 s del webhook (AC7, D-7). Deja el comprobante listo para
 * que alguien lo emita desde el panel; no lo emite (D-8).
 */
export async function queueOriginalDocument(
  tx: Tx,
  order: Order,
  items: ReadonlyArray<Pick<OrderLineDisplay, 'nameSnapshot' | 'priceCentsSnapshot' | 'quantity'>>,
  source: QueueSource,
): Promise<void> {
  const reason = skipReason(order);
  if (reason) {
    await logAudit(tx, {
      actorId: null,
      action: 'invoice.skipped',
      entityType: 'order',
      entityId: order.id,
      severity: 'warning',
      metadata: { reason, ...source },
    });
    return;
  }

  // `skipReason` ya descartó el `null`, pero el tipo no lo sabe: el guard explícito evita
  // un `!` que escondería el caso el día que la regla cambie.
  if (!order.buyerDocumentType) return;

  const kind = originalKindFor(order.buyerDocumentType);
  const seriesKey = seriesKeyFor(kind);
  if (!seriesKey) return;

  // Serie y número **al crear la fila**, no al emitir: es lo que hace que un reintento tras
  // un timeout reenvíe el mismo par y que el proveedor devuelva el documento ya emitido en
  // vez de duplicarlo ante SUNAT (D-6, AC13). Consume el correlativo dentro de esta misma
  // transacción, así que si el fulfillment revierte no queda hueco (AC16).
  const { series, number } = await documentSeriesRepository.nextNumber(tx, seriesKey);
  const { baseCents, igvCents } = splitIgv(order.amountTotalCents);

  const document = await electronicDocumentRepository.create(tx, {
    orderId: order.id,
    kind,
    series,
    number,
    amountCents: order.amountTotalCents,
    baseCents,
    igvCents,
    status: 'pending',
    // `null` = lo generó el sistema. El webhook no tiene actor y no se le inventa uno.
    createdById: null,
  });

  // Sin el documento del comprador ni su razón social (D-13): `audit` y `manager` leen la
  // bitácora con `audit_logs.read` y la vista renderiza `changes` y `metadata` íntegros, así
  // que un DNI por cada venta convertiría `/admin/audit-logs` en el padrón de clientes.
  await logAudit(tx, {
    actorId: null,
    action: 'invoice.queued',
    entityType: 'electronic_document',
    entityId: document.id,
    metadata: { orderId: order.id, kind, series, number, ...source },
  });
}

// ---------------------------------------------------------------------------
// Emisión manual desde el panel (§7.4)
// ---------------------------------------------------------------------------

/**
 * `DD-MM-YYYY` en la zona del emisor, que es el formato que pide el proveedor. Se resuelve
 * en `America/Lima` con las primitivas de `src/lib/reporting.ts` y no con el huso del
 * servidor: una emisión de las 20:00 de Lima llevaría la fecha del día siguiente en UTC, y
 * la fecha de emisión de un comprobante no es un detalle de presentación.
 *
 * Es **hoy** y no la fecha de creación de la fila: la fecha de emisión es el día en que el
 * comprobante se emite de verdad, y entre el cobro y la emisión pueden pasar días (D-8,
 * D-17). El par serie-número, que es lo que evita el duplicado en un reintento, no depende
 * de ella (D-6).
 */
export function toIssueDate(instant: Date): string {
  const [year, month, day] = toReportingDayKey(instant).split('-');
  return `${day}-${month}-${year}`;
}

/**
 * Denominación del comprador. Con RUC es la razón social que él mismo escribió y que el
 * `CHECK orders_buyer_legal_name_requires_ruc` garantiza presente. Con DNI el pedido no
 * lleva nombre —la razón social solo existe en una factura (§5.1)—, así que se usa el de
 * Clerk y, si no dio ninguno, su correo: SUNAT exige una denominación y el correo es el
 * único identificador que queda. Nunca se inventa un «CLIENTE VARIOS», que sería declarar
 * una venta a nadie.
 */
export function resolveBuyerName(
  order: Pick<
    orderRepository.OrderFiscalSnapshot,
    'buyerLegalName' | 'customerName' | 'customerEmail'
  >,
): string {
  return order.buyerLegalName ?? order.customerName ?? order.customerEmail;
}

/**
 * Traduce la fila reclamada y su pedido al dominio del proveedor. Los importes y el par
 * serie-número salen de la **fila**, no de un recálculo: son los que se persistieron al
 * encolar, y recalcularlos aquí abriría la puerta a que el comprobante enviado y el
 * guardado dijeran cosas distintas.
 */
export function toProviderInput(
  document: ClaimedDocument,
  order: orderRepository.OrderFiscalSnapshot,
  issuedOn: Date,
): IssueDocumentInput {
  if (
    !order.buyerDocumentType ||
    !order.buyerDocumentNumber ||
    document.series === null ||
    document.number === null ||
    document.amountCents === null ||
    document.baseCents === null ||
    document.igvCents === null
  ) {
    // Imposible por los `CHECK` de la tabla y por `skipReason()`, pero el tipo no lo sabe y
    // tragárselo con un `!` escondería un dato corrupto detrás de un rechazo de SUNAT.
    throw new ConflictError(
      'Al comprobante le faltan datos para emitirse. Revisa el pedido antes de volver a intentarlo.',
    );
  }

  return {
    kind: document.kind,
    series: document.series,
    number: document.number,
    issueDate: toIssueDate(issuedOn),
    buyer: {
      documentType: order.buyerDocumentType,
      documentNumber: order.buyerDocumentNumber,
      legalName: resolveBuyerName(order),
    },
    amountCents: document.amountCents,
    baseCents: document.baseCents,
    igvCents: document.igvCents,
    lines: buildDocumentLines(order.items, order.shippingCents),
  };
}

// Distingue el 404 del 409 releyendo la fila: `claimForIssue` devuelve `null` en los dos
// casos, y sin este matiz emitir un documento ya emitido respondería «no existe», que es
// falso y deja al administrador sin saber qué pasó (AC19).
async function explainNotIssuable(id: string): Promise<Error> {
  const document = await electronicDocumentRepository.findById(id);
  if (!document) return new NotFoundError(DOCUMENT_NOT_FOUND_MESSAGE);

  return new ConflictError(
    documentNotIssuableMessage(ELECTRONIC_DOCUMENT_STATUS_LABELS[document.status]),
  );
}

// Datos del documento para la bitácora. **Sin el documento del comprador, sin su razón
// social y sin el texto del error**, que puede citar de vuelta el RUC que el proveedor
// rechazó (D-13). Lo que hace falta para trazar —qué documento, de qué pedido, con qué
// serie y número, en qué intento— cabe entero aquí.
function auditMetadata(document: ClaimedDocument): Record<string, unknown> {
  return {
    orderId: document.orderId,
    kind: document.kind,
    series: document.series,
    number: document.number,
    attempt: document.attemptCount,
  };
}

async function persistSuccess(
  document: ClaimedDocument,
  result: IssueDocumentResult,
  actor: User,
  context: AuditContext,
): Promise<ElectronicDocumentRow> {
  return db.transaction(async (tx) => {
    const issued = await electronicDocumentRepository.markIssued(tx, document.id, {
      issuedAt: result.issuedAt,
      pdfUrl: result.pdfUrl,
      xmlUrl: result.xmlUrl,
      cdrUrl: result.cdrUrl,
      providerResponse: result.trace,
    });

    // `null` solo puede venir del guard `status <> 'issued'` del WHERE: otra petición lo
    // emitió mientras esta hablaba con el proveedor. 409, no un segundo UPDATE (AC14).
    if (!issued) throw await explainNotIssuable(document.id);

    await logAudit(tx, {
      actorId: actor.id,
      action: 'invoice.issued',
      entityType: 'electronic_document',
      entityId: issued.id,
      // `warning` y no `info`: un comprobante emitido es un hecho fiscal permanente y con
      // `info` su rastro se purgaría a los 180 días, mientras el documento sigue existiendo
      // ante SUNAT (mismo criterio que el costo inicial, spec 021 D-10).
      severity: 'warning',
      metadata: auditMetadata(issued),
      context,
    });

    // Con el enlace al PDF: quien llega hasta aquí acaba de pasar por
    // `authorize('invoicing.issue')`, que es exactamente el permiso que lo habilita (D-19).
    return electronicDocumentRepository.toRow(issued, { includePdfUrl: true });
  });
}

/**
 * Persiste el fallo **y después lo propaga** como `UpstreamError`, para que el handler
 * responda 502 sin un solo `if` (AC11). Nunca devuelve: tipado `Promise<never>` para que
 * quien lo llame no pueda olvidarse de que esto termina lanzando.
 */
async function persistFailure(
  document: ClaimedDocument,
  error: unknown,
  actor: User,
  context: AuditContext,
): Promise<never> {
  const providerError = error instanceof InvoicingProviderError ? error : null;
  const message = providerError?.message ?? TRANSIENT_FAILURE_MESSAGE;
  const trace = providerError?.trace ?? toProviderTrace(null, null);

  await db.transaction(async (tx) => {
    await electronicDocumentRepository.markFailed(tx, document.id, {
      // El texto legible va a `last_error`, que el panel pinta bajo `orders.read`, y **no**
      // a la bitácora: puede citar de vuelta el RUC que el proveedor rechazó.
      lastError: message,
      providerResponse: trace,
    });

    await logAudit(tx, {
      actorId: actor.id,
      action: 'invoice.failed',
      entityType: 'electronic_document',
      entityId: document.id,
      severity: 'warning',
      metadata: { ...auditMetadata(document), permanent: providerError?.permanent ?? false },
      context,
    });
  });

  throw new UpstreamError(message, { cause: error });
}

/**
 * **La única puerta de emisión**, válida tanto para el primer intento (`pending`) como para
 * cualquiera posterior (`failed`): sin automatismo detrás, emitir por primera vez y volver
 * a emitir son literalmente la misma operación sobre la misma fila, con el mismo par
 * serie-número (D-10).
 *
 * Tres tramos y **la llamada al proveedor fuera de toda transacción** (D-9): una llamada
 * HTTP dentro de `db.transaction` retiene una conexión del pool serverless de Neon durante
 * segundos, compitiendo con las peticiones de la tienda por un recurso escaso, y un timeout
 * revertiría el `attempt_count`, así que la pantalla mostraría «0 intentos» después de
 * haber intentado.
 */
export async function issueDocument(
  actor: User,
  id: string,
  context: AuditContext,
): Promise<ElectronicDocumentRow> {
  // tx A — reclamo. Corta: toma el lock, cuenta el intento y lo suelta.
  const claimed = await db.transaction((tx) => electronicDocumentRepository.claimForIssue(tx, id));
  if (!claimed) throw await explainNotIssuable(id);

  const order = await orderRepository.findFiscalSnapshot(claimed.orderId);
  // La FK es `restrict`, así que el pedido no puede haber desaparecido; si lo hiciera, es un
  // dato roto y no un fallo del proveedor.
  if (!order) throw new NotFoundError(DOCUMENT_NOT_FOUND_MESSAGE);

  const input = toProviderInput(claimed, order, new Date());

  let result: IssueDocumentResult;
  try {
    const provider = await getInvoicingProvider();
    result = await provider.issue(input);
  } catch (error) {
    // tx B' — el fallo se persiste con su clasificación y se propaga como 502.
    return persistFailure(claimed, error, actor, context);
  }

  // tx B — éxito.
  return persistSuccess(claimed, result, actor, context);
}
