import { INVOICING_REQUEST_TIMEOUT_MS, invoicingConfig } from '@/lib/invoicing-config';
import type { ElectronicDocumentKind } from '@/lib/electronic-documents';
import { splitIgv, IGV_RATE } from '@/modules/finance/lib/igv';

import {
  InvoicingProviderError,
  toProviderTrace,
  type InvoicingProvider,
  type IssueDocumentInput,
  type IssueDocumentLine,
  type IssueDocumentResult,
  type ProviderTrace,
} from './provider';

// **Único archivo del proyecto donde aparece un nombre de campo de Nubefact.** Es lo que
// hace que cambiar de OSE/PSE sea escribir otra clase que implemente `InvoicingProvider` y
// no reescribir el service, el repositorio ni la UI (D-1). El mapeo verificado contra la
// documentación vigente está en §6.6.1 del spec.

/** Catálogo 01 de SUNAT: tipo de comprobante. */
const COMPROBANTE_CODE: Record<ElectronicDocumentKind, number> = {
  factura: 1,
  boleta: 2,
  nota_credito: 3,
  nota_debito: 4,
  // La comunicación de baja no se genera con `generar_comprobante` sino con su propia
  // operación (spec 023). Nace aquí para que el `Record` sea total y añadir un `kind` rompa
  // el typecheck en vez de mandar `undefined` al proveedor.
  comunicacion_baja: 0,
};

/** Catálogo 06 de SUNAT: tipo de documento de identidad. */
const CLIENTE_DOCUMENTO_CODE = { dni: 1, ruc: 6 } as const;

const MONEDA_SOLES = 1;
const SUNAT_TRANSACTION_VENTA_INTERNA = 1;
const UNIDAD_DE_MEDIDA_UNIDAD = 'NIU';
const TIPO_IGV_GRAVADO_ONEROSO = 1;

