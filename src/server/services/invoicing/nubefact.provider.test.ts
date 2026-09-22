import { afterEach, describe, expect, it, vi } from 'vitest';

// `nubefact.provider.ts` importa la configuración del emisor, y ese módulo lleva
// `server-only`, que revienta fuera del bundler de Next. Las funciones de mapeo bajo prueba
// no leen la configuración —solo la usa `NubefactProvider.issue()`, que no se ejercita
// aquí—, así que se sustituye por un doble en vez de exigir el token real.
vi.mock('@/lib/invoicing-config', () => ({
  invoicingConfig: {
    company: { ruc: '20123456786', legalName: 'ECOMMERCE TECH SAC', address: 'Av. Ejemplo 123' },
    nubefact: { apiUrl: 'https://api.nubefact.test/ruta', apiToken: 'token-de-prueba' },
  },
  INVOICING_REQUEST_TIMEOUT_MS: 20_000,
}));

import { splitIgv } from '@/modules/finance/lib/igv';

import {
  InvoicingProviderError,
  type IssueComprobanteInput,
  type IssueVoidInput,
  type ProviderTrace,
} from './provider';
import {
  isPermanentFailure,
  NubefactProvider,
  toErrorMessage,
  toNubefactItems,
  toNubefactPayload,
} from './nubefact.provider';

const EMPTY_TRACE: ProviderTrace = {
  acceptedBySunat: null,
  sunatDescription: null,
  sunatNote: null,
  hash: null,
  errors: [],
  httpStatus: null,
  permanent: false,
};

const LAPTOP = {
  description: 'Laptop Lenovo IdeaPad 3 15"',
  quantity: 1,
  unitPriceCents: 219_900,
  totalCents: 219_900,
};

// La línea de envío que el service añade cuando `orders.shipping_cents > 0` (D-16): el
// total del comprobante es `amount_total_cents`, que incluye el envío, y un documento cuyas
// líneas no suman su total lo rechaza SUNAT.
const SHIPPING = {
  description: 'Envío estándar',
  quantity: 1,
  unitPriceCents: 1_500,
  totalCents: 1_500,
};

// La rama de comprobante de la unión (§6.6.2). La baja tiene su propio constructor abajo,
// porque no comparte un solo campo obligatorio con esta.
function buildInput(overrides: Partial<IssueComprobanteInput> = {}): IssueComprobanteInput {
  const lines = overrides.lines ?? [LAPTOP, SHIPPING];
  const amountCents =
    overrides.amountCents ?? lines.reduce((sum, line) => sum + line.totalCents, 0);
  const { baseCents, igvCents } = splitIgv(amountCents);

  return {
    kind: 'boleta',
    series: 'B001',
    number: 12,
    issueDate: '22-09-2026',
    buyer: { documentType: 'dni', documentNumber: '41281230', legalName: 'Ada Lovelace' },
    amountCents,
    baseCents,
    igvCents,
    lines,
    ...overrides,
  };
}

