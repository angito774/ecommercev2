// Las etiquetas viven en `src/lib/electronic-documents.ts` —el catálogo puro— y se
// reexportan desde aquí para que los componentes del módulo tengan una sola superficie de
// import. Reexportar y no volver a escribirlas: una segunda copia sería la que se
// desalinea el día que se renombre un estado.
export {
  ADJUSTMENT_INTENTS,
  ELECTRONIC_DOCUMENT_KIND_LABELS,
  ELECTRONIC_DOCUMENT_STATUS_LABELS,
  CREDIT_NOTE_REASONS,
  DEBIT_NOTE_REASONS,
  REASONS_BY_INTENT,
} from '@/lib/electronic-documents';

// El documento se lee siempre dentro del pedido que lo produjo —el sheet del panel y el
// diálogo del historial—, así que no hay lista propia que cachear: la mutación invalida
// las claves del pedido. Esta clave existe para lo único que es del documento y no del
// pedido, la mutación en sí, y así el devtools de TanStack Query la nombra.
export const invoicingKeys = {
  all: ['invoicing'] as const,
  issue: (documentId: string) => [...invoicingKeys.all, 'issue', documentId] as const,
  adjust: (orderId: string) => [...invoicingKeys.all, 'adjust', orderId] as const,
};

// Los copys viven juntos porque todos dicen la misma cosa con distintas palabras —«aún no
// está» no es «falló» y no es «no lo vuelvas a intentar»— y repartirlos por componente
// hace que uno se desalinee del resto.

/** Panel: pedido sin ninguna fila de `electronic_documents`. */
export const NO_DOCUMENTS_TITLE = 'Sin comprobante';

// Nombra las dos razones reales y no una sola: un pedido sin pagar todavía no encola
// nada, y uno anterior a la migración `0010` no tiene documento del comprador y no se
// puede facturar (AC8).
export const NO_DOCUMENTS_MESSAGE =
  'Este pedido no tiene comprobante en cola. Solo se encola al confirmarse el pago, y un pedido anterior a la facturación electrónica no lleva los datos fiscales del comprador.';

/** Panel: qué significa `pending` ahora que nada emite solo (D-8). */
export const DOCUMENT_PENDING_HINT =
  'El comprobante está en cola con su serie y su número ya reservados. Nada lo emite solo: se emite desde aquí.';

/** Toast y aviso del fallo transitorio (§6.7). */
export const TRANSIENT_FAILURE_MESSAGE =
  'No se pudo contactar con el proveedor. Vuelve a intentarlo.';

/** Aviso del rechazo permanente: volver a pulsar sin corregir el dato no lo arregla (AC12). */
export const PERMANENT_FAILURE_HINT =
  'SUNAT rechazó el comprobante. Corrige el dato antes de volver a emitir: volver a pulsar tal cual gastará otro intento sin cambiar el resultado.';

// El correlativo ya está quemado en la fila, así que corregir es reemitir **esta misma**
// fila y no crear otra: crear otra dejaría un hueco en la numeración (§10).
export const PERMANENT_FAILURE_SERIES_NOTE =
  'La serie y el número de este comprobante se conservan: cuando el dato esté corregido, se reemite esta misma fila.';

export const ISSUE_BUTTON_LABEL = 'Emitir comprobante';

export const ISSUE_SUCCESS_MESSAGE = 'Comprobante emitido';

// «Mis compras». El comprobante fiscal y el recibo de Stripe son dos cosas distintas y se
// conservan las dos (D-14): el primero es el documento ante SUNAT, el segundo la
// constancia del cargo con el medio de pago, que es lo que el cliente busca al reclamar al
// banco.
export const CUSTOMER_DOCUMENT_TITLE = 'Comprobante electrónico';

export const CUSTOMER_DOCUMENT_ISSUING =
  'Tu comprobante se está emitiendo. Mientras tanto, el recibo de Stripe te sirve como constancia del cargo.';

export const CUSTOMER_DOCUMENT_NONE =
  'Este pedido no tiene comprobante electrónico: solo se emite cuando el pago queda confirmado.';

export const CUSTOMER_DOCUMENT_LINK_LABEL = 'Ver el PDF del comprobante';

