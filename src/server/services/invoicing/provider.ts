import type { ElectronicDocumentKind } from '@/lib/electronic-documents';

// La frontera con el OSE/PSE. Ningún nombre de campo de Nubefact aparece fuera de
// `nubefact.provider.ts`: esta interfaz habla en céntimos y en `kind` del dominio, así
// que cambiar de proveedor es escribir otra clase que la implemente y no reescribir el
// service, el repositorio ni la UI (D-1).
//
// Sin `import 'server-only'`: el schema de Drizzle tipa `provider_response` con
// `ProviderTrace` y ese import de tipo se borra en compilación, pero un `server-only`
// aquí ataría el módulo a un entorno que los tests puros no montan. El secreto no vive
// en este archivo sino en `src/lib/invoicing-config.ts`, que sí lo lleva.

/**
 * Una línea del comprobante. `unitPriceCents` es el precio **con IGV incluido**, que es
 * como se muestra el catálogo al público en Perú y como se congeló en `order_items`. El
 * desglose por línea lo deriva el proveedor: es un detalle de su payload, no del dominio.
 */
export type IssueDocumentLine = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  /** `quantity × unitPriceCents`. Viaja calculado para que el proveedor no reimplemente la multiplicación. */
  totalCents: number;
};

export type IssueDocumentBuyer = {
  documentType: 'dni' | 'ruc';
  documentNumber: string;
  /** Razón social con RUC; nombre del comprador con DNI. Nunca vacío: SUNAT exige denominación. */
  legalName: string;
};

export type IssueDocumentInput = {
  kind: ElectronicDocumentKind;
  series: string;
  number: number;
  /** `DD-MM-YYYY` en la zona del emisor. */
  issueDate: string;
  buyer: IssueDocumentBuyer;
  amountCents: number;
  baseCents: number;
  igvCents: number;
  lines: IssueDocumentLine[];
  /** Solo en correcciones (spec 023): el documento que se modifica y el motivo. */
  related?: {
    kind: ElectronicDocumentKind;
    series: string;
    number: number;
    reasonCode: string;
  };
};

/**
 * Proyección **positiva** de la respuesta, con el mismo criterio que las proyecciones del
 * repositorio: se enumera lo que se guarda, no lo que se oculta. La respuesta de Nubefact
 * incluye el eco del cuerpo enviado, y ese eco lleva el documento del comprador; volcarla
 * entera metería PII en una columna que nadie pensó como PII (AC15). El token no aparece
 * en la respuesta, pero tampoco en ningún log.
 */
export type ProviderTrace = {
  acceptedBySunat: boolean | null;
  sunatDescription: string | null;
  sunatNote: string | null;
  hash: string | null;
  errors: string[];
  httpStatus: number | null;
  /**
   * La clasificación del fallo **tal como la hizo el proveedor**, no una relectura de
   * `errors`. Son dos casos reales en los que el proveedor marca permanente sin devolver
   * ningún `errors`: un `4xx` sin cuerpo —token o URL mal— y un `aceptada_por_sunat: false`,
   * que es un rechazo de SUNAT. Derivarla después de `errors.length > 0` publicaría
   * `permanentFailure: false` en los dos e invitaría a un reintento que nunca va a
   * funcionar (§6.7, AC12).
   *
   * `false` en la traza de una respuesta aceptada: no hubo fallo que clasificar.
   */
  permanent: boolean;
};

export type IssueDocumentResult = {
  pdfUrl: string | null;
  xmlUrl: string | null;
  cdrUrl: string | null;
  issuedAt: Date;
  trace: ProviderTrace;
};

export interface InvoicingProvider {
  issue(input: IssueDocumentInput): Promise<IssueDocumentResult>;
}

/**
 * Fallo del proveedor, con la distinción que la UI necesita (§6.7):
 * `permanent: true` = el documento nunca va a ser aceptado tal cual está (RUC inválido,
 * serie no habilitada, importe incoherente), así que volver a pulsar sin corregir el dato
 * solo gasta cuota. `permanent: false` = red, timeout o 5xx: exactamente lo que sí tiene
 * sentido volver a intentar.
 */
export class InvoicingProviderError extends Error {
  readonly permanent: boolean;
  readonly trace: ProviderTrace;

  constructor(
    message: string,
    options: { permanent: boolean; trace: ProviderTrace; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = 'InvoicingProviderError';
    this.permanent = options.permanent;
    // La clasificación se **estampa** en la traza aquí y no en cada `throw`: la traza es lo
    // que se persiste en `provider_response` y lo que la fila publica como
    // `permanentFailure`, así que el error y la fila no pueden decir cosas distintas.
    this.trace = { ...options.trace, permanent: options.permanent };
  }
}

const EMPTY_TRACE: ProviderTrace = {
  acceptedBySunat: null,
  sunatDescription: null,
  sunatNote: null,
  hash: null,
  errors: [],
  httpStatus: null,
  permanent: false,
};

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Nubefact devuelve `errors` como **una cadena**, no como un array (§6.6.1, diferencia 1).
// Se normaliza en vez de castear: la forma del dominio es `string[]` —es la que la UI
// enumera y la que absorbe un proveedor futuro que sí mande varios— y un `as string[]`
// sobre una cadena la habría dejado pintándose carácter a carácter.
function readErrors(payload: Record<string, unknown>): string[] {
  const value = payload.errors;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? [] : [trimmed];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : JSON.stringify(entry)))
      .filter((entry) => entry !== '' && entry !== undefined);
  }

  return [];
}

/**
 * Traduce el cuerpo del proveedor a la proyección que se persiste. **Nunca** copia el
 * payload entero: se enumeran los campos que se guardan, así que un campo nuevo del
 * proveedor —incluido el eco del cuerpo enviado, que lleva el documento del comprador—
 * no puede colarse en la columna por el mero hecho de existir (AC15).
 *
 * `permanent` nace en `false` y lo escribe `InvoicingProviderError`: la regla que decide si
 * un fallo es permanente es del proveedor concreto —Nubefact devuelve rechazos con HTTP
 * `200`—, no de esta traducción.
 */
export function toProviderTrace(payload: unknown, httpStatus: number | null): ProviderTrace {
  if (typeof payload !== 'object' || payload === null) {
    return { ...EMPTY_TRACE, httpStatus };
  }

  const body = payload as Record<string, unknown>;
  const accepted = body.aceptada_por_sunat;

  return {
    acceptedBySunat: typeof accepted === 'boolean' ? accepted : null,
    sunatDescription: readString(body, 'sunat_description'),
    sunatNote: readString(body, 'sunat_note'),
    hash: readString(body, 'codigo_hash'),
    errors: readErrors(body),
    httpStatus,
    permanent: false,
  };
}