describe('toNubefactItems', () => {
  it('emits one item per line, in the order the document received them', () => {
    const items = toNubefactItems([LAPTOP, SHIPPING], splitIgv(221_400).baseCents);

    expect(items).toHaveLength(2);
    expect(items[0].descripcion).toBe(LAPTOP.description);
    expect(items[1].descripcion).toBe(SHIPPING.description);
  });

  it('sends the amounts in soles with decimals, never in cents (§6.6.1)', () => {
    const [laptop] = toNubefactItems([LAPTOP], splitIgv(219_900).baseCents);

    expect(laptop.total).toBe(2199);
    expect(laptop.precio_unitario).toBe(2199);
    expect(laptop.subtotal).toBe(1863.56);
    expect(laptop.igv).toBe(335.44);
  });

  it('makes the item subtotals add up to the document base, exactly', () => {
    const { baseCents } = splitIgv(221_400);
    const items = toNubefactItems([LAPTOP, SHIPPING], baseCents);

    const sum = items.reduce((total, item) => total + item.subtotal, 0);
    expect(Number(sum.toFixed(2))).toBe(Number((baseCents / 100).toFixed(2)));
  });

  it('absorbs the rounding residual in the last line instead of leaving a cent loose', () => {
    // Dos líneas de S/ 1,00: cada una redondea su base a 85 céntimos (170 en total),
    // mientras que la base del documento de S/ 2,00 es 169. El céntimo sobrante se cuadra
    // en la última línea, porque un comprobante cuyas líneas no suman su total lo rechaza
    // SUNAT.
    const line = { description: 'Accesorio', quantity: 1, unitPriceCents: 100, totalCents: 100 };
    const { baseCents } = splitIgv(200);
    const items = toNubefactItems([line, { ...line }], baseCents);

    expect(items[0].subtotal).toBe(0.85);
    expect(items[1].subtotal).toBe(0.84);
    expect(items[0].igv + items[1].igv).toBeCloseTo(0.31, 2);
  });

  it('keeps every item total equal to its own line, residual or not', () => {
    const line = { description: 'Accesorio', quantity: 1, unitPriceCents: 100, totalCents: 100 };
    const items = toNubefactItems([line, { ...line }], splitIgv(200).baseCents);

    for (const item of items) expect(item.total).toBe(1);
  });

  it('divides the unit value over the quantity with enough precision to add back up', () => {
    const line = {
      description: 'Teclado',
      quantity: 3,
      unitPriceCents: 45_900,
      totalCents: 137_700,
    };
    const { baseCents } = splitIgv(137_700);
    const [item] = toNubefactItems([line], baseCents);

    expect(Number((item.valor_unitario * 3).toFixed(2))).toBe(Number((baseCents / 100).toFixed(2)));
  });

  // El catálogo ya no admite `priceCents: 0` (spec 022, D-22), pero las líneas salen del
  // snapshot histórico de `order_items`, así que una de importe cero sigue llegando desde un
  // pedido anterior a esa regla. Sin esta rama, `splitIgv()` lanzaba un `RangeError` —que no es un
  // `InvoicingProviderError`— y el fallo se clasificaba como transitorio: el correlativo ya
  // asignado quedaba quemado reintentando algo que no cambia solo.
  it('resolves a zero-amount line as base 0 and IGV 0 instead of throwing', () => {
    const free = { description: 'Obsequio', quantity: 1, unitPriceCents: 0, totalCents: 0 };
    const { baseCents } = splitIgv(219_900);

    const items = toNubefactItems([LAPTOP, free], baseCents);

    expect(items[1].subtotal).toBe(0);
    expect(items[1].igv).toBe(0);
    expect(items[1].total).toBe(0);
    expect(items[1].valor_unitario).toBe(0);
  });

  it('never loads the rounding residual onto a line that charges nothing', () => {
    const line = { description: 'Accesorio', quantity: 1, unitPriceCents: 100, totalCents: 100 };
    const free = { description: 'Obsequio', quantity: 1, unitPriceCents: 0, totalCents: 0 };
    const { baseCents } = splitIgv(200);

    const items = toNubefactItems([line, { ...line }, free], baseCents);

    // El céntimo sobrante cae en la última línea **que cobra algo**, no en la gratuita, que
    // sigue cuadrando consigo misma.
    expect(items[1].subtotal).toBe(0.84);
    expect(items[2].subtotal).toBe(0);
    const sum = items.reduce((total, item) => total + item.subtotal, 0);
    expect(Number(sum.toFixed(2))).toBe(Number((baseCents / 100).toFixed(2)));
  });

  it('marks every line as taxed at the general regime, the declared assumption of §6.4', () => {
    for (const item of toNubefactItems([LAPTOP, SHIPPING], splitIgv(221_400).baseCents)) {
      expect(item.tipo_de_igv).toBe(1);
      expect(item.unidad_de_medida).toBe('NIU');
      expect(item.descuento).toBe(0);
    }
  });
});

