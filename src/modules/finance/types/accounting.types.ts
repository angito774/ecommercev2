import type { NumberedDocumentKind } from '@/lib/electronic-documents';
import type { PurchaseReceiptType } from '@/lib/purchase-receipts';
import type { orders } from '@/server/db/schema';

// Archivo propio y no un apéndice de `finance.types.ts` —que son los agregados del
// resumen y de impuestos—, con el precedente de `pricing.types.ts`: esto son dos listados
// de documentos y no comparten con aquellos ni un campo.

// Inferido del schema Drizzle, nunca redeclarado a mano (CLAUDE.md regla 5).
type Order = typeof orders.$inferSelect;

// Una fila del Registro de Ventas: **un documento fiscal**, no un neto. Por eso no hay
// signo ni resta en ninguna parte — el signo es del agregado de 025/026, y aquí cada
// documento se lee tal y como se emitió.
export type SalesRegistryRow = {
  id: string;
  /** ISO del `issued_at`. El día de Lima lo deriva quien pinta, con `toReportingDayKey` (D-16). */
  issuedAt: string;
  kind: NumberedDocumentKind;
  /** `F001-00000123`, ya formateado con `formatDocumentLabel` (padding de 8 dígitos). */
  label: string | null;
  /** De `orders`, no de `electronic_documents` (AC8). */
  buyerDocumentType: Order['buyerDocumentType'];
  buyerDocumentNumber: string | null;
  /** Solo en factura: el `CHECK orders_buyer_legal_name_requires_ruc` lo garantiza. */
  buyerLegalName: string | null;
  /** Los tres nullables porque la columna lo es; nunca `0`, que afirmaría «importe cero». */
  baseCents: number | null;
  igvCents: number | null;
  amountCents: number | null;
  /** Serie-número del documento que corrige; `null` en un original (AC7). */
  relatedLabel: string | null;
};

// Una fila del Registro de Compras. **No publica si otorga crédito fiscal**: es derivable
// de `receiptType` con `grantsTaxCredit()`, módulo puro que importan igual el CSV del
// servidor y la tabla del cliente. Publicarlo sería una segunda fuente de la misma regla
// (024, AC16; AC11, D-10).
export type PurchaseRegistryRow = {
  id: string;
  /** `'YYYY-MM-DD'` tal cual: `incurred_on` es `date` con `mode: 'string'`. */
  incurredOn: string;
  /**
   * Nullables aunque el `WHERE` los garantice (D-14): TypeScript no lee `CHECK`s de
   * Postgres, y las otras dos salidas —lanzar o descartar la fila— tumbarían el registro
   * entero o perderían una compra en silencio, que es lo más grave que puede hacer esta
   * pantalla. El nulo se pinta como celda vacía y el resto del período sigue siendo útil.
   */
  receiptType: PurchaseReceiptType | null;
  supplierRuc: string | null;
  supplierName: string | null;
  /** `F001-00001234` con los ceros como se registraron; `null` si se anotó sin serie. */
  label: string | null;
  /** `amountCents − igvCents`, o el importe completo si el tipo no es afecto (AC12). */
  baseCents: number;
  /** `null` cuando el comprobante no lleva IGV. Nunca `0` (024, D-5). */
  igvCents: number | null;
  amountCents: number;
};

// Mismo `meta` que el resto del módulo, más la paginación del listado de gastos: el
// rango resuelto en el servidor es lo que rotula la UI y lo que hace visible un error de
// huso en la propia respuesta.
type RegistryMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  range: { from: string; to: string };
  timeZone: string;
  generatedAt: string;
};

export type SalesRegistryResponse = { data: SalesRegistryRow[]; meta: RegistryMeta };
export type PurchaseRegistryResponse = { data: PurchaseRegistryRow[]; meta: RegistryMeta };
