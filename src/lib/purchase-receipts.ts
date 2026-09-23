// Catálogo de comprobantes de compra. Módulo puro —sin Drizzle, sin Zod y sin React—
// con el mismo reparto que `electronic-documents.ts`: la fuente de verdad vive aquí y
// el esquema construye su `pgEnum` a partir de esta tupla (docs/SETUP.md §4, regla 5).
//
// Que esté aquí es lo que permite que el repositorio construya el WHERE del agregado y
// que un componente cliente pinte la etiqueta, sin que ninguno arrastre al otro.

export const PURCHASE_RECEIPT_TYPES = [
  'factura',
  'boleta',
  'recibo_honorarios',
  'otro',
] as const;

export type PurchaseReceiptType = (typeof PURCHASE_RECEIPT_TYPES)[number];

type PurchaseReceiptRule = { carriesIgv: boolean; grantsTaxCredit: boolean };

/**
 * Las dos reglas tributarias del tipo de comprobante, juntas y en forma de tabla.
 *
 * `carriesIgv`  — si el importe lleva IGV incluido al 18 % y por tanto se desglosa.
 * `grantsTaxCredit` — si ese IGV da derecho a crédito fiscal al comprador con RUC.
 *
 * **T1 del spec 024 se cerró sin poder contrastar estos valores contra la normativa
 * vigente** (§5.1.1): la sesión no tuvo acceso a ninguna fuente normativa. Se conservan
 * los valores conservadores, porque subdeclarar crédito fiscal se corrige y
 * sobredeclararlo es una infracción. Cambiar una celda es editar este objeto y su test:
 * ninguna otra pieza del código depende de los valores concretos, solo de que la tabla
 * exista.
 *
 * Cuidado con el efecto colateral de corregirla: `expenses.igv_cents` se calcula al
 * guardar, así que pasar un tipo a `carriesIgv: true` no recalcula las filas ya
 * registradas (spec 024, §10).
 */
export const PURCHASE_RECEIPT_RULES: Record<PurchaseReceiptType, PurchaseReceiptRule> = {
  factura: { carriesIgv: true, grantsTaxCredit: true },
  // Afecta a IGV —el precio lo lleva incluido— pero por regla general no sustenta
  // crédito fiscal al comprador.
  boleta: { carriesIgv: true, grantsTaxCredit: false },
  // Renta de cuarta categoría: no es un comprobante afecto a IGV, así que no hay un
  // 18 % contenido que desglosar ni crédito que tomar (spec 024, D-5).
  recibo_honorarios: { carriesIgv: false, grantsTaxCredit: false },
  otro: { carriesIgv: false, grantsTaxCredit: false },
};

export function carriesIgv(type: PurchaseReceiptType): boolean {
  return PURCHASE_RECEIPT_RULES[type].carriesIgv;
}

export function grantsTaxCredit(type: PurchaseReceiptType): boolean {
  return PURCHASE_RECEIPT_RULES[type].grantsTaxCredit;
}

/**
 * Los tipos elegibles, derivados de la tabla y no escritos a mano. Lo consume el
 * `inArray` del agregado del repositorio: así el SQL y la vista no pueden discrepar
 * sobre qué cuenta como crédito fiscal (AC16).
 */
export const TAX_CREDIT_RECEIPT_TYPES = PURCHASE_RECEIPT_TYPES.filter(grantsTaxCredit);

export const PURCHASE_RECEIPT_TYPE_LABELS: Record<PurchaseReceiptType, string> = {
  factura: 'Factura',
  boleta: 'Boleta de venta',
  recibo_honorarios: 'Recibo por honorarios',
  otro: 'Otro comprobante',
};