describe('toNubefactPayload', () => {
  it('maps a boleta with DNI onto catalogue codes 2 and 1 (§6.6.1)', () => {
    const payload = toNubefactPayload(buildInput());

    expect(payload.operacion).toBe('generar_comprobante');
    expect(payload.tipo_de_comprobante).toBe(2);
    expect(payload.cliente_tipo_de_documento).toBe(1);
    expect(payload.cliente_numero_de_documento).toBe('41281230');
  });

  it('maps a factura with RUC onto catalogue codes 1 and 6 (§6.6.1)', () => {
    const payload = toNubefactPayload(
      buildInput({
        kind: 'factura',
        series: 'F001',
        buyer: {
          documentType: 'ruc',
          documentNumber: '20131312955',
          legalName: 'Empresa Ejemplo SAC',
        },
      }),
    );

    expect(payload.tipo_de_comprobante).toBe(1);
    expect(payload.cliente_tipo_de_documento).toBe(6);
    expect(payload.cliente_denominacion).toBe('Empresa Ejemplo SAC');
  });

  it('sends the series and number it was given, which is what makes a retry safe (AC13)', () => {
    const payload = toNubefactPayload(buildInput({ series: 'F001', number: 7 }));

    expect(payload.serie).toBe('F001');
    expect(payload.numero).toBe(7);
  });

  it('sends the date already formatted as DD-MM-YYYY', () => {
    expect(toNubefactPayload(buildInput()).fecha_de_emision).toBe('22-09-2026');
  });

  it('sends the totals of the row in soles, so the comprobante matches the database', () => {
    const payload = toNubefactPayload(buildInput());

    expect(payload.total).toBe(2214);
    expect(payload.total_gravada).toBe(1876.27);
    expect(payload.total_igv).toBe(337.73);
    expect(payload.porcentaje_de_igv).toBe(18);
  });

  it('makes the comprobante total equal base plus IGV, which AC26 asserts', () => {
    const payload = toNubefactPayload(buildInput());
    const total = Number(
      ((payload.total_gravada as number) + (payload.total_igv as number)).toFixed(2),
    );

    expect(total).toBe(payload.total);
  });

  it('asks the provider to forward the document to SUNAT, never leaving it parked', () => {
    expect(toNubefactPayload(buildInput()).enviar_automaticamente_a_la_sunat).toBe(true);
  });

  it('does not ask the provider to email the buyer: that is not its job here (§11)', () => {
    expect(toNubefactPayload(buildInput()).enviar_automaticamente_al_cliente).toBe(false);
  });

  it('never sends the shipping address as the buyer fiscal address (§6.6.1)', () => {
    const payload = toNubefactPayload(buildInput());

    expect(payload).not.toHaveProperty('cliente_direccion');
    expect(payload).not.toHaveProperty('cliente_email');
  });

  it('carries no reference to a modified document in an original comprobante', () => {
    const payload = toNubefactPayload(buildInput());

    expect(payload).not.toHaveProperty('documento_que_se_modifica_tipo');
  });

  it('carries the modified document when the spec 023 sends a related one', () => {
    const payload = toNubefactPayload(
      buildInput({
        kind: 'nota_credito',
        related: { kind: 'boleta', series: 'B001', number: 12, reasonCode: '01' },
      }),
    );

    expect(payload.tipo_de_comprobante).toBe(3);
    expect(payload.documento_que_se_modifica_tipo).toBe(2);
    expect(payload.documento_que_se_modifica_serie).toBe('B001');
    expect(payload.documento_que_se_modifica_numero).toBe(12);
    expect(payload.tipo_de_nota_de_credito).toBe(1);
  });

  it('maps a debit note onto comprobante type 4 with its own reason field', () => {
    const payload = toNubefactPayload(
      buildInput({
        kind: 'nota_debito',
        related: { kind: 'factura', series: 'F001', number: 7, reasonCode: '02' },
      }),
    );

    expect(payload.tipo_de_comprobante).toBe(4);
    expect(payload.documento_que_se_modifica_tipo).toBe(1);
    expect(payload.tipo_de_nota_de_debito).toBe(2);
    // Los dos catálogos son distintos: una nota de débito nunca manda `tipo_de_nota_de_credito`.
    expect(payload).not.toHaveProperty('tipo_de_nota_de_credito');
  });

  it('keeps sending the lines on a credit note: the note describes the same sale', () => {
    const payload = toNubefactPayload(
      buildInput({
        kind: 'nota_credito',
        related: { kind: 'boleta', series: 'B001', number: 12, reasonCode: '06' },
      }),
    );

    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.operacion).toBe('generar_comprobante');
  });

  it('never carries the token, not even by accident', () => {
    expect(JSON.stringify(toNubefactPayload(buildInput()))).not.toContain('token-de-prueba');
  });
});

