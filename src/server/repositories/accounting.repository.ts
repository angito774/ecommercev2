import { and, asc, count, eq, gte, inArray, isNotNull, lt, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  formatDocumentLabel,
  NUMBERED_DOCUMENT_KINDS,
  type NumberedDocumentKind,
} from '@/lib/electronic-documents';
import type {
  PurchaseRegistryRow,
  SalesRegistryRow,
} from '@/modules/finance/types/accounting.types';
import { db, type Reader } from '@/server/db';
import { electronicDocuments, expenses, orders } from '@/server/db/schema';

import { buildExpenseFilters, type DayRange, type InstantRange } from './finance.repository';

// Repositorio propio y no una ampliación de `finance.repository.ts` (D-12): aquel archivo
// es el de los **agregados** del módulo —sus constantes, su `toCents` y su alias existen
// para sumar—, y estas dos son listados paginados de dos tablas distintas. Lo único que
// comparten con él es el vocabulario de rango, que se importa como tipo, y
// `buildExpenseFilters()`, que es la definición del período de un gasto (D-3). Precedente
// exacto: `pricing.repository.ts` (021, D-8).

/** Paginación explícita; `null` = sin `limit`/`offset`, que es lo que pide la exportación (D-7). */
export type RegistryPagination = { page: number; pageSize: number } | null;

export type SalesRegistryResult = { data: SalesRegistryRow[]; total: number };

export type PurchaseRegistryResult = { data: PurchaseRegistryRow[]; total: number };

// ---------------------------------------------------------------------------
// Registro de Ventas
// ---------------------------------------------------------------------------

// El padre del auto-join, con su propio alias de módulo: el `JOIN` y el `SELECT` tienen
// que hablar de la misma tabla.
const parentDocuments = alias(electronicDocuments, 'parent_document');

/**
 * La regla del Registro de Ventas, exportada para compilarla con `PgDialect` y probarla
 * sin base de datos: `issued` + la ventana semiabierta de `issued_at` + los `kind` que
 * consumen serie y número propios.
 *
 * **Deliberadamente NO reutiliza `buildDeclarableFilter()`** (D-1). No es la misma
 * pregunta: aquel filtro exige «sin padre o padre `issued`» para poder **sumar un neto**,
 * y `voidsParent()` deja `voided` al original justo en las anulaciones más frecuentes
 * (motivos 01, 06, 02 y 03). Reutilizarlo escondería del registro precisamente esas notas
 * de crédito (AC5), que son documentos reales que SUNAT ya tiene. Un registro lista
 * documentos; un neto los compensa.
 *
 * La ventana sí es la misma —`gte`/`lt` sobre `issued_at`, derivada del mismo
 * `resolveFinanceRange()`—, y eso es lo que hace imposible que un documento caiga en el
 * registro de un mes y en el neto de otro (AC6).
 */
export function buildSalesRegistryFilter({ from, to }: InstantRange): SQL {
  return and(
    eq(electronicDocuments.status, 'issued'),
    gte(electronicDocuments.issuedAt, from),
    lt(electronicDocuments.issuedAt, to),
    // Derivado del catálogo y no escrito a mano (AC28, D-9): la `comunicacion_baja` queda
    // fuera porque no consume serie ni número propios y no lleva importes, así que no hay
    // nada que cruzar contra el SIRE (D-8).
    inArray(electronicDocuments.kind, NUMBERED_DOCUMENT_KINDS),
  ) as SQL;
}

// Drizzle tipa la columna con el enum entero, pero el `inArray` de arriba es lo que
// garantiza que ninguna fila llegue aquí con `comunicacion_baja`. La plantilla declara el
// tipo estrecho en el mismo archivo que el filtro que lo sostiene, en vez de repartir un
// `as` por el mapeo. Se usa en una sola cláusula y no hay `GROUP BY`, así que no entra en
// la clase de bug del 42803 del spec 015.
const NUMBERED_KIND = sql<NumberedDocumentKind>`${electronicDocuments.kind}`;

type SalesRegistryQueryRow = {
  id: string;
  issuedAt: Date | null;
  kind: NumberedDocumentKind;
  series: string | null;
  number: number | null;
  buyerDocumentType: SalesRegistryRow['buyerDocumentType'];
  buyerDocumentNumber: string | null;
  buyerLegalName: string | null;
  baseCents: number | null;
  igvCents: number | null;
  amountCents: number | null;
  relatedSeries: string | null;
  relatedNumber: number | null;
};

