import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_SERIES_KEYS,
  ELECTRONIC_DOCUMENT_KIND_LABELS,
  ELECTRONIC_DOCUMENT_KINDS,
  ELECTRONIC_DOCUMENT_STATUS_LABELS,
  ELECTRONIC_DOCUMENT_STATUSES,
  formatDocumentLabel,
  isOriginalKind,
  seriesKeyFor,
} from './electronic-documents';

describe('seriesKeyFor', () => {
  it('maps the two original kinds onto their own series key', () => {
    expect(seriesKeyFor('boleta')).toBe('boleta');
    expect(seriesKeyFor('factura')).toBe('factura');
  });

  it('ignores the parent of an original: a boleta is a boleta whoever asks', () => {
    expect(seriesKeyFor('boleta', 'factura')).toBe('boleta');
  });

  it('takes the series letter from the document it corrects, as SUNAT requires', () => {
    expect(seriesKeyFor('nota_credito', 'boleta')).toBe('nota_credito_boleta');
    expect(seriesKeyFor('nota_credito', 'factura')).toBe('nota_credito_factura');
    expect(seriesKeyFor('nota_debito', 'boleta')).toBe('nota_debito_boleta');
    expect(seriesKeyFor('nota_debito', 'factura')).toBe('nota_debito_factura');
  });

  it('gives a comunicacion_baja no series: it references the document it voids', () => {
    expect(seriesKeyFor('comunicacion_baja')).toBeNull();
    expect(seriesKeyFor('comunicacion_baja', 'factura')).toBeNull();
  });

  it('gives a parentless correction no series instead of inventing one', () => {
    expect(seriesKeyFor('nota_credito')).toBeNull();
    expect(seriesKeyFor('nota_debito')).toBeNull();
  });

  it('only ever returns keys that the catalogue declares', () => {
    for (const kind of ELECTRONIC_DOCUMENT_KINDS) {
      for (const parent of ['boleta', 'factura'] as const) {
        const key = seriesKeyFor(kind, parent);
        if (key !== null) expect(DOCUMENT_SERIES_KEYS).toContain(key);
      }
    }
  });
});

describe('formatDocumentLabel', () => {
  it('pads the number to the eight digits of the SUNAT printed format', () => {
    expect(formatDocumentLabel('B001', 123)).toBe('B001-00000123');
  });

  it('does not truncate a number that already exceeds the padding', () => {
    expect(formatDocumentLabel('F001', 123_456_789)).toBe('F001-123456789');
  });

  it('formats the very first document of a series as 1, not 0', () => {
    expect(formatDocumentLabel('F001', 1)).toBe('F001-00000001');
  });

  it('returns null when there is no pair, so the UI never prints undefined-NaN', () => {
    expect(formatDocumentLabel(null, 12)).toBeNull();
    expect(formatDocumentLabel('B001', null)).toBeNull();
    expect(formatDocumentLabel(null, null)).toBeNull();
  });
});

describe('isOriginalKind', () => {
  it('accepts exactly the two kinds that this spec inserts', () => {
    expect(isOriginalKind('boleta')).toBe(true);
    expect(isOriginalKind('factura')).toBe(true);
  });

  it('rejects the three kinds that only the spec 023 writes', () => {
    expect(isOriginalKind('nota_credito')).toBe(false);
    expect(isOriginalKind('nota_debito')).toBe(false);
    expect(isOriginalKind('comunicacion_baja')).toBe(false);
  });
});

describe('labels', () => {
  it('names every kind and every status: a missing label would print the raw code', () => {
    for (const kind of ELECTRONIC_DOCUMENT_KINDS) {
      expect(ELECTRONIC_DOCUMENT_KIND_LABELS[kind]).toBeTruthy();
    }
    for (const status of ELECTRONIC_DOCUMENT_STATUSES) {
      expect(ELECTRONIC_DOCUMENT_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});
