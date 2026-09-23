import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import {
  ELECTRONIC_DOCUMENT_KINDS,
  ELECTRONIC_DOCUMENT_STATUSES,
} from '@/lib/electronic-documents';
import type { ProviderTrace } from '@/server/services/invoicing/provider';

import { orders } from './order';
import { users } from './user';

// Los valores salen del catálogo puro (`src/lib/electronic-documents.ts`), no de una
// tupla repetida aquí. Los tres últimos `kind` y el estado `voided` solo los escribe el
// spec 023: nacen en esta migración para que 023 no necesite ninguna, porque añadir un
// valor a un enum de Postgres es un `ALTER TYPE` que no puede correr dentro de la misma
// transacción que lo usa (§0).
export const electronicDocumentKind = pgEnum(
  'electronic_document_kind',
  ELECTRONIC_DOCUMENT_KINDS,
);

export const electronicDocumentStatus = pgEnum(
  'electronic_document_status',
  ELECTRONIC_DOCUMENT_STATUSES,
);

// Es un **árbol**: el original (boleta o factura) y, desde el spec 023, sus correcciones
// apuntándolo con `related_document_id`.
export const electronicDocuments = pgTable(
  'electronic_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `restrict`: un comprobante no puede quedar huérfano de su pedido, y un pedido con
    // comprobante emitido no se borra nunca. Varias filas por pedido.
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    // Self-FK `restrict`: `null` en el original, y en una corrección apunta al documento
    // que modifica. Lo escribe 023.
    relatedDocumentId: uuid('related_document_id').references(
      (): AnyPgColumn => electronicDocuments.id,
      { onDelete: 'restrict' },
    ),
    kind: electronicDocumentKind('kind').notNull(),
    // Catálogo 09 (nota de crédito) o 10 (nota de débito) de SUNAT. Lo escribe 023.
    reasonCode: varchar('reason_code', { length: 4 }),
    // Serie y número se asignan **al crear la fila**, no al emitir: es lo que hace que un
    // reintento reenvíe el mismo par y que Nubefact devuelva el documento ya emitido en
    // vez de duplicarlo ante SUNAT (D-6, AC13).
    series: varchar('series', { length: 4 }),
    number: integer('number'),
    // Importe total del documento, IGV incluido. `null` en `comunicacion_baja`, que no
    // lleva importe.
    amountCents: integer('amount_cents'),
    // Desglose exigido por el sub-proyecto #4 (Impuestos). Se calcula al crear la fila y
    // es el mismo que se envía al proveedor: no es una estimación posterior (§6.4).
    baseCents: integer('base_cents'),
    igvCents: integer('igv_cents'),
    status: electronicDocumentStatus('status').notNull().default('pending'),
    // Fecha real de emisión, exigida por #3 (Ingresos v2). **No se usa `updated_at`**:
    // cualquier cambio futuro de la fila dispara su `$onUpdate` y contaminaría la fecha
    // con la que el libro de ventas agrupa el período (D-17).
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    pdfUrl: text('pdf_url'),
    xmlUrl: text('xml_url'),
    cdrUrl: text('cdr_url'),
    // Proyección acotada de la respuesta del proveedor, nunca su cuerpo entero (§6.6,
    // AC15). `$type` es solo TypeScript: no cambia el SQL, pero impide que alguien
    // escriba aquí el volcado crudo sin que el typecheck se queje.
    providerResponse: jsonb('provider_response').$type<ProviderTrace>(),
    // Mensaje legible del último fallo, para pintarlo en el panel sin exponer el jsonb.
    // Columna aparte y no `providerResponse.error`: el panel no debe tener que entrar en
    // el volcado del proveedor para decir qué pasó.
    lastError: text('last_error'),
    // Solo si este documento implicó un reembolso en Stripe. Lo escribe 023.
    stripeRefundId: varchar('stripe_refund_id', { length: 255 }),
    // Cuántas veces se ha intentado emitir. No gobierna ningún automatismo —no hay
    // ninguno—: es lo que el panel muestra para que quien decide volver a pulsar sepa
    // cuántas veces se intentó ya.
    attemptCount: integer('attempt_count').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    // `null` = lo generó el sistema (el original, desde el webhook). Con valor = el
    // administrador que disparó el ajuste (spec 023).
    createdById: uuid('created_by_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('electronic_documents_order_id_idx').on(t.orderId),
    // **Un solo comprobante original *vigente* por pedido.** Es la barrera estructural de
    // la idempotencia del webhook: aunque el `markPaid` condicional fallara en absorber
    // una reentrega, este índice impide la segunda boleta (AC6). Parcial por partida
    // doble: un pedido puede acumular varias correcciones, y el original anulado deja de
    // contar para que el spec 023 pueda **reemitir** tras corregir los datos del
    // comprador.
    uniqueIndex('electronic_documents_one_original_per_order_idx')
      .on(t.orderId)
      .where(sql`${t.kind} in ('boleta', 'factura') and ${t.status} <> 'voided'`),
    // Correlatividad: dos documentos no pueden compartir serie y número. Parcial porque
    // `comunicacion_baja` no tiene serie propia.
    uniqueIndex('electronic_documents_series_number_idx')
      .on(t.series, t.number)
      .where(sql`${t.series} is not null`),
    // Localiza lo que está sin emitir sin recorrer la tabla. No lo usa ningún proceso de
    // este spec —la acción de emisión llega por id—, sino el indicador «pedidos pagados
    // sin comprobante» que construye #3 (Ingresos v2).
    index('electronic_documents_unissued_idx')
      .on(t.createdAt)
      .where(sql`${t.status} in ('pending', 'failed')`),
    // Lo consumen #3 (Ventas declarables) y #4 (IGV débito fiscal), que agregan por rango
    // de `issued_at`.
    index('electronic_documents_issued_at_idx').on(t.issuedAt.desc()),
    check('electronic_documents_attempt_count_positive', sql`${t.attemptCount} >= 0`),
    // La baja no lleva importe ni serie propia; todo lo demás sí lleva importe.
    check(
      'electronic_documents_void_has_no_amount',
      sql`(${t.kind} = 'comunicacion_baja') = (${t.amountCents} is null)`,
    ),
    check(
      'electronic_documents_void_has_no_series',
      sql`(${t.kind} = 'comunicacion_baja') = (${t.series} is null)`,
    ),
    check(
      'electronic_documents_series_number_pair',
      sql`(${t.series} is null) = (${t.number} is null)`,
    ),
    // El original no referencia nada; toda corrección referencia algo. Es la invariante
    // del árbol y vive en la base, no solo en el service de 023.
    check(
      'electronic_documents_original_has_no_parent',
      sql`(${t.kind} in ('boleta', 'factura')) = (${t.relatedDocumentId} is null)`,
    ),
    // El desglose viaja entero o no viaja, y siempre cuadra con el total (AC26).
    check(
      'electronic_documents_amount_breakdown',
      sql`(${t.amountCents} is null and ${t.baseCents} is null and ${t.igvCents} is null)
          or (${t.amountCents} > 0
              and ${t.baseCents} > 0
              and ${t.igvCents} >= 0
              and ${t.baseCents} + ${t.igvCents} = ${t.amountCents})`,
    ),
    // `issued_at` existe exactamente cuando el documento **llegó a emitirse**. Sin esto,
    // «Ventas declarables» de #3 podría sumar un documento sin fecha o ignorar uno emitido.
    //
    // `voided` entra en el lado izquierdo, y es una **corrección de la migración `0010`**
    // (spec 023, §5): tal como 022 lo escribió —`(status = 'issued') = (issued_at is not
    // null)`— anular el original era imposible, porque el `UPDATE … SET status = 'voided'`
    // dejaba la fila con `issued_at` relleno y un estado distinto de `issued`, y el CHECK
    // reventaba. La alternativa —borrar `issued_at` al anular— habría destruido la fecha en
    // la que ese comprobante se emitió ante SUNAT, que es un dato fiscal y no un detalle de
    // estado: un documento anulado **sí** se emitió, y su período sigue siendo el suyo.
    //
    // Un `pending` o un `failed` nunca llegan a `voided`: el `WHERE status = 'issued'` de
    // `markVoided` es lo que lo garantiza, y por eso la equivalencia sigue siendo exacta.
    check(
      'electronic_documents_issued_at_matches_status',
      sql`(${t.status} in ('issued', 'voided')) = (${t.issuedAt} is not null)`,
    ),
  ],
);