function toSalesRegistryRow(row: SalesRegistryQueryRow): SalesRegistryRow {
  const { series, number, relatedSeries, relatedNumber, issuedAt, ...rest } = row;

  return {
    ...rest,
    // ISO y no `Date`: JSON no transporta fechas y el tipo del cliente no debe mentir
    // sobre lo que recibe. El día de Lima lo deriva quien pinta (D-16).
    //
    // `issued_at` no puede ser nulo aquí: el `CHECK
    // electronic_documents_issued_at_matches_status` lo exige relleno en todo lo `issued`,
    // y el filtro no deja pasar otra cosa. Si de todos modos llegara nulo, es el invariante
    // roto —no un hueco que rellenar en silencio con una fecha inventada (D-14, revisión de
    // este spec)—: se lanza para que se vea, no para que el registro publique 1970-01-01.
    issuedAt: issuedAt === null
      ? (() => {
          throw new Error(
            `electronic_documents ${row.id} está 'issued' sin issued_at: invariante roto`,
          );
        })()
      : issuedAt.toISOString(),
    label: formatDocumentLabel(series, number),
    // Por `related_document_id` y no por la letra de la serie (AC7): el parentesco se lee
    // de la columna, que es la única que lo sabe.
    relatedLabel: formatDocumentLabel(relatedSeries, relatedNumber),
  };
}

/**
 * Una fila por documento fiscal del rango. `innerJoin` a `orders` por su **clave
 * primaria**, que es de donde salen el tipo y el número de documento del comprador: no
 * están en `electronic_documents` (AC8).
 *
 * Orden **cronológico ascendente** y no descendente como el listado de gastos (D-11): un
 * registro se lee como un libro, de la primera operación del período a la última, que es
 * el orden en que se cruza contra el SIRE y el que sale en el CSV. Los tres desempates
 * son lo que hace estable la paginación (AC13).
 */
export async function findSalesRegistry(
  range: InstantRange,
  pagination: RegistryPagination,
  reader: Reader = db,
): Promise<SalesRegistryResult> {
  const where = buildSalesRegistryFilter(range);

  const rows = reader
    .select({
      id: electronicDocuments.id,
      issuedAt: electronicDocuments.issuedAt,
      kind: NUMBERED_KIND,
      series: electronicDocuments.series,
      number: electronicDocuments.number,
      buyerDocumentType: orders.buyerDocumentType,
      buyerDocumentNumber: orders.buyerDocumentNumber,
      buyerLegalName: orders.buyerLegalName,
      baseCents: electronicDocuments.baseCents,
      igvCents: electronicDocuments.igvCents,
      amountCents: electronicDocuments.amountCents,
      relatedSeries: parentDocuments.series,
      relatedNumber: parentDocuments.number,
    })
    .from(electronicDocuments)
    // `innerJoin` y no una consulta por fila: `order_id` es `notNull` con FK `restrict`,
    // así que la fila de `orders` existe siempre, y el lado buscado es su clave primaria.
    .innerJoin(orders, eq(orders.id, electronicDocuments.orderId))
    // `leftJoin`: un original no tiene padre, y su serie-número corregida queda vacía.
    // Otra vez la clave primaria, que es la razón por la que no hace falta índice sobre
    // `related_document_id` (§5.1).
    .leftJoin(parentDocuments, eq(parentDocuments.id, electronicDocuments.relatedDocumentId))
    .where(where)
    .orderBy(
      asc(electronicDocuments.issuedAt),
      asc(electronicDocuments.series),
      asc(electronicDocuments.number),
      asc(electronicDocuments.id),
    );

  // La exportación se lleva el rango entero y su total es lo que se acaba de traer, así
  // que no se ejecuta ninguna segunda consulta (D-7).
  if (pagination === null) {
    const all = await rows;
    return { data: all.map(toSalesRegistryRow), total: all.length };
  }

  const [page, [totals]] = await Promise.all([
    rows.limit(pagination.pageSize).offset((pagination.page - 1) * pagination.pageSize),
    // El conteo va **sin los joins**: los tres filtros viven en `electronic_documents`,
    // igual que `findManyExpenses()` cuenta sin unir `users`.
    reader.select({ value: count() }).from(electronicDocuments).where(where),
  ]);

  return { data: page.map(toSalesRegistryRow), total: totals?.value ?? 0 };
}