// La baja está construida de punta a punta aunque hoy no se elija, porque
// `canVoidWithCommunication()` devuelve `false` (spec 023, D-12). Activarla es editar esa
// función: este mapeo ya existe y está probado.
describe('toNubefactPayload — comunicación de baja', () => {
  function buildVoidInput(overrides: Partial<IssueVoidInput> = {}): IssueVoidInput {
    return {
      kind: 'comunicacion_baja',
      issueDate: '22-09-2026',
      buyer: { documentType: 'dni', documentNumber: '41281230', legalName: 'Ada Lovelace' },
      related: { kind: 'boleta', series: 'B001', number: 12, reasonCode: '01' },
      ...overrides,
    };
  }

  it('uses its own operation, not generar_comprobante: it is not a new document', () => {
    expect(toNubefactPayload(buildVoidInput()).operacion).toBe('generar_anulacion');
  });

  it('sends the type, series and number of the document it voids', () => {
    const payload = toNubefactPayload(buildVoidInput());

    expect(payload.tipo_de_comprobante).toBe(2);
    expect(payload.serie).toBe('B001');
    expect(payload.numero).toBe(12);
  });

  it('takes the type from the voided factura when that is what it voids', () => {
    const payload = toNubefactPayload(
      buildVoidInput({ related: { kind: 'factura', series: 'F001', number: 7, reasonCode: '01' } }),
    );

    expect(payload.tipo_de_comprobante).toBe(1);
  });

  it('sends the reason as the catalog label, which is what a person reads', () => {
    expect(toNubefactPayload(buildVoidInput()).motivo).toBe('Anulación de la operación');
  });

  it('falls back to the bare code rather than leaving the void unjustified', () => {
    const payload = toNubefactPayload(
      buildVoidInput({ related: { kind: 'boleta', series: 'B001', number: 12, reasonCode: '99' } }),
    );

    expect(payload.motivo).toBe('99');
  });

  // Los `CHECK electronic_documents_void_has_no_series` y `_void_has_no_amount` dicen lo
  // mismo en la base: una baja no lleva importes, ni líneas, ni correlativo propio.
  it('carries no totals and no items at all', () => {
    const payload = toNubefactPayload(buildVoidInput());

    expect(payload).not.toHaveProperty('items');
    expect(payload).not.toHaveProperty('total');
    expect(payload).not.toHaveProperty('total_gravada');
    expect(payload).not.toHaveProperty('total_igv');
  });

  it('never sends the placeholder code 0 of the comunicación de baja', () => {
    expect(toNubefactPayload(buildVoidInput()).tipo_de_comprobante).not.toBe(0);
  });
});

