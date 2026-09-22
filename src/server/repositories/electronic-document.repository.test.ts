import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import type { ProviderTrace } from '@/server/services/invoicing/provider';

import {
  buildAttemptIncrement,
  buildClaimableFilter,
  buildIssuedOriginalFilter,
  buildNotIssuedFilter,
  buildVoidableFilter,
  claimForIssue,
  create,
  markFailed,
  markIssued,
  markVoided,
  toRow,
} from './electronic-document.repository';

// El dialecto real compila el árbol a texto y parámetros, así que las aserciones miran el
// SQL que llegaría a Postgres en vez de la forma interna del objeto.
const dialect = new PgDialect();

const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

const EMPTY_TRACE: ProviderTrace = {
  acceptedBySunat: null,
  sunatDescription: null,
  sunatNote: null,
  hash: null,
  errors: [],
  httpStatus: null,
  permanent: false,
};

type RowSource = Parameters<typeof toRow>[0];

// Quien emite ve el enlace al PDF; el filtro de `orders.read` tiene sus propias pruebas más
// abajo, así que el resto del bloque mira la proyección con el PDF visible.
const WITH_PDF = { includePdfUrl: true } as const;

function buildDocument(overrides: Partial<RowSource> = {}): RowSource {
  return {
    id: DOCUMENT_ID,
    relatedDocumentId: null,
    reasonCode: null,
    kind: 'boleta',
    status: 'pending',
    series: 'B001',
    number: 12,
    amountCents: 11_800,
    pdfUrl: null,
    attemptCount: 0,
    issuedAt: null,
    lastError: null,
    providerResponse: null,
    ...overrides,
  };
}

describe('buildClaimableFilter', () => {
  it('claims by id and only from the two states a document can still be issued from', () => {
    const query = dialect.sqlToQuery(buildClaimableFilter(DOCUMENT_ID));

    expect(query.sql).toContain('"id"');
    expect(query.sql).toContain('"status"');
    expect(query.params).toEqual([DOCUMENT_ID, 'pending', 'failed']);
  });

  it('never claims an issued document: that is what makes the second admin get a 409 (AC14, AC19)', () => {
    expect(dialect.sqlToQuery(buildClaimableFilter(DOCUMENT_ID)).params).not.toContain('issued');
  });

  it('never claims a voided document either: the spec 023 voids it deliberately', () => {
    expect(dialect.sqlToQuery(buildClaimableFilter(DOCUMENT_ID)).params).not.toContain('voided');
  });

  it('sends the id as a parameter, never interpolated into the SQL text', () => {
    expect(dialect.sqlToQuery(buildClaimableFilter(DOCUMENT_ID)).sql).not.toContain(DOCUMENT_ID);
  });
});

describe('buildNotIssuedFilter', () => {
  it('guards the success UPDATE in the WHERE, not in a previous if', () => {
    const query = dialect.sqlToQuery(buildNotIssuedFilter(DOCUMENT_ID));

    expect(query.sql).toContain('<>');
    expect(query.params).toEqual([DOCUMENT_ID, 'issued']);
  });
});

describe('buildAttemptIncrement', () => {
  it('increments the column against itself, so two attempts never overwrite one count', () => {
    const query = dialect.sqlToQuery(buildAttemptIncrement());

    expect(query.sql).toContain('"attempt_count"');
    expect(query.sql).toContain('+ 1');
    expect(query.params).toEqual([]);
  });
});

