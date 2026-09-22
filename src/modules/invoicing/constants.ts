// Las etiquetas viven en `src/lib/electronic-documents.ts` —el catálogo puro— y se
// reexportan desde aquí para que los componentes del módulo tengan una sola superficie de
// import. Reexportar y no volver a escribirlas: una segunda copia sería la que se
// desalinea el día que se renombre un estado.
export {
  ELECTRONIC_DOCUMENT_KIND_LABELS,
  ELECTRONIC_DOCUMENT_STATUS_LABELS,
} from '@/lib/electronic-documents';

// El documento se lee siempre dentro del pedido que lo produjo —el sheet del panel y el
// diálogo del historial—, así que no hay lista propia que cachear: la mutación invalida
// las claves del pedido. Esta clave existe para lo único que es del documento y no del
// pedido, la mutación en sí, y así el devtools de TanStack Query la nombra.
export const invoicingKeys = {
  all: ['invoicing'] as const,
  issue: (documentId: string) => [...invoicingKeys.all, 'issue', documentId] as const,
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
