import {
  REASONS_BY_INTENT,
  type ElectronicDocumentKind,
  type OriginalDocumentKind,
} from '@/lib/electronic-documents';

import type { OrderAdjustmentInput } from '../schemas/order-adjustment.schema';

// Módulo puro: sin Drizzle, sin Stripe y sin React. Es la regla fiscal del spec 023 y se
// prueba sin base de datos, que es lo que hace imposible saltársela desde el cuerpo de la
// petición (D-3).

/** Los tres `kind` que un ajuste puede crear. Un ajuste nunca produce un original. */
export type CorrectionKind = Exclude<ElectronicDocumentKind, 'boleta' | 'factura'>;

export type AdjustmentPlan = {
  /** El documento que se va a crear. */
  kind: CorrectionKind;
  reasonCode: string;
  /** Importe del documento. `null` solo en `comunicacion_baja`. */
  amountCents: number | null;
  /** Lo que hay que devolver por Stripe. `0` = el ajuste no mueve dinero. */
  refundCents: number;
  /** El original queda `voided` cuando **este** documento se emita, no antes (D-10). */
  voidsParent: boolean;
};

/**
 * **La regla sigue sin confirmarse y por eso devuelve `false`** (D-12, T1 en §6.6.1). El
 * documento de diseño afirma que la comunicación de baja «solo aplica a boletas, nunca
 * facturas», y eso contradice la lectura de la norma —la baja es el mecanismo de la
 * **factura** dentro de una ventana corta desde la emisión, mientras que las boletas se
 * anulan por el resumen diario—. Este entorno no tiene salida a internet, así que no se
 * resuelve por deducción: se confirma contra la fuente y se escribe aquí.
 *
 * `false` significa «siempre nota de crédito», que es el mecanismo general, cubre todos los
 * casos y **nunca es inválido**; elegir baja por error sí lo sería.
 *
 * La función existe aisladamente **por eso**: sea cual sea la regla, cambiarla es editar
 * este cuerpo y su test, y todo lo demás —el service, el provider, el diálogo— sigue igual,
 * porque la rama de `comunicacion_baja` ya está construida de punta a punta.
 *
 * Con la emisión manual (022, D-8) el plazo de la ventana se cuenta desde la **emisión del
 * original** y no desde el cobro: entre uno y otro puede haber días, y usar la fecha del
 * pedido dejaría fuera de plazo documentos que sí lo están. Por eso el argumento es
 * `original.issuedAt` y no `order.createdAt`.
 */
export function canVoidWithCommunication(
  original: { kind: OriginalDocumentKind; issuedAt: Date },
  now: Date,
): boolean {
  // Los dos argumentos se nombran y se ignoran a propósito: son la firma que la regla
  // confirmada va a necesitar, y quitarlos hoy obligaría a tocar a los dos llamadores
  // mañana. El `void` deja constancia de que no leerlos es la decisión, no un olvido.
  void original;
  void now;

  return false;
}

/**
 * Los motivos del catálogo 09 que **anulan** el comprobante que corrigen. No es una lista
 * escrita a mano: son exactamente los de las dos intenciones que cancelan la venta entera
 * —`anulacion_total` (01, 06) y `correccion_comprador` (02, 03)—, y derivarlos de
 * `REASONS_BY_INTENT` es lo que impide que esta lista y las reglas 1 y 3 de §6.2 se
 * separen. Los de `devolucion_parcial` (04, 07, 09) quedan fuera, y el test del catálogo
 * comprueba que los dos conjuntos son disjuntos.
 */
const VOIDING_CREDIT_NOTE_REASONS: ReadonlySet<string> = new Set([
  ...REASONS_BY_INTENT.anulacion_total,
  ...REASONS_BY_INTENT.correccion_comprador,
]);

/**
 * Si este documento, al emitirse, deja `voided` al que modifica. Puro y sobre la **fila**
 * —`kind` y `reason_code`— y no sobre la intención del ajuste: la intención no se persiste
 * en ninguna columna (D-6) y `persistSuccess()` solo tiene delante el documento emitido.
 *
 * Una nota de débito nunca anula nada: documenta un importe **mayor**, así que el
 * comprobante original sigue describiendo una venta que ocurrió.
 */
export function voidsParent(document: {
  kind: ElectronicDocumentKind;
  reasonCode: string | null;
}): boolean {
  if (document.kind === 'comunicacion_baja') return true;
  if (document.kind !== 'nota_credito') return false;

  return document.reasonCode !== null && VOIDING_CREDIT_NOTE_REASONS.has(document.reasonCode);
}

/** El mecanismo de una cancelación íntegra: baja si la regla lo admite, nota de crédito si no. */
function cancellationKind(
  original: { kind: OriginalDocumentKind; issuedAt: Date },
  now: Date,
): CorrectionKind {
  return canVoidWithCommunication(original, now) ? 'comunicacion_baja' : 'nota_credito';
}

/**
 * Única función que decide qué documento SUNAT corresponde. Vive en servidor y es pura, así
 * que la UI **no** elige el mecanismo: elige la intención y ve el plan que el servidor
 * calculó. Que la UI pudiera proponer «emite una comunicación de baja» sería dejar una
 * decisión fiscal en manos de un `<Select>` (D-3).
 *
 * `voidsParent` no se escribe rama a rama: se deriva del par `kind` + `reasonCode` con la
 * misma función que `persistSuccess()` usará después sobre la fila ya emitida. Así el plan
 * y la anulación no pueden discrepar.
 */
export function planAdjustment(args: {
  input: OrderAdjustmentInput;
  original: { kind: OriginalDocumentKind; amountCents: number; issuedAt: Date };
  amountTotalCents: number;
  refundedAmountCents: number;
  now: Date;
}): AdjustmentPlan {
  const { input, original, amountTotalCents, refundedAmountCents, now } = args;

  const plan = ((): Omit<AdjustmentPlan, 'voidsParent'> => {
    switch (input.intent) {
      case 'anulacion_total': {
        // El importe de una anulación total es, por definición, el saldo no reembolsado:
        // no llega en el cuerpo y no puede llegar (§6.1).
        const refundCents = amountTotalCents - refundedAmountCents;
        const kind = cancellationKind(original, now);

        return {
          kind,
          reasonCode: input.reasonCode,
          // La baja **siempre** lleva `amountCents: null`, que es lo que exige el `CHECK
          // electronic_documents_void_has_no_amount` (regla 5 de §6.2).
          amountCents: kind === 'comunicacion_baja' ? null : refundCents,
          refundCents,
        };
      }

      case 'devolucion_parcial':
        return {
          kind: 'nota_credito',
          reasonCode: input.reasonCode,
          amountCents: input.amountCents,
          refundCents: input.amountCents,
        };

      case 'correccion_comprador': {
        // Mismo mecanismo que la anulación total, pero **sin dinero**: lo que está mal son
        // los datos fiscales, no el importe. El documento acredita el original íntegro para
        // que la reemisión (AC15) pueda nacer con los datos corregidos.
        const kind = cancellationKind(original, now);

        return {
          kind,
          reasonCode: input.reasonCode,
          amountCents: kind === 'comunicacion_baja' ? null : original.amountCents,
          refundCents: 0,
        };
      }

      case 'cargo_adicional':
        // La nota de débito **documenta** un mayor importe; no cobra nada (D-8).
        return {
          kind: 'nota_debito',
          reasonCode: input.reasonCode,
          amountCents: input.amountCents,
          refundCents: 0,
        };
    }
  })();

  return { ...plan, voidsParent: voidsParent(plan) };
}