// ---------------------------------------------------------------------------
// Mensajes de `POST /api/admin/invoicing/documents/[id]/issue`
// ---------------------------------------------------------------------------

export const INVALID_DOCUMENT_ID_MESSAGE = 'El identificador del comprobante no es válido';

// 404: quien llega aquí tiene `invoicing.issue` sobre todos los comprobantes, así que no
// hay nada que ocultar y el mensaje puede decir la verdad literal.
export const DOCUMENT_NOT_FOUND_MESSAGE = 'Ese comprobante no existe.';

// 409 y no 400: el cuerpo es válido —no hay cuerpo— y lo que está en conflicto es el
// estado del recurso, igual que al cancelar un pedido que ya no está `pending` (spec 014,
// D-3). Nombra el estado actual para que el administrador sepa qué pasó (AC19).
export const documentNotIssuableMessage = (statusLabel: string) =>
  `Solo se puede emitir un comprobante pendiente o fallido, y este está «${statusLabel}».`;

export const ISSUE_FAILED_FALLBACK_MESSAGE = 'No se pudo emitir el comprobante';

// ---------------------------------------------------------------------------
// Ajuste del pedido (spec 023). Los copys viven juntos por lo mismo que los de arriba:
// todos describen el mismo hecho con distintas palabras —«se devolvió» no es «se
// documentó» y no es «se emitió»— y repartirlos por componente desalinea uno del resto.
// ---------------------------------------------------------------------------

export const ADJUST_ORDER_BUTTON_LABEL = 'Ajustar pedido';

export const ADJUST_ORDER_DIALOG_TITLE = 'Ajustar pedido';

export const ADJUST_ORDER_DIALOG_DESCRIPTION =
  'Devuelve el importe por Stripe y registra el documento de corrección que le corresponde ante SUNAT.';

/**
 * Etiqueta y explicación de cada intención. Dos textos y no uno: el rótulo entra en el
 * `RadioGroup` y la explicación dice **qué va a pasar**, que es lo que evita elegir
 * «anulación total» creyendo que se devuelve solo una parte.
 *
 * Ninguna nombra el mecanismo SUNAT: quien decide si sale nota de crédito o comunicación
 * de baja es el servidor (D-3), y prometerlo aquí sería mentir el día que la regla cambie.
 */
export const ADJUSTMENT_INTENT_OPTIONS = [
  {
    value: 'anulacion_total',
    label: 'Anular el pedido entero',
    description: 'Devuelve todo el saldo que quede sin reembolsar y anula el comprobante.',
  },
  {
    value: 'devolucion_parcial',
    label: 'Devolver una parte',
    description: 'Devuelve el importe que indiques. El comprobante original sigue vigente.',
  },
  {
    value: 'correccion_comprador',
    label: 'Corregir los datos del comprador',
    description:
      'No mueve dinero: anula el comprobante y encola uno nuevo con el documento corregido.',
  },
  {
    value: 'cargo_adicional',
    label: 'Documentar un cargo adicional',
    description: 'Registra una nota de débito. No cobra nada al cliente.',
  },
] as const;

/** Aviso obligatorio al confirmar: el dinero sale ya, el documento no (AC22, AC23). */
export const ADJUSTMENT_PENDING_ISSUE_WARNING =
  'El documento de corrección queda pendiente de emisión: nada lo emite solo. Emítelo desde este mismo panel en cuanto confirmes, porque el dinero ya habrá salido de Stripe.';

/** La nota de débito no cobra: hay que decirlo donde se decide (D-8). */
export const DEBIT_NOTE_NO_CHARGE_NOTE =
  'La nota de débito documenta un importe mayor; no genera ningún cobro al cliente. Si hay que cobrarlo, se acuerda aparte.';

/** El reembolso no repone mercadería (D-9). */
export const ADJUSTMENT_NO_STOCK_NOTE =
  'Devolver el dinero no repone el stock: la devolución física se registra aparte, como nota de ingreso por devolución.';

export const ADJUSTMENT_REASON_LABEL = 'Motivo del documento';

export const ADJUSTMENT_AMOUNT_LABEL = 'Importe a devolver (S/)';

export const DEBIT_NOTE_AMOUNT_LABEL = 'Importe del cargo (S/)';