describe('isPermanentFailure', () => {
  it('classifies a body with errors as permanent even on HTTP 200 (§6.6.1, diferencia 2)', () => {
    expect(
      isPermanentFailure({ ...EMPTY_TRACE, errors: ['El RUC no existe'], httpStatus: 200 }),
    ).toBe(true);
  });

  it('classifies a 5xx with no errors as transient: that is what retrying is for (AC11)', () => {
    expect(isPermanentFailure({ ...EMPTY_TRACE, httpStatus: 502 })).toBe(false);
    expect(isPermanentFailure({ ...EMPTY_TRACE, httpStatus: 500 })).toBe(false);
  });

  it('classifies a network failure, with no status at all, as transient (AC11)', () => {
    expect(isPermanentFailure({ ...EMPTY_TRACE, httpStatus: null })).toBe(false);
  });

  it('classifies a 4xx with no errors as permanent: a bad token does not fix itself', () => {
    expect(isPermanentFailure({ ...EMPTY_TRACE, httpStatus: 401 })).toBe(true);
    expect(isPermanentFailure({ ...EMPTY_TRACE, httpStatus: 422 })).toBe(true);
  });
});

describe('toErrorMessage', () => {
  it('quotes the provider reasons, which is the only way to know what to correct (AC12)', () => {
    const message = toErrorMessage({
      ...EMPTY_TRACE,
      errors: ['El RUC no existe', 'Serie no habilitada'],
    });

    expect(message).toContain('El RUC no existe');
    expect(message).toContain('Serie no habilitada');
  });

  it('falls back to the SUNAT description when there are no errors to quote', () => {
    expect(
      toErrorMessage({ ...EMPTY_TRACE, sunatDescription: 'El comprobante fue rechazado' }),
    ).toBe('El comprobante fue rechazado');
  });

  it('says something useful when the provider said nothing at all', () => {
    expect(toErrorMessage(EMPTY_TRACE)).toContain('Vuelve a intentarlo');
  });
});

// La traza es lo que se persiste en `provider_response` y de donde la fila saca
// `permanentFailure`, así que la clasificación tiene que **viajar dentro de ella**. Los dos
// casos de abajo son justo los que no traen ningún `errors` que releer después.
describe('NubefactProvider.issue', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubResponse(body: string, status: number) {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status })),
    );
  }

  async function issueAndCatch(): Promise<InvoicingProviderError> {
    try {
      await new NubefactProvider().issue(buildInput());
    } catch (error) {
      if (error instanceof InvoicingProviderError) return error;
      throw error;
    }

    throw new Error('La emisión no falló, y esta prueba necesita que falle');
  }

  it('marks a 4xx with no body as permanent inside the trace, not only in the error', async () => {
    stubResponse('', 401);

    const error = await issueAndCatch();

    expect(error.permanent).toBe(true);
    expect(error.trace.errors).toEqual([]);
    expect(error.trace.permanent).toBe(true);
  });

  it('marks a SUNAT rejection with no errors as permanent inside the trace', async () => {
    stubResponse(JSON.stringify({ aceptada_por_sunat: false, sunat_description: 'Rechazada' }), 200);

    const error = await issueAndCatch();

    expect(error.permanent).toBe(true);
    expect(error.trace.errors).toEqual([]);
    expect(error.trace.permanent).toBe(true);
  });

  it('leaves a 5xx marked transient in the trace: retrying is exactly the right move', async () => {
    stubResponse('', 503);

    const error = await issueAndCatch();

    expect(error.permanent).toBe(false);
    expect(error.trace.permanent).toBe(false);
  });

  it('returns the links of an accepted document with a trace that reports no failure', async () => {
    stubResponse(
      JSON.stringify({
        aceptada_por_sunat: true,
        enlace_del_pdf: 'https://nubefact.test/documento.pdf',
        enlace_del_xml: 'https://nubefact.test/documento.xml',
        enlace_del_cdr: 'https://nubefact.test/documento.cdr.zip',
      }),
      200,
    );

    const result = await new NubefactProvider().issue(buildInput());

    expect(result.pdfUrl).toBe('https://nubefact.test/documento.pdf');
    expect(result.trace.permanent).toBe(false);
  });
});
