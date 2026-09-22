import { and, asc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';

import { formatDocumentLabel, reasonLabelFor } from '@/lib/electronic-documents';
import type { ElectronicDocumentRow } from '@/modules/invoicing/types/electronic-document.types';
import { db, type Reader, type Tx } from '@/server/db';
import { electronicDocuments } from '@/server/db/schema';
import type { ProviderTrace } from '@/server/services/invoicing/provider';

type ElectronicDocument = typeof electronicDocuments.$inferSelect;
type NewElectronicDocument = typeof electronicDocuments.$inferInsert;

/** Lo que escribe una emisión aceptada. `lastError` se limpia: el fallo anterior ya no describe la fila. */
export type IssuedValues = {
  issuedAt: Date;
  pdfUrl: string | null;
  xmlUrl: string | null;
  cdrUrl: string | null;
  providerResponse: ProviderTrace;
};

export type FailedValues = {
  lastError: string;
  providerResponse: ProviderTrace;
};

// Los dos estados desde los que un documento todavía se puede emitir. Viven en una
// constante y no repetidos en cada `WHERE`: son la misma definición de «emitible» que usa
// el índice parcial `electronic_documents_unissued_idx`.
const ISSUABLE_STATUSES = ['pending', 'failed'] as const;

// Exportado para compilarlo con `PgDialect`: es el `WHERE` que decide qué se puede
// reclamar, y equivocarse aquí significa reemitir un comprobante ya enviado a SUNAT.
export function buildClaimableFilter(id: string): SQL {
  return and(
    eq(electronicDocuments.id, id),
    inArray(electronicDocuments.status, [...ISSUABLE_STATUSES]),
  ) as SQL;
}

// El guard del `UPDATE` de éxito. `status <> 'issued'` y no `status in ('pending','failed')`
// a propósito: lo que hay que impedir es **escribir dos veces un documento ya emitido**, y
// esa es la afirmación literal.
export function buildNotIssuedFilter(id: string): SQL {
  return and(eq(electronicDocuments.id, id), ne(electronicDocuments.status, 'issued')) as SQL;
}

export function buildAttemptIncrement(): SQL {
  return sql`${electronicDocuments.attemptCount} + 1`;
}

// Proyección positiva: se enumera lo que sale. `providerResponse` entra **solo** para
// colapsarse en `permanentFailure` dentro de `toRow()` y no sale nunca de este módulo,
// igual que `stripePaymentIntentId` en el historial de pedidos (spec 008, D-4). Sin
// `base_cents`, `igv_cents`, `xml_url`, `cdr_url` ni `stripe_refund_id`: son datos del
// módulo de Impuestos y del spec 023, y se publicarán con su propio permiso (AC22).
const ROW_COLUMNS = {
  id: electronicDocuments.id,
  orderId: electronicDocuments.orderId,
  // El árbol del pedido se construye con esto y no ordenando por fecha (spec 023, D-11).
  relatedDocumentId: electronicDocuments.relatedDocumentId,
  kind: electronicDocuments.kind,
  // Entra para colapsarse en `reasonLabel` dentro de `toRow()`, igual que
  // `providerResponse` se colapsa en `permanentFailure`: el código desnudo no sale.
  reasonCode: electronicDocuments.reasonCode,
  status: electronicDocuments.status,
  series: electronicDocuments.series,
  number: electronicDocuments.number,
  amountCents: electronicDocuments.amountCents,
  pdfUrl: electronicDocuments.pdfUrl,
  attemptCount: electronicDocuments.attemptCount,
  issuedAt: electronicDocuments.issuedAt,
  lastError: electronicDocuments.lastError,
  providerResponse: electronicDocuments.providerResponse,
} as const;

type RowSource = Pick<
  ElectronicDocument,
  | 'id'
  | 'relatedDocumentId'
  | 'kind'
  | 'reasonCode'
  | 'status'
  | 'series'
  | 'number'
  | 'amountCents'
  | 'pdfUrl'
  | 'attemptCount'
  | 'issuedAt'
  | 'lastError'
  | 'providerResponse'
>;

/**
 * Quién puede ver el enlace al PDF. El PDF del proveedor es una URL **sin sesión** y el
 * documento que sirve lleva el RUC/DNI y la razón social del comprador —la misma PII que
 * D-13 mantiene fuera de `audit_logs`— más el desglose base/IGV que §6.3 reserva a
 * `finance.read`. `orders.read`, que tienen `manager` y `audit`, no alcanza para eso; el
 * comprador ve siempre el suyo (D-19).
 */
export type RowVisibility = { includePdfUrl: boolean };

/**
 * Única traducción de fila a contrato de salida, y por eso el único sitio donde podría
 * escaparse `provider_response`: se enumeran los campos que salen, así que una columna
 * nueva de la tabla no se publica por el mero hecho de existir (AC22).
 *
 * `permanentFailure` lee `provider_response.permanent`, la clasificación que **escribió el
 * proveedor**, y no la recalcula a partir de `errors`: hay dos rechazos permanentes que
 * llegan sin ningún `errors` —un `4xx` sin cuerpo y un `aceptada_por_sunat: false`— y
 * derivarla aquí publicaría `false` en los dos, invitando a un reintento que nunca va a
 * funcionar (§6.3, AC12).
 */
export function toRow(document: RowSource, visibility: RowVisibility): ElectronicDocumentRow {
  return {
    id: document.id,
    kind: document.kind,
    status: document.status,
    series: document.series,
    number: document.number,
    amountCents: document.amountCents,
    pdfUrl: visibility.includePdfUrl ? document.pdfUrl : null,
    attemptCount: document.attemptCount,
    // ISO y no `Date`: JSON no transporta `Date` y el tipo del cliente lo declara `string`
    // para no mentir (spec 008, D-15).
    issuedAt: document.issuedAt?.toISOString() ?? null,
    lastError: document.lastError,
    permanentFailure:
      document.status === 'failed' && (document.providerResponse?.permanent ?? false),
    label: formatDocumentLabel(document.series, document.number),
    relatedDocumentId: document.relatedDocumentId,
    // La etiqueta ya resuelta, no el código: los catálogos 09 y 10 comparten los dígitos
    // `01`, `02` y `03` con significados distintos, así que un cliente que quisiera
    // traducirlos tendría que reimplementar la regla de qué catálogo le toca a cada `kind`
    // (spec 023, §6.3).
    reasonLabel: reasonLabelFor(document.kind, document.reasonCode),
  };
}

export async function create(
  tx: Tx,
  values: NewElectronicDocument,
): Promise<ElectronicDocument> {
  const [created] = await tx.insert(electronicDocuments).values(values).returning();
  return created;
}

/**
 * Reclama el documento emitible e incrementa su `attempt_count` y su `last_attempt_at`.
 * `null` si el documento no existe o ya no es emitible: el service distingue el 404 del
 * 409 releyendo con el mismo `tx`.
 *
 * El `SELECT … FOR UPDATE` va **a secas, sin `SKIP LOCKED`** (§6.7): no se recorre ninguna
 * cola, así que que el segundo administrador espere —y encuentre el documento ya
 * `issued`— es el comportamiento correcto, no una contención que evitar (AC14).
 *
 * Son dos sentencias sobre la conexión que la transacción ya tiene abierta, y no una sola
 * con un CTE `for update`, que es la forma de un solo viaje: el CTE obliga a `tx.execute()`
 * con SQL en crudo, que devuelve las filas en `snake_case` y exigiría mapear a mano las 23
 * columnas: exactamente la duplicación que la inferencia del schema existe para evitar
 * (docs/SETUP.md §4, regla dura 5). El coste es un viaje más dentro de una transacción
 * corta que no hace ninguna llamada de red.
 *
 * `attempt_count` se incrementa **al reclamar** y no al terminar: si el proceso muere a
 * mitad de la llamada HTTP, el intento ya quedó contado y quien mire la pantalla ve que
 * algo se intentó (§6.7, D-9).
 */
export async function claimForIssue(tx: Tx, id: string): Promise<ElectronicDocument | null> {
  const [locked] = await tx
    .select({ id: electronicDocuments.id })
    .from(electronicDocuments)
    .where(buildClaimableFilter(id))
    .for('update')
    .limit(1);

  if (!locked) return null;

  const [claimed] = await tx
    .update(electronicDocuments)
    .set({ attemptCount: buildAttemptIncrement(), lastAttemptAt: new Date() })
    .where(eq(electronicDocuments.id, locked.id))
    .returning();

  return claimed ?? null;
}

/**
 * `UPDATE … WHERE id = $1 AND status <> 'issued' RETURNING *`. El guard va en el `WHERE` y
 * no en un `if` previo: es lo que impide que dos emisiones concurrentes escriban dos veces
 * el mismo documento emitido.
 */
export async function markIssued(
  tx: Tx,
  id: string,
  values: IssuedValues,
): Promise<ElectronicDocument | null> {
  const [issued] = await tx
    .update(electronicDocuments)
    .set({
      status: 'issued',
      issuedAt: values.issuedAt,
      pdfUrl: values.pdfUrl,
      xmlUrl: values.xmlUrl,
      cdrUrl: values.cdrUrl,
      providerResponse: values.providerResponse,
      // El fallo anterior deja de describir la fila en cuanto se emite. Conservarlo
      // pintaría un error junto a un comprobante que existe ante SUNAT.
      lastError: null,
    })
    .where(buildNotIssuedFilter(id))
    .returning();

  return issued ?? null;
}

// Sin guard de estado: llegar aquí significa que `claimForIssue` ya reclamó esta fila en
// esta misma petición, así que nadie más la tiene. Y un fallo tiene que quedar escrito
// pase lo que pase: un `WHERE` que no casara dejaría el documento diciendo «pendiente»
// después de un rechazo de SUNAT.
export async function markFailed(
  tx: Tx,
  id: string,
  values: FailedValues,
): Promise<ElectronicDocument | null> {
  const [failed] = await tx
    .update(electronicDocuments)
    .set({
      status: 'failed',
      lastError: values.lastError,
      providerResponse: values.providerResponse,
    })
    .where(eq(electronicDocuments.id, id))
    .returning();

  return failed ?? null;
}

// ---------------------------------------------------------------------------
// Ajuste del pedido (spec 023)
// ---------------------------------------------------------------------------

// Los dos `kind` que pueden ser el padre de una corrección. Vive en una constante y no
// repetido en cada `WHERE`, por lo mismo que `ISSUABLE_STATUSES`: es la definición de
// «comprobante original» y equivocarse aquí sería acreditar el documento que no toca.
const ORIGINAL_KINDS = ['boleta', 'factura'] as const;

/**
 * El `WHERE` que localiza el comprobante que un ajuste puede corregir. `status = 'issued'`
 * y no `<> 'voided'`: **no se puede acreditar un documento que SUNAT todavía no tiene**
 * (AC5), así que un original `pending` o `failed` no cuenta y el pedido responde 409
 * dirigiendo a emitirlo primero.
 *
 * Exportado para compilarlo con `PgDialect`: es la pieza con la regla.
 */
export function buildIssuedOriginalFilter(orderId: string): SQL {
  return and(
    eq(electronicDocuments.orderId, orderId),
    inArray(electronicDocuments.kind, [...ORIGINAL_KINDS]),
    eq(electronicDocuments.status, 'issued'),
  ) as SQL;
}

/**
 * El original vigente y emitido del pedido. Como mucho hay uno: lo garantiza el índice
 * único parcial `electronic_documents_one_original_per_order_idx`, que excluye `voided`
 * precisamente para que una reemisión posterior quepa (spec 022, §5.6).
 *
 * Acepta un `Reader` porque esta lectura corre dentro de la `tx A` del ajuste, para ver el
 * mismo estado que el lock del pedido.
 */
export async function findIssuedOriginal(
  orderId: string,
  reader: Reader = db,
): Promise<ElectronicDocument | null> {
  const [original] = await reader
    .select()
    .from(electronicDocuments)
    .where(buildIssuedOriginalFilter(orderId))
    .limit(1);

  return original ?? null;
}

/**
 * El guard del `UPDATE` de anulación. `status = 'issued'` y no «cualquier cosa menos
 * voided»: lo único que se anula es un documento que llegó a existir ante SUNAT, y es
 * también lo que mantiene exacta la equivalencia del `CHECK
 * electronic_documents_issued_at_matches_status` —un `pending` nunca alcanza `voided`, así
 * que un `voided` siempre conserva su `issued_at`—.
 */
export function buildVoidableFilter(id: string): SQL {
  return and(
    eq(electronicDocuments.id, id),
    eq(electronicDocuments.status, 'issued'),
  ) as SQL;
}

/**
 * Marca `voided` al documento **padre**, y lo hace dentro de la misma transacción que el
 * `markIssued` del documento que lo anula (§6.5, AC14): así el índice único de original
 * vigente ve el `voided` ya escrito y admite el comprobante reemitido, y no existe ningún
 * instante en el que el pedido se quede sin comprobante vigente.
 *
 * **`issued_at` no se toca.** Un documento anulado sí se emitió, y esa fecha es la que el
 * libro de ventas usa para su período: borrarla para contentar a un `CHECK` sería destruir
 * un dato fiscal (§5).
 *
 * `null` cuando el padre ya no estaba `issued`, que hoy solo puede pasar si otra emisión
 * lo anuló antes. El service lo trata como «ya está hecho» y no como un fallo.
 */
export async function markVoided(tx: Tx, id: string): Promise<ElectronicDocument | null> {
  const [voided] = await tx
    .update(electronicDocuments)
    .set({ status: 'voided' })
    .where(buildVoidableFilter(id))
    .returning();

  return voided ?? null;
}

export async function findById(
  id: string,
  reader: Reader = db,
): Promise<ElectronicDocument | null> {
  const [document] = await reader
    .select()
    .from(electronicDocuments)
    .where(eq(electronicDocuments.id, id))
    .limit(1);

  return document ?? null;
}

export async function findRowsByOrderId(
  orderId: string,
  visibility: RowVisibility,
  reader: Reader = db,
): Promise<ElectronicDocumentRow[]> {
  const rows = await reader
    .select(ROW_COLUMNS)
    .from(electronicDocuments)
    .where(eq(electronicDocuments.orderId, orderId))
    // Por `created_at` y con `id` de desempate (AC21): el original y sus correcciones del
    // spec 023 se leen en el orden en que ocurrieron, y sin desempate dos filas creadas en
    // la misma transacción podrían alternar entre dos consultas idénticas.
    .orderBy(asc(electronicDocuments.createdAt), asc(electronicDocuments.id));

  return rows.map((row) => toRow(row, visibility));
}

/**
 * Una sola consulta con `inArray` para todos los pedidos de la página, no una por pedido:
 * el historial trae hasta 60 cabeceras y la versión ingenua serían 60 viajes al pool
 * serverless. Mismo patrón que `loadItemsByOrder` (spec 008, §10).
 */
export async function findRowsByOrderIds(
  orderIds: string[],
  visibility: RowVisibility,
  reader: Reader = db,
): Promise<Map<string, ElectronicDocumentRow[]>> {
  const byOrder = new Map<string, ElectronicDocumentRow[]>();
  if (orderIds.length === 0) return byOrder;

  const rows = await reader
    .select(ROW_COLUMNS)
    .from(electronicDocuments)
    .where(inArray(electronicDocuments.orderId, orderIds))
    .orderBy(asc(electronicDocuments.createdAt), asc(electronicDocuments.id));

  for (const row of rows) {
    const bucket = byOrder.get(row.orderId);
    if (bucket) bucket.push(toRow(row, visibility));
    else byOrder.set(row.orderId, [toRow(row, visibility)]);
  }

  return byOrder;
}
