// Catálogo de comprobantes electrónicos. Módulo deliberadamente puro —sin Drizzle,
// sin Clerk y sin React— con el mismo reparto que `permissions.ts` y que
// `inventory-transactions.ts`: la fuente de verdad vive en el código y el esquema
// construye sus `pgEnum` a partir de estas tuplas, en vez de repetir los literales en
// los dos sitios (docs/SETUP.md §4, regla dura 5).
//
// Que el catálogo esté aquí es lo que permite que un componente cliente pinte una
// etiqueta o formatee una serie-número sin arrastrar `@/server` al bundle.

// Los tres últimos valores solo los escribe el spec 023. Nacen aquí para que 023 no
// necesite migración: añadir un valor a un enum de Postgres es un `ALTER TYPE` que no
// puede correr dentro de la misma transacción que lo usa (spec 022, §5.3).
export const ELECTRONIC_DOCUMENT_KINDS = [
  'boleta',
  'factura',
  'nota_credito',
  'nota_debito',
  'comunicacion_baja',
] as const;

export type ElectronicDocumentKind = (typeof ELECTRONIC_DOCUMENT_KINDS)[number];

// `voided`: el original cuando una comunicación de baja suya queda `issued` (spec 023).
// Ningún camino del spec 022 lo escribe.
export const ELECTRONIC_DOCUMENT_STATUSES = ['pending', 'issued', 'failed', 'voided'] as const;

export type ElectronicDocumentStatus = (typeof ELECTRONIC_DOCUMENT_STATUSES)[number];

// Seis claves y no cuatro: SUNAT exige que la serie de una nota de crédito o de débito
// empiece por la misma letra que el comprobante que modifica —«B» si corrige una
// boleta, «F» si corrige una factura—, así que cada combinación lleva su propio
// correlativo. La comunicación de baja no tiene serie propia: referencia el documento
// que anula.
export const DOCUMENT_SERIES_KEYS = [
  'boleta',
  'factura',
  'nota_credito_boleta',
  'nota_credito_factura',
  'nota_debito_boleta',
  'nota_debito_factura',
] as const;

export type DocumentSeriesKey = (typeof DOCUMENT_SERIES_KEYS)[number];

// Los dos únicos `kind` que el spec 022 inserta, y los dos únicos que pueden ser el padre
// de una corrección. Tupla exportada y no tres copias sueltas (spec 025, D-7): la usan el
// `WHERE` de `buildIssuedOriginalFilter()`, el tipo de abajo y `isOriginalKind()`, así que
// las tres formas de preguntar lo mismo no pueden separarse.
export const ORIGINAL_DOCUMENT_KINDS = ['boleta', 'factura'] as const;

// Tipo propio porque es lo que `seriesKeyFor` exige como segundo argumento: aceptar
// `ElectronicDocumentKind` dejaría representable «nota de crédito de una nota de
// crédito», que no existe. El `Extract` mantiene la relación con el enum: si un día se
// quitara `boleta` del catálogo, este tipo dejaría de compilar en vez de quedar suelto.
export type OriginalDocumentKind = Extract<
  ElectronicDocumentKind,
  (typeof ORIGINAL_DOCUMENT_KINDS)[number]
>;

export function isOriginalKind(kind: ElectronicDocumentKind): kind is OriginalDocumentKind {
  return (ORIGINAL_DOCUMENT_KINDS as readonly ElectronicDocumentKind[]).includes(kind);
}

// `null` = el documento no consume correlativo propio. Hoy solo `comunicacion_baja`,
// que referencia el documento que anula y por eso no tiene serie (§5.3, `CHECK
// electronic_documents_void_has_no_series`).
//
// Devolver `null` en vez de lanzar es lo que hace que el `CHECK` de la base y esta
// función digan exactamente lo mismo: quien no recibe clave, no pide número.
export function seriesKeyFor(
  kind: ElectronicDocumentKind,
  parentKind?: OriginalDocumentKind,
): DocumentSeriesKey | null {
  if (kind === 'boleta' || kind === 'factura') return kind;
  if (kind === 'comunicacion_baja') return null;
  // Una corrección sin padre no tiene serie que elegir: la letra de la serie la decide
  // el comprobante que modifica, no ella misma.
  if (!parentKind) return null;

  return `${kind}_${parentKind}` satisfies DocumentSeriesKey;
}

// Ocho dígitos, que es el ancho del correlativo en la representación impresa de SUNAT
// (`F001-00000123`). El relleno es solo presentación: a Nubefact el número viaja como
// entero, y la columna `electronic_documents.number` es `integer`.
const DOCUMENT_NUMBER_DIGITS = 8;

// `null` cuando el documento todavía no tiene par serie-número —hoy imposible en un
// original, porque se asigna al crear la fila (D-6), y real en una `comunicacion_baja`
// del spec 023—. La UI pinta un guion, no un `undefined-NaN`.
export function formatDocumentLabel(
  series: string | null,
  number: number | null,
): string | null {
  if (series === null || number === null) return null;
  return `${series}-${String(number).padStart(DOCUMENT_NUMBER_DIGITS, '0')}`;
}