describe('toRow', () => {
  it('publishes the label already formatted, so the UI never rebuilds the format', () => {
    expect(toRow(buildDocument(), WITH_PDF).label).toBe('B001-00000012');
  });

  it('turns issuedAt into an ISO string, because JSON does not carry a Date', () => {
    const issuedAt = new Date('2026-09-22T15:04:05.000Z');

    expect(toRow(buildDocument({ status: 'issued', issuedAt }), WITH_PDF).issuedAt).toBe(
      '2026-09-22T15:04:05.000Z',
    );
  });

  it('leaves issuedAt null while the document is not issued', () => {
    expect(toRow(buildDocument(), WITH_PDF).issuedAt).toBeNull();
  });

  it('never publishes provider_response, not even through an extra key (AC15, AC22)', () => {
    const row = toRow(
      buildDocument({
        status: 'issued',
        issuedAt: new Date(),
        providerResponse: { ...EMPTY_TRACE, hash: 'abc', sunatDescription: 'La Boleta...' },
      }),
      WITH_PDF,
    );

    expect(Object.keys(row).sort()).toEqual([
      'amountCents',
      'attemptCount',
      'id',
      'issuedAt',
      'kind',
      'label',
      'lastError',
      'number',
      'pdfUrl',
      'permanentFailure',
      'reasonLabel',
      'relatedDocumentId',
      'series',
      'status',
    ]);
    expect(JSON.stringify(row)).not.toContain('abc');
  });

  it('publishes permanentFailure from the classification the provider wrote (AC12)', () => {
    const row = toRow(
      buildDocument({
        status: 'failed',
        lastError: 'SUNAT rechazó el comprobante',
        providerResponse: {
          ...EMPTY_TRACE,
          errors: ['El RUC no existe'],
          httpStatus: 200,
          permanent: true,
        },
      }),
      WITH_PDF,
    );

    expect(row.permanentFailure).toBe(true);
  });

  // Los dos casos en los que el provider marca permanente **sin** devolver ningún `errors`:
  // un 4xx sin cuerpo y un `aceptada_por_sunat: false`. Recalcular la bandera desde
  // `errors.length` los publicaba como reintentables e invitaba a un bucle inútil.
  it('publishes a permanent failure that came with no errors to reread at all', () => {
    const row = toRow(
      buildDocument({
        status: 'failed',
        lastError: 'El token no es válido',
        providerResponse: { ...EMPTY_TRACE, errors: [], httpStatus: 401, permanent: true },
      }),
      WITH_PDF,
    );

    expect(row.permanentFailure).toBe(true);
  });

  it('reports a network failure as NOT permanent: retrying is exactly the right move (AC11)', () => {
    const row = toRow(
      buildDocument({
        status: 'failed',
        lastError: 'No se pudo contactar con el proveedor',
        providerResponse: { ...EMPTY_TRACE, errors: [], httpStatus: null },
      }),
      WITH_PDF,
    );

    expect(row.permanentFailure).toBe(false);
  });

  it('reports a failure with no trace at all as NOT permanent instead of throwing', () => {
    const row = toRow(buildDocument({ status: 'failed', providerResponse: null }), WITH_PDF);

    expect(row.permanentFailure).toBe(false);
  });

  it('never marks a pending document as a permanent failure', () => {
    const row = toRow(
      buildDocument({ providerResponse: { ...EMPTY_TRACE, errors: ['viejo error'] } }),
      WITH_PDF,
    );

    expect(row.permanentFailure).toBe(false);
  });

  it('gives a document with no series-number pair a null label, not "null-NaN"', () => {
    expect(toRow(buildDocument({ series: null, number: null }), WITH_PDF).label).toBeNull();
  });

  // El PDF del proveedor es una URL sin sesión y lleva el documento del comprador, su razón
  // social y el desglose base/IGV. `orders.read` —que tienen `manager` y `audit`— no alcanza
  // para eso, así que el enlace se recorta en servidor y no se oculta en el cliente (D-19).
  it('withholds the PDF link from a reader who only has orders.read', () => {
    const document = buildDocument({
      status: 'issued',
      issuedAt: new Date(),
      pdfUrl: 'https://nubefact.test/documento.pdf',
    });

    const row = toRow(document, { includePdfUrl: false });

    expect(row.pdfUrl).toBeNull();
    expect(JSON.stringify(row)).not.toContain('nubefact.test');
    // Todo lo demás sigue saliendo: lo que se recorta es el enlace, no el comprobante.
    expect(row.label).toBe('B001-00000012');
    expect(row.status).toBe('issued');
  });

  it('serves the PDF link to whoever may issue, and to the buyer of the document', () => {
    const row = toRow(
      buildDocument({
        status: 'issued',
        issuedAt: new Date(),
        pdfUrl: 'https://nubefact.test/documento.pdf',
      }),
      WITH_PDF,
    );

    expect(row.pdfUrl).toBe('https://nubefact.test/documento.pdf');
  });
});