// ---------------------------------------------------------------------------
// Registro de Compras
// ---------------------------------------------------------------------------

/**
 * El filtro de compras **sí** compone `buildExpenseFilters()` (D-3): lo que se importa es
 * la **definición del período** —los dos extremos inclusive sobre una columna `date`—, y
 * una tercera copia se quedaría atrás en silencio el día que alguien la toque, haciendo
 * que el registro y la card de gastos discreparan sobre qué día entra (AC9).
 *
 * `receipt_type is not null` es el discriminador del comprobante (024): un gasto sin
 * comprobante formal no es una compra que cruzar contra el SIRE, y sigue apareciendo en
 * el listado de Egresos como siempre (AC10).
 *
 * Sin `category`: el rango es el único filtro de esta pantalla, y la firma —`DayRange` y
 * no `ExpenseFilters`— es lo que lo hace cumplir.
 */
export function buildPurchaseRegistryFilter(range: DayRange): SQL {
  return and(buildExpenseFilters(range), isNotNull(expenses.receiptType)) as SQL;
}

type PurchaseRegistryQueryRow = {
  id: string;
  incurredOn: string;
  receiptType: PurchaseRegistryRow['receiptType'];
  supplierRuc: string | null;
  supplierName: string | null;
  receiptSeries: string | null;
  receiptNumber: string | null;
  igvCents: number | null;
  amountCents: number;
};

function toPurchaseRegistryRow(row: PurchaseRegistryQueryRow): PurchaseRegistryRow {
  const { receiptSeries, receiptNumber, ...rest } = row;

  return {
    ...rest,
    // Sin padding, a diferencia de las ventas: el correlativo de una compra se copia de un
    // papel ajeno donde ya viene con sus ceros, y `00001234` no es `1234` al cotejarlo
    // (024, D-14). Serie y número viajan juntos o no viajan —`CHECK
    // expenses_receipt_series_number_pair`—, pero se comprueban los dos porque TypeScript
    // no lee constraints de Postgres.
    label: receiptSeries && receiptNumber ? `${receiptSeries}-${receiptNumber}` : null,
    // Resta entera: el importe registrado lleva el IGV incluido, así que la base es lo que
    // queda al quitarlo. Sin IGV calculado —recibo por honorarios, «otro»— la base es el
    // importe completo, y nunca se inventa un 18 % sobre un comprobante que no es afecto
    // (AC12).
    baseCents: row.amountCents - (row.igvCents ?? 0),
  };
}

/**
 * Una fila por comprobante de compra del rango. Sin joins: `expenses` guarda el proveedor
 * copiado en sus propias columnas desde el spec 024, así que no hay `users` que unir —quien
 * registró el gasto es del listado de Egresos, no del registro contable—.
 *
 * Orden cronológico ascendente con los tres desempates, igual que ventas (D-11, AC13).
 */
export async function findPurchaseRegistry(
  range: DayRange,
  pagination: RegistryPagination,
  reader: Reader = db,
): Promise<PurchaseRegistryResult> {
  const where = buildPurchaseRegistryFilter(range);

  const rows = reader
    .select({
      id: expenses.id,
      incurredOn: expenses.incurredOn,
      receiptType: expenses.receiptType,
      supplierRuc: expenses.supplierRuc,
      supplierName: expenses.supplierName,
      receiptSeries: expenses.receiptSeries,
      receiptNumber: expenses.receiptNumber,
      igvCents: expenses.igvCents,
      amountCents: expenses.amountCents,
    })
    .from(expenses)
    .where(where)
    .orderBy(asc(expenses.incurredOn), asc(expenses.createdAt), asc(expenses.id));

  if (pagination === null) {
    const all = await rows;
    return { data: all.map(toPurchaseRegistryRow), total: all.length };
  }

  const [page, [totals]] = await Promise.all([
    rows.limit(pagination.pageSize).offset((pagination.page - 1) * pagination.pageSize),
    reader.select({ value: count() }).from(expenses).where(where),
  ]);

  return { data: page.map(toPurchaseRegistryRow), total: totals?.value ?? 0 };
}
