import { ELECTRONIC_DOCUMENT_KIND_LABELS } from '@/lib/electronic-documents';
import { grantsTaxCredit, PURCHASE_RECEIPT_TYPE_LABELS } from '@/lib/purchase-receipts';
import { toReportingDayKey } from '@/lib/reporting';

import { BUYER_DOCUMENT_TYPE_LABELS } from '../constants';
import type { FinanceRange } from '../types/finance.types';
import type { PurchaseRegistryRow, SalesRegistryRow } from '../types/accounting.types';

import { formatCsvAmount, formatCsvAmountOrEmpty, toCsv } from './csv';

// Las dos tablas del registro y el nombre del archivo. Puro también: lo importan el Route
// Handler que produce el CSV y el service, que solo necesita el nombre para el `download`
// del ancla temporal (AC20).
//
// Este es el archivo que cambiaría el día que SUNAT exigiera el formato PLE (§11): las
// consultas y la pantalla ya producen las filas.

export const SALES_REGISTRY_HEADERS = [
  'Fecha de emisión',
  'Tipo de documento',
  'Serie-Número',
  'Tipo de documento del comprador',
  'Número de documento del comprador',
  'Razón social',
  'Base imponible',
  'IGV',
  'Total',
  'Documento que modifica',
] as const;

export const PURCHASE_REGISTRY_HEADERS = [
  'Fecha',
  'RUC del proveedor',
  'Razón social del proveedor',
  'Tipo de comprobante',
  'Serie-Número',
  'Base imponible',
  'IGV',
  'Total',
  'Crédito fiscal',
] as const;

// Todo dato ausente es celda vacía, nunca `0.00`, `null` ni un guion que parezca dato
// (§10). Las columnas de importe pasan por `formatCsvAmountOrEmpty()`, que ya lo hace.
const EMPTY_CELL = '';

// Sí/No y no un booleano crudo: el archivo lo lee una persona.
const TAX_CREDIT_LABELS = { granted: 'Sí', denied: 'No' } as const;

function salesRegistryRecord(row: SalesRegistryRow): string[] {
  return [
    // El día de **Lima** y no el instante UTC (AC18, D-16): un comprobante emitido el 30 a
    // las 22:00 pertenece al día 30 y no al 1 del mes siguiente.
    toReportingDayKey(new Date(row.issuedAt)),
    ELECTRONIC_DOCUMENT_KIND_LABELS[row.kind],
    row.label ?? EMPTY_CELL,
    row.buyerDocumentType ? BUYER_DOCUMENT_TYPE_LABELS[row.buyerDocumentType] : EMPTY_CELL,
    row.buyerDocumentNumber ?? EMPTY_CELL,
    row.buyerLegalName ?? EMPTY_CELL,
    formatCsvAmountOrEmpty(row.baseCents),
    formatCsvAmountOrEmpty(row.igvCents),
    formatCsvAmountOrEmpty(row.amountCents),
    // Vacío en un original: no modifica a nadie (AC7).
    row.relatedLabel ?? EMPTY_CELL,
  ];
}

function purchaseRegistryRecord(row: PurchaseRegistryRow): string[] {
  return [
    // `incurred_on` es `date` con `mode: 'string'`: ya es el día, sin instante ni huso que
    // convertir.
    row.incurredOn,
    row.supplierRuc ?? EMPTY_CELL,
    row.supplierName ?? EMPTY_CELL,
    row.receiptType ? PURCHASE_RECEIPT_TYPE_LABELS[row.receiptType] : EMPTY_CELL,
    row.label ?? EMPTY_CELL,
    formatCsvAmount(row.baseCents),
    formatCsvAmountOrEmpty(row.igvCents),
    formatCsvAmount(row.amountCents),
    // Derivado con `grantsTaxCredit()` del catálogo puro y no publicado como campo del
    // contrato (AC11, D-10): la tabla de elegibilidad es una sola y la leen igual el
    // archivo y la pantalla. Vacío —y no «No»— si el tipo faltara: no se afirma que un
    // dato corrupto niegue el crédito (D-14).
    row.receiptType
      ? grantsTaxCredit(row.receiptType)
        ? TAX_CREDIT_LABELS.granted
        : TAX_CREDIT_LABELS.denied
      : EMPTY_CELL,
  ];
}

export function salesRegistryCsv(rows: readonly SalesRegistryRow[]): string {
  return toCsv([SALES_REGISTRY_HEADERS, ...rows.map(salesRegistryRecord)]);
}

export function purchaseRegistryCsv(rows: readonly PurchaseRegistryRow[]): string {
  return toCsv([PURCHASE_REGISTRY_HEADERS, ...rows.map(purchaseRegistryRecord)]);
}

export type RegistryKind = 'sales' | 'purchases';

// El nombre dice qué registro y de qué rango, y **no** dice «PLE» ni «declaración»: el
// riesgo principal de esta pantalla es que alguien tome el archivo por el registro oficial
// (§10).
const REGISTRY_FILE_PREFIX: Record<RegistryKind, string> = {
  sales: 'registro-ventas',
  purchases: 'registro-compras',
};

/**
 * `registro-ventas-2026-09-01_2026-09-30.csv`. **Una sola función pura** para el
 * `Content-Disposition` del servidor y el `a.download` del cliente (AC20): dos nombres
 * construidos por separado se desalinean, y el que manda al guardar es el del cliente.
 */
export function registryFileName(registry: RegistryKind, range: FinanceRange): string {
  return `${REGISTRY_FILE_PREFIX[registry]}-${range.from}_${range.to}.csv`;
}