// Los importes del dominio son enteros en céntimos y Nubefact los quiere en soles con
// decimales, así que la división por 100 vive aquí y solo aquí, en el borde del proveedor
// (§6.6.1, diferencia 3; AC27).
function toSoles(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

// El valor unitario sin IGV no cae en dos decimales exactos casi nunca —es el total de la
// línea dividido entre las unidades— y redondearlo a dos haría que el `subtotal` enviado no
// fuese `cantidad × valor_unitario`. Seis decimales es la precisión que SUNAT admite en el
// valor unitario.
function toUnitSoles(cents: number, quantity: number): number {
  return Number((cents / quantity / 100).toFixed(6));
}

type NubefactItem = {
  unidad_de_medida: string;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
  tipo_de_igv: number;
  igv: number;
  total: number;
  anticipo_regularizacion: boolean;
};

/**
 * Desglose de una línea. Una línea de importe **cero** no tiene nada que desglosar —base 0
 * e IGV 0— y no pasa por `splitIgv()`, que exige un entero positivo y lanzaría un
 * `RangeError`: ese error no es un `InvoicingProviderError`, así que el service lo tomaría
 * por un fallo transitorio y el correlativo ya asignado quedaría quemado reintentando algo
 * que no cambia solo. El catálogo ya no admite `priceCents: 0` (spec 022, D-22), pero las
 * líneas del comprobante salen de `order_items.price_cents_snapshot`, que es histórico: un
 * pedido anterior a esa regla sigue teniendo su línea a 0 y hay que saber emitirlo.
 */
function splitLine(totalCents: number): { baseCents: number; igvCents: number } {
  return totalCents === 0 ? { baseCents: 0, igvCents: 0 } : splitIgv(totalCents);
}

/**
 * Desglosa cada línea y **cuadra el residuo en la última que cobra algo**. Sin el ajuste, la
 * suma de las bases por línea puede separarse en uno o dos céntimos de la base del documento
 * —cada línea redondea por su cuenta— y un comprobante cuyas líneas no suman sus totales lo
 * rechaza SUNAT. El ajuste tiene que ir en alguna línea, y elegir siempre la misma hace el
 * resultado determinista y comprobable; se salta las de importe cero porque cargarles el
 * residuo les daría un valor de venta que su propio total contradice.
 *
 * `documentBaseCents` es el que ya está persistido en la fila y el que viaja como
 * `total_gravada`: se cuadra contra él, no contra un recálculo, para que la base del
 * comprobante y la de `electronic_documents` sean literalmente el mismo número.
 */
export function toNubefactItems(
  lines: IssueDocumentLine[],
  documentBaseCents: number,
): NubefactItem[] {
  const split = lines.map((line) => ({ line, ...splitLine(line.totalCents) }));

  const residual = documentBaseCents - split.reduce((sum, entry) => sum + entry.baseCents, 0);
  const last = split.findLast((entry) => entry.line.totalCents > 0);
  if (last) {
    last.baseCents += residual;
    last.igvCents -= residual;
  }

  return split.map(({ line, baseCents, igvCents }) => ({
    unidad_de_medida: UNIDAD_DE_MEDIDA_UNIDAD,
    descripcion: line.description,
    cantidad: line.quantity,
    valor_unitario: toUnitSoles(baseCents, line.quantity),
    precio_unitario: toSoles(line.unitPriceCents),
    descuento: 0,
    subtotal: toSoles(baseCents),
    tipo_de_igv: TIPO_IGV_GRAVADO_ONEROSO,
    igv: toSoles(igvCents),
    total: toSoles(line.totalCents),
    anticipo_regularizacion: false,
  }));
}

/**
 * Cuerpo de `generar_comprobante`. **No se envían `cliente_direccion` ni `cliente_email`**,
 * que son opcionales: la dirección de `orders.shipping_address` es de envío y no fiscal, y
 * mandarla como domicilio del cliente sería afirmar un dato que nadie validó (§6.6.1).
 */
export function toNubefactPayload(input: IssueDocumentInput): Record<string, unknown> {
  return {
    operacion: 'generar_comprobante',
    tipo_de_comprobante: COMPROBANTE_CODE[input.kind],
    serie: input.series,
    numero: input.number,
    sunat_transaction: SUNAT_TRANSACTION_VENTA_INTERNA,
    cliente_tipo_de_documento: CLIENTE_DOCUMENTO_CODE[input.buyer.documentType],
    cliente_numero_de_documento: input.buyer.documentNumber,
    cliente_denominacion: input.buyer.legalName,
    fecha_de_emision: input.issueDate,
    moneda: MONEDA_SOLES,
    porcentaje_de_igv: Number((IGV_RATE * 100).toFixed(2)),
    total_gravada: toSoles(input.baseCents),
    total_igv: toSoles(input.igvCents),
    total: toSoles(input.amountCents),
    detraccion: false,
    // Sin esto el documento se queda en Nubefact sin llegar a SUNAT, que es el fallo más
    // silencioso posible: la respuesta sería un éxito y el comprobante no existiría.
    enviar_automaticamente_a_la_sunat: true,
    // El correo lo manda la tienda cuando tenga proveedor de correo (§11), no el OSE.
    enviar_automaticamente_al_cliente: false,
    items: toNubefactItems(input.lines, input.baseCents),
    ...(input.related
      ? {
          documento_que_se_modifica_tipo: COMPROBANTE_CODE[input.related.kind],
          documento_que_se_modifica_serie: input.related.series,
          documento_que_se_modifica_numero: input.related.number,
          ...(input.kind === 'nota_credito'
            ? { tipo_de_nota_de_credito: Number(input.related.reasonCode) }
            : { tipo_de_nota_de_debito: Number(input.related.reasonCode) }),
        }
      : {}),
  };
}

const TRANSIENT_MESSAGE = 'No se pudo contactar con el proveedor. Vuelve a intentarlo.';

/**
 * **La clasificación no puede depender solo del status** (§6.6.1, diferencia 2): Nubefact
 * devuelve rechazos de validación con HTTP `200` y un `errors` en el cuerpo. La regla, por
 * orden:
 *
 * 1. Hay `errors` en el cuerpo ⇒ permanente: el proveedor sabe qué está mal y volver a
 *    pulsar sin corregirlo solo gasta cuota.
 * 2. Sin `errors` y con `5xx` o sin status ⇒ transitorio: el proveedor o la red fallaron.
 * 3. Sin `errors` y con `4xx` ⇒ permanente: el token, la URL o la forma del cuerpo están
 *    mal, y eso no se arregla esperando.
 */
export function isPermanentFailure(trace: ProviderTrace): boolean {
  if (trace.errors.length > 0) return true;
  if (trace.httpStatus === null) return false;
  return trace.httpStatus >= 400 && trace.httpStatus < 500;
}

// Mensaje que el panel pinta. Con `errors` se citan los motivos del proveedor, que es lo
// único que permite a la persona saber **qué dato** corregir; sin ellos, un texto genérico,
// porque «Internal Server Error» no le dice nada a quien mira la pantalla.
export function toErrorMessage(trace: ProviderTrace): string {
  if (trace.errors.length > 0) return `SUNAT rechazó el comprobante: ${trace.errors.join(' · ')}`;
  if (trace.sunatDescription) return trace.sunatDescription;
  return TRANSIENT_MESSAGE;
}

/**
 * Una respuesta `aceptada_por_sunat: false` **sin** `errors` es un rechazo de SUNAT, no un
 * fallo de red: el comprobante existe en Nubefact pero SUNAT no lo aceptó, y reintentarlo
 * tal cual dará el mismo resultado.
 */
function rejectedBySunat(trace: ProviderTrace): boolean {
  return trace.acceptedBySunat === false;
}

function readLink(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export class NubefactProvider implements InvoicingProvider {
  async issue(input: IssueDocumentInput): Promise<IssueDocumentResult> {
    let response: Response;
    let payload: unknown;

    try {
      response = await fetch(invoicingConfig.nubefact.apiUrl, {
        method: 'POST',
        headers: {
          // La forma exacta que exige Nubefact. La cabecera **nunca** se imprime en ningún
          // log: los `console.error` de abajo llevan la URL y el status, jamás esto (§10).
          Authorization: `Token token="${invoicingConfig.nubefact.apiToken}"`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toNubefactPayload(input)),
        // Acota la llamada para que un proveedor colgado salga como 502 con su mensaje y no
        // como una petición del administrador que nunca termina (§10).
        signal: AbortSignal.timeout(INVOICING_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Red, DNS o timeout: no hay cuerpo ni status que clasificar, y es exactamente el
      // caso que sí tiene sentido volver a intentar (AC11).
      console.error('NubefactProvider.issue', invoicingConfig.nubefact.apiUrl, error);
      throw new InvoicingProviderError(TRANSIENT_MESSAGE, {
        permanent: false,
        trace: toProviderTrace(null, null),
        cause: error,
      });
    }

    try {
      payload = await response.json();
    } catch {
      // Un cuerpo que no es JSON —una página de error del proxy, por ejemplo— no se puede
      // clasificar por su contenido, así que decide el status.
      payload = null;
    }

    const trace = toProviderTrace(payload, response.status);

    if (!response.ok || trace.errors.length > 0 || rejectedBySunat(trace)) {
      console.error('NubefactProvider.issue', invoicingConfig.nubefact.apiUrl, response.status);
      throw new InvoicingProviderError(toErrorMessage(trace), {
        permanent: isPermanentFailure(trace) || rejectedBySunat(trace),
        trace,
      });
    }

    const body = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<
      string,
      unknown
    >;

    return {
      pdfUrl: readLink(body, 'enlace_del_pdf'),
      xmlUrl: readLink(body, 'enlace_del_xml'),
      cdrUrl: readLink(body, 'enlace_del_cdr'),
      // El instante en que el proveedor aceptó. No se lee de la respuesta: Nubefact devuelve
      // la **fecha** de emisión que le enviamos, sin hora, y `issued_at` es un `timestamptz`
      // que #3 usa para agrupar el libro de ventas por período.
      issuedAt: new Date(),
      trace,
    };
  }
}
