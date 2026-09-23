import { describe, expect, it } from 'vitest';

import { InvoicingProviderError, toProviderTrace } from './provider';

// Respuesta aceptada de Nubefact, recortada a los campos que la proyección mira más el
// eco del cuerpo enviado, que es justo lo que **no** debe guardarse (§6.6.1, AC15).
const ACCEPTED_RESPONSE = {
  tipo_de_comprobante: 2,
  serie: 'B001',
  numero: 12,
  enlace: 'https://nubefact.test/documento',
  enlace_del_pdf: 'https://nubefact.test/documento.pdf',
  enlace_del_xml: 'https://nubefact.test/documento.xml',
  enlace_del_cdr: 'https://nubefact.test/documento.cdr.zip',
  aceptada_por_sunat: true,
  sunat_description: 'La Boleta numero B001-12, ha sido aceptada',
  sunat_note: '',
  sunat_responsecode: '0',
  codigo_hash: 'Kd7wPQ==',
  cliente_numero_de_documento: '41281230',
  cliente_denominacion: 'Ada Lovelace',
};

describe('toProviderTrace', () => {
  it('keeps the fields of the projection and nothing else', () => {
    const trace = toProviderTrace(ACCEPTED_RESPONSE, 200);

    expect(trace).toEqual({
      acceptedBySunat: true,
      sunatDescription: 'La Boleta numero B001-12, ha sido aceptada',
      sunatNote: null,
      hash: 'Kd7wPQ==',
      errors: [],
      httpStatus: 200,
      permanent: false,
    });
  });

  it('never stores the buyer document echoed back by the provider (AC15)', () => {
    const serialized = JSON.stringify(toProviderTrace(ACCEPTED_RESPONSE, 200));

    expect(serialized).not.toContain('41281230');
    expect(serialized).not.toContain('Ada Lovelace');
  });

  it('never stores the links either: those live in their own columns', () => {
    const serialized = JSON.stringify(toProviderTrace(ACCEPTED_RESPONSE, 200));

    expect(serialized).not.toContain('nubefact.test');
  });

  it('normalises the single-string errors that Nubefact actually returns (§6.6.1)', () => {
    const trace = toProviderTrace({ errors: 'El campo serie es obligatorio' }, 200);

    expect(trace.errors).toEqual(['El campo serie es obligatorio']);
  });

  it('accepts an array of errors too, for a provider that sends several', () => {
    const trace = toProviderTrace({ errors: ['RUC inválido', 'Serie no habilitada'] }, 400);

    expect(trace.errors).toEqual(['RUC inválido', 'Serie no habilitada']);
  });

  it('treats an empty errors string as no errors, not as one blank error', () => {
    expect(toProviderTrace({ errors: '   ' }, 200).errors).toEqual([]);
  });

  it('collapses an empty sunat_note to null instead of an empty string', () => {
    expect(toProviderTrace({ sunat_note: '' }, 200).sunatNote).toBeNull();
  });

  it('leaves acceptedBySunat null when the provider did not say, instead of guessing false', () => {
    // `false` significaría «SUNAT lo rechazó», que es una afirmación distinta de «el
    // proveedor no llegó a contestar».
    expect(toProviderTrace({}, 502).acceptedBySunat).toBeNull();
  });

  it('survives a body that is not an object at all, keeping the status', () => {
    expect(toProviderTrace('<html>502 Bad Gateway</html>', 502)).toEqual({
      acceptedBySunat: null,
      sunatDescription: null,
      sunatNote: null,
      hash: null,
      errors: [],
      httpStatus: 502,
      permanent: false,
    });
  });

  it('survives a null body, which is what a network failure leaves behind', () => {
    expect(toProviderTrace(null, null).httpStatus).toBeNull();
  });

  it('ignores a field of the wrong type instead of publishing it raw', () => {
    expect(toProviderTrace({ sunat_description: 42, aceptada_por_sunat: 'si' }, 200)).toEqual({
      acceptedBySunat: null,
      sunatDescription: null,
      sunatNote: null,
      hash: null,
      errors: [],
      httpStatus: 200,
      permanent: false,
    });
  });

  it('never classifies by itself: the permanent flag is the provider job (§6.6.1)', () => {
    // Un `4xx` sin cuerpo **es** un fallo permanente, pero decirlo es de
    // `isPermanentFailure()`; esta traducción no adivina.
    expect(toProviderTrace(null, 401).permanent).toBe(false);
  });
});

describe('InvoicingProviderError', () => {
  it('carries the permanent flag and the trace that the UI and the row need', () => {
    const trace = toProviderTrace({ errors: 'RUC inválido' }, 200);
    const error = new InvoicingProviderError('SUNAT rechazó el comprobante', {
      permanent: true,
      trace,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvoicingProviderError');
    expect(error.permanent).toBe(true);
    expect(error.trace.errors).toEqual(['RUC inválido']);
  });

  // La traza es lo que se persiste en `provider_response` y de donde la fila saca
  // `permanentFailure`: si el error dijera permanente y la traza no, la UI invitaría a un
  // reintento inútil justo en el caso que AC12 quiere evitar.
  it('stamps the classification onto the trace, so the row cannot contradict the error', () => {
    const error = new InvoicingProviderError('El token no es válido', {
      permanent: true,
      // Un `4xx` sin cuerpo: permanente y **sin** un solo `errors` que releer.
      trace: toProviderTrace(null, 401),
    });

    expect(error.trace.permanent).toBe(true);
    expect(error.trace.errors).toEqual([]);
  });

  it('keeps a transient failure marked transient in the trace as well', () => {
    const error = new InvoicingProviderError('No se pudo contactar con el proveedor', {
      permanent: false,
      trace: toProviderTrace(null, null),
    });

    expect(error.trace.permanent).toBe(false);
  });

  it('keeps the original failure as cause without leaking it into the message', () => {
    const cause = new Error('fetch failed');
    const error = new InvoicingProviderError('No se pudo contactar con el proveedor', {
      permanent: false,
      trace: toProviderTrace(null, null),
      cause,
    });

    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain('fetch failed');
  });
});