describe('the mutators', () => {
  // La firma es lo que impide escribir un comprobante fuera de la transacción de su
  // entrada en la bitácora: ninguno acepta el `db` global, y se comprueba en el tipo.
  it('take the transaction handle as their first parameter', () => {
    expect(create.length).toBe(2);
    expect(claimForIssue.length).toBe(2);
    expect(markIssued.length).toBe(3);
    expect(markFailed.length).toBe(3);
    expect(markVoided.length).toBe(2);
  });
});

describe('buildIssuedOriginalFilter', () => {
  const ORDER_ID = '44444444-4444-4444-8444-444444444444';

  it('looks for the original of the order among the two original kinds', () => {
    const query = dialect.sqlToQuery(buildIssuedOriginalFilter(ORDER_ID));

    expect(query.params).toEqual([ORDER_ID, 'boleta', 'factura', 'issued']);
  });

  // AC5: no se puede acreditar un documento que SUNAT todavía no tiene, así que un original
  // `pending` o `failed` no cuenta y el ajuste responde 409 dirigiendo a emitirlo primero.
  it('demands issued, not merely "not voided" (AC5)', () => {
    const query = dialect.sqlToQuery(buildIssuedOriginalFilter(ORDER_ID));

    expect(query.params).toContain('issued');
    expect(query.params).not.toContain('pending');
    expect(query.sql).not.toContain('<>');
  });

  it('never matches a correction: only a boleta or a factura can be a parent', () => {
    const query = dialect.sqlToQuery(buildIssuedOriginalFilter(ORDER_ID));

    expect(query.params).not.toContain('nota_credito');
    expect(query.params).not.toContain('comunicacion_baja');
  });
});

describe('buildVoidableFilter', () => {
  it('only voids a document that was actually issued before SUNAT', () => {
    const query = dialect.sqlToQuery(buildVoidableFilter(DOCUMENT_ID));

    expect(query.params).toEqual([DOCUMENT_ID, 'issued']);
  });

  // Es lo que mantiene exacta la equivalencia del CHECK corregido en la migración `0011`:
  // un `pending` nunca alcanza `voided`, así que un `voided` siempre conserva su `issued_at`.
  it('never voids a pending or a failed document', () => {
    const query = dialect.sqlToQuery(buildVoidableFilter(DOCUMENT_ID));

    expect(query.params).not.toContain('pending');
    expect(query.params).not.toContain('failed');
  });
});

describe('toRow — the two fields the adjustment publishes', () => {
  it('publishes the parent id so the UI builds the tree without guessing by date (D-11)', () => {
    const parentId = '11111111-1111-4111-8111-111111111111';
    const row = toRow(
      buildDocument({ kind: 'nota_credito', relatedDocumentId: parentId, reasonCode: '06' }),
      WITH_PDF,
    );

    expect(row.relatedDocumentId).toBe(parentId);
  });

  it('leaves the parent id null on an original', () => {
    expect(toRow(buildDocument(), WITH_PDF).relatedDocumentId).toBeNull();
  });

  it('publishes the reason already resolved against its catalog, never the bare code', () => {
    const row = toRow(buildDocument({ kind: 'nota_credito', reasonCode: '06' }), WITH_PDF);

    expect(row.reasonLabel).toBe('Devolución total');
    expect(JSON.stringify(row)).not.toContain('"06"');
  });

  it('reads a debit note reason from catalog 10, which shares its digits with 09', () => {
    const row = toRow(buildDocument({ kind: 'nota_debito', reasonCode: '01' }), WITH_PDF);

    expect(row.reasonLabel).toBe('Intereses por mora');
  });

  it('leaves the reason null on an original, which carries none', () => {
    expect(toRow(buildDocument(), WITH_PDF).reasonLabel).toBeNull();
  });
});
