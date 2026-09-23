import { describe, expect, it } from 'vitest';

import {
  ADJUSTMENT_INTENTS,
  CREDIT_NOTE_REASONS,
  DEBIT_NOTE_REASONS,
  DOCUMENT_SERIES_KEYS,
  ELECTRONIC_DOCUMENT_KIND_LABELS,
  ELECTRONIC_DOCUMENT_KINDS,
  ELECTRONIC_DOCUMENT_STATUS_LABELS,
  ELECTRONIC_DOCUMENT_STATUSES,
  formatDocumentLabel,
  isOriginalKind,
  ORIGINAL_DOCUMENT_KINDS,
  REASONS_BY_INTENT,
  reasonLabelFor,
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

  // D-7: las dos formas de preguntar lo mismo salen de la misma tupla, así que no pueden
  // separarse. Sin esto, alguien podría ampliar la tupla y dejar el predicado atrás.
  it('agrees with ORIGINAL_DOCUMENT_KINDS for every kind of the catalogue', () => {
    for (const kind of ELECTRONIC_DOCUMENT_KINDS) {
      expect(isOriginalKind(kind)).toBe(
        (ORIGINAL_DOCUMENT_KINDS as readonly string[]).includes(kind),
      );
    }
  });

  // La tupla no es una lista suelta: todos sus valores pertenecen al catálogo, y son
  // exactamente los dos que el `CHECK electronic_documents_original_has_no_parent`
  // nombra como «sin padre».
  it('keeps the tuple inside the catalogue, with no duplicates', () => {
    expect(ORIGINAL_DOCUMENT_KINDS).toEqual(['boleta', 'factura']);
    for (const kind of ORIGINAL_DOCUMENT_KINDS) {
      expect(ELECTRONIC_DOCUMENT_KINDS).toContain(kind);
    }
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

describe('REASONS_BY_INTENT', () => {
  it('covers the four intentions, so no branch of the union is left without a catalog', () => {
    for (const intent of ADJUSTMENT_INTENTS) {
      expect(REASONS_BY_INTENT[intent].length).toBeGreaterThan(0);
    }
  });

  it('only offers codes that exist in the catalog the intention will end up writing', () => {
    const creditCodes = CREDIT_NOTE_REASONS.map((reason) => reason.code);
    const debitCodes = DEBIT_NOTE_REASONS.map((reason) => reason.code);

    for (const intent of ['anulacion_total', 'devolucion_parcial', 'correccion_comprador'] as const) {
      for (const code of REASONS_BY_INTENT[intent]) expect(creditCodes).toContain(code);
    }
    for (const code of REASONS_BY_INTENT.cargo_adicional) expect(debitCodes).toContain(code);
  });

  // Lo que hace que `voidsParent()` se pueda derivar de esta tabla en vez de mantener una
  // segunda lista de códigos a mano (spec 023, §6.2 reglas 1 y 3).
  it('keeps the partial-refund reasons disjoint from the ones that cancel the whole sale', () => {
    const cancelling = new Set<string>([
      ...REASONS_BY_INTENT.anulacion_total,
      ...REASONS_BY_INTENT.correccion_comprador,
    ]);

    for (const code of REASONS_BY_INTENT.devolucion_parcial) {
      expect(cancelling.has(code)).toBe(false);
    }
  });
});

describe('reasonLabelFor', () => {
  it('reads a credit note reason from catalog 09', () => {
    expect(reasonLabelFor('nota_credito', '06')).toBe('Devolución total');
  });

  // Los dos catálogos comparten los dígitos `01`, `02` y `03` con significados distintos:
  // leer el motivo sin el `kind` al lado daría la etiqueta del catálogo equivocado.
  it('reads a debit note reason from catalog 10, not from 09', () => {
    expect(reasonLabelFor('nota_debito', '01')).toBe('Intereses por mora');
    expect(reasonLabelFor('nota_credito', '01')).toBe('Anulación de la operación');
  });

  it('reads a comunicación de baja from catalog 09, like the credit note it replaces', () => {
    expect(reasonLabelFor('comunicacion_baja', '01')).toBe('Anulación de la operación');
  });

  it('returns null for an original, which carries no reason at all', () => {
    expect(reasonLabelFor('boleta', '01')).toBeNull();
    expect(reasonLabelFor('factura', null)).toBeNull();
  });

  it('returns null for a code outside the catalog instead of printing the bare code', () => {
    expect(reasonLabelFor('nota_credito', '99')).toBeNull();
  });
});