export const ADJUSTMENT_CONFIRM_LABEL = 'Confirmar ajuste';

export const ADJUSTMENT_SUCCESS_MESSAGE = 'Ajuste registrado';

export const REFUNDED_AMOUNT_LABEL = 'Reembolsado';

export const REFUNDABLE_AMOUNT_LABEL = 'Saldo devolvible';

// ---------------------------------------------------------------------------
// Mensajes de `POST /api/admin/orders/[id]/adjust`
// ---------------------------------------------------------------------------

export const INVALID_ADJUSTMENT_MESSAGE = 'Ajuste inválido';

export const ADJUST_FAILED_FALLBACK_MESSAGE = 'No se pudo ajustar el pedido';

// 409 y no 400: el cuerpo es válido y lo que está en conflicto es el estado del recurso,
// igual que al cancelar un pedido que ya no está `pending` (spec 014, D-3). Nombra el
// estado actual para que el administrador sepa qué pasó (AC4).
export const orderNotAdjustableMessage = (statusLabel: string) =>
  `Solo se puede ajustar un pedido pagado, y este está «${statusLabel}».`;

// 409 (AC5). Dirige a la acción que sí está disponible en la misma pantalla en vez de
// dejar al administrador con un «no se pudo».
export const NO_ISSUED_ORIGINAL_MESSAGE =
  'Este pedido todavía no tiene un comprobante emitido ante SUNAT, así que no hay nada que corregir. Emite primero el comprobante desde este mismo panel.';

// 400 y no 409 (§6.1): el recurso no está en conflicto, el importe enviado es incorrecto.
// Lleva el saldo dentro porque es el dato que permite corregirlo sin cerrar el diálogo.
export const refundExceedsBalanceMessage = (refundableLabel: string) =>
  `El importe supera el saldo devolvible de este pedido, que es ${refundableLabel}.`;

// 409 (AC6 con saldo cero): no hay nada que devolver y llamar a Stripe por cero sería un
// rechazo del proveedor con un mensaje que no explica nada.
export const NOTHING_LEFT_TO_REFUND_MESSAGE =
  'Este pedido ya está reembolsado por completo: no queda saldo que devolver.';

// 409 (AC16, D-7). Explica el porqué, porque la regla no es evidente: con una devolución
// parcial aplicada, el comprobante reemitido tendría que ser por el neto, y ese neto no
// coincide con ninguna línea del pedido.
export const BUYER_CORRECTION_NEEDS_CLEAN_ORDER_MESSAGE =
  'No se pueden corregir los datos del comprador de un pedido con devoluciones: el comprobante nuevo tendría que emitirse por el neto, y ese importe no coincide con ninguna línea del pedido. Anula el pedido entero y vuelve a facturarlo.';

// 409 (AC9): dos administradores ajustando el mismo pedido a la vez. El `UPDATE`
// condicional lo detecta en el motor, y la clave de idempotencia ya garantizó que Stripe
// creó **un** refund y no dos (D-4, D-5).
export const CONCURRENT_ADJUSTMENT_MESSAGE =
  'Otro ajuste sobre este pedido se registró mientras confirmabas el tuyo. Vuelve a abrir el pedido para ver su estado actual antes de reintentar.';

// 502 (AC11). El texto del proveedor se cita dentro: Stripe rechaza el reembolso de algunos
// métodos de pago de notificación diferida y de importes por debajo de su mínimo, y sin su
// mensaje el administrador no sabe cuál de los dos le pasó (§10).
export const refundRejectedMessage = (providerMessage: string) =>
  `Stripe rechazó el reembolso: ${providerMessage}`;

export const REFUND_UNAVAILABLE_MESSAGE =
  'No se pudo contactar con Stripe para devolver el importe. Vuelve a intentarlo: si el reembolso llegó a crearse, el reintento reutiliza el mismo y no devuelve el dinero dos veces.';

// El pedido existe pero no tiene con qué reembolsar: sin `payment_intent` no hay cargo que
// devolver. Es un pedido anterior al webhook o uno cuya sesión nunca llegó a cobrar.
export const NO_PAYMENT_INTENT_MESSAGE =
  'Este pedido no tiene ningún cobro de Stripe asociado, así que no hay nada que devolver.';
