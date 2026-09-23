// Traducción del `receipt` del contrato a las seis columnas de `expenses`, más el
// cálculo del IGV contenido. Módulo puro: sin Drizzle, sin Zod y sin React.
//
// El IGV se calcula **aquí y solo aquí**. Ningún otro camino escribe `igv_cents` y
// ningún schema de entrada lo acepta, que es lo que hace imposible que el cliente fije
// el impuesto (AC7).

import { carriesIgv, type PurchaseReceiptType } from '@/lib/purchase-receipts';
import type { expenses } from '@/server/db/schema';

import type {
  PurchaseReceiptInput,
  UpdateExpenseInput,
} from '../schemas/finance.schema';
import { splitIgv } from './igv';

// `import type` puro, como ya hace `finance.types.ts` en este mismo módulo: se borra al
// compilar, así que no arrastra Drizzle a ningún bundle.
type Expense = typeof expenses.$inferSelect;

/** Las seis columnas nuevas, siempre las seis: un `UPDATE` parcial dejaría mezcla. */
export type ExpenseReceiptColumns = {
  receiptType: PurchaseReceiptType | null;
  supplierRuc: string | null;
  supplierName: string | null;
  receiptSeries: string | null;
  receiptNumber: string | null;
  igvCents: number | null;
};

/**
 * El estado anterior que necesita `resolveReceiptColumns` para decidir sobre el estado
 * **fusionado**. Es un `Pick` de la fila de `expenses` y no un tipo redeclarado, para
 * que añadir una columna al comprobante rompa aquí en vez de olvidarse.
 */
export type ExpenseReceiptBefore = Pick<
  Expense,
  | 'receiptType'
  | 'supplierRuc'
  | 'supplierName'
  | 'receiptSeries'
  | 'receiptNumber'
  | 'amountCents'
>;

/** Las seis en `null`: el gasto sin comprobante formal. */
function noReceipt(): ExpenseReceiptColumns {
  return {
    receiptType: null,
    supplierRuc: null,
    supplierName: null,
    receiptSeries: null,
    receiptNumber: null,
    igvCents: null,
  };
}

/**
 * El IGV contenido en el importe, o `null` si el tipo de comprobante no es afecto.
 *
 * `null` y no `0` (D-5): cero significaría «este comprobante lleva un IGV de cero», que
 * es una afirmación distinta y falsa sobre un recibo por honorarios. La tabla de
 * `@/lib/purchase-receipts` es quien decide, no un condicional suelto (AC16).
 */
function igvFor(type: PurchaseReceiptType, amountCents: number): number | null {
  return carriesIgv(type) ? splitIgv(amountCents).igvCents : null;
}

/**
 * Traduce el `receipt` del contrato a columnas y calcula el IGV. `null` devuelve las
 * seis en `null`, que es lo que hace que apagar el interruptor limpie de verdad (AC10).
 */
export function toReceiptColumns(
  receipt: PurchaseReceiptInput | null,
  amountCents: number,
): ExpenseReceiptColumns {
  if (receipt === null) return noReceipt();

  return {
    receiptType: receipt.type,
    supplierRuc: receipt.supplierRuc,
    supplierName: receipt.supplierName,
    // `?? null` y no el `undefined` de Zod: la columna es nullable y Drizzle escribiría
    // un `undefined` como «no toques esta columna», que aquí sería dejar la serie vieja.
    receiptSeries: receipt.series ?? null,
    receiptNumber: receipt.number ?? null,
    igvCents: igvFor(receipt.type, amountCents),
  };
}

/**
 * La versión del `PATCH`. Recibe la fila **anterior** y el cuerpo parcial, y decide
 * sobre el estado fusionado —los campos que cambian más los que no—, no sobre lo que
 * llega en el body (D-7):
 *
 * - `receipt` omitido + `amountCents` sin cambio  → `null` (no hay nada que escribir;
 *   el `UPDATE` no toca las seis columnas y omitir no es borrar, AC11).
 * - `receipt` omitido + `amountCents` nuevo       → recalcula el IGV del comprobante que
 *   ya estaba, porque el IGV viejo ya no cuadra con el importe nuevo (AC9).
 * - `receipt: null`                               → las seis a `null` (AC10).
 * - `receipt` con valor                           → columnas nuevas e IGV del importe
 *   resultante.
 */
export function resolveReceiptColumns(
  before: ExpenseReceiptBefore,
  patch: UpdateExpenseInput,
): ExpenseReceiptColumns | null {
  // El importe sobre el que se desglosa es el del estado fusionado: el nuevo si el
  // cuerpo lo trae, y si no el que ya tenía la fila.
  const amountCents = patch.amountCents ?? before.amountCents;

  // Presente en el cuerpo —con valor o con `null`— manda el cuerpo. `undefined` es la
  // tercera semántica y se trata abajo, por eso la comparación es contra `undefined` y
  // no un `if (patch.receipt)`, que confundiría `null` con ausente.
  if (patch.receipt !== undefined) return toReceiptColumns(patch.receipt, amountCents);

  // Omitido: el comprobante no se toca. Sin comprobante previo no hay nada que
  // recalcular, y no se inventa ninguno.
  if (before.receiptType === null) return null;

  // Con comprobante previo, lo único que puede haber quedado desfasado es el IGV, y solo
  // si el importe cambió. El `CHECK` de la base no atrapa un IGV simplemente viejo —
  // sigue siendo menor que el importe— así que este recálculo es la única barrera (§10).
  if (amountCents === before.amountCents) return null;

  return {
    receiptType: before.receiptType,
    supplierRuc: before.supplierRuc,
    supplierName: before.supplierName,
    receiptSeries: before.receiptSeries,
    receiptNumber: before.receiptNumber,
    igvCents: igvFor(before.receiptType, amountCents),
  };
}