// Etiquetas canónicas. Viven en el catálogo y no en `src/modules/invoicing/constants.ts`
// porque las consumen las dos orillas —el panel y «Mis compras»— y una segunda copia
// sería la que se desalinea. El módulo las reexporta para que sus componentes tengan una
// sola superficie de import.
export const ELECTRONIC_DOCUMENT_KIND_LABELS: Record<ElectronicDocumentKind, string> = {
  boleta: 'Boleta de venta electrónica',
  factura: 'Factura electrónica',
  nota_credito: 'Nota de crédito electrónica',
  nota_debito: 'Nota de débito electrónica',
  comunicacion_baja: 'Comunicación de baja',
};

export const ELECTRONIC_DOCUMENT_STATUS_LABELS: Record<ElectronicDocumentStatus, string> = {
  pending: 'Pendiente de emisión',
  issued: 'Emitido',
  failed: 'Falló la emisión',
  voided: 'Anulado',
};

// ---------------------------------------------------------------------------
// Motivos de corrección (spec 023, §6.2). Contrastados en su T1 (§6.6.1).
// ---------------------------------------------------------------------------

/**
 * Catálogo 09 de SUNAT, el subconjunto que este negocio puede usar. Sin `05` (descuento
 * por ítem) ni `08` (bonificación) por lo mismo que `07` solo aparece en la devolución
 * parcial: este spec ajusta **un monto** del pedido, no una línea concreta (023, §3).
 */
export const CREDIT_NOTE_REASONS = [
  { code: '01', label: 'Anulación de la operación' },
  { code: '02', label: 'Anulación por error en el RUC' },
  { code: '03', label: 'Corrección por error en la descripción' },
  { code: '04', label: 'Descuento global' },
  { code: '06', label: 'Devolución total' },
  { code: '07', label: 'Devolución por ítem' },
  { code: '09', label: 'Disminución en el valor' },
] as const;

/** Catálogo 10 de SUNAT. */
export const DEBIT_NOTE_REASONS = [
  { code: '01', label: 'Intereses por mora' },
  { code: '02', label: 'Aumento en el valor' },
  { code: '03', label: 'Penalidades u otros conceptos' },
] as const;

/** Las cuatro intenciones de ajuste. Vive aquí y no en el módulo: la consumen las dos orillas. */
export const ADJUSTMENT_INTENTS = [
  'anulacion_total',
  'devolucion_parcial',
  'correccion_comprador',
  'cargo_adicional',
] as const;

export type AdjustmentIntent = (typeof ADJUSTMENT_INTENTS)[number];

/**
 * Qué motivos admite cada intención. Es una tabla y no un `switch` porque la consume dos
 * veces: Zod la usa para construir el `enum` de cada rama de la unión discriminada y el
 * diálogo para pintar su `Select`, así que una sola fuente evita que la UI ofrezca un
 * motivo que el servidor rechaza (023, AC13).
 *
 * Las tres primeras son códigos del catálogo 09; `cargo_adicional` es del 10, que es otro
 * catálogo con los mismos dígitos. Por eso el motivo nunca se lee solo: siempre con el
 * `kind` del documento al lado (`reasonLabelFor`).
 */
export const REASONS_BY_INTENT = {
  anulacion_total: ['01', '06'],
  devolucion_parcial: ['04', '07', '09'],
  correccion_comprador: ['02', '03'],
  cargo_adicional: ['01', '02', '03'],
} as const satisfies Record<AdjustmentIntent, readonly string[]>;

/**
 * Qué catálogo le toca a cada `kind`. La baja lee del 09 —el motivo de la anulación es el
 * mismo que llevaría la nota de crédito que la sustituye (D-12)— y los originales no
 * llevan motivo en absoluto.
 */
function reasonsFor(kind: ElectronicDocumentKind): readonly { code: string; label: string }[] {
  if (kind === 'nota_debito') return DEBIT_NOTE_REASONS;
  if (kind === 'nota_credito' || kind === 'comunicacion_baja') return CREDIT_NOTE_REASONS;
  return [];
}

/**
 * Etiqueta del motivo ya resuelta contra su catálogo. `null` cuando el documento no lleva
 * motivo —todo original— o cuando el código no está en el catálogo, que es dato viejo y no
 * una excusa para pintar un código desnudo.
 *
 * Vive aquí, en servidor y en cliente a la vez, porque la resuelve el repositorio para
 * publicarla en `ElectronicDocumentRow` (023, §6.3) y la consume el `Select` del diálogo:
 * dos copias serían dos textos que se desalinean.
 */
export function reasonLabelFor(
  kind: ElectronicDocumentKind,
  code: string | null,
): string | null {
  if (code === null) return null;
  return reasonsFor(kind).find((reason) => reason.code === code)?.label ?? null;
}
