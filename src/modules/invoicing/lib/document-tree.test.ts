import { describe, expect, it } from 'vitest';

import type { ElectronicDocumentRow } from '../types/electronic-document.types';

import { buildDocumentTree } from './document-tree';

const ORIGINAL_ID = '11111111-1111-4111-8111-111111111111';
const NOTE_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_NOTE_ID = '33333333-3333-4333-8333-333333333333';
const REISSUE_ID = '44444444-4444-4444-8444-444444444444';

function buildRow(overrides: Partial<ElectronicDocumentRow> = {}): ElectronicDocumentRow {
  return {
    id: ORIGINAL_ID,
    kind: 'boleta',
    status: 'issued',
    series: 'B001',
    number: 12,
    amountCents: 311_700,
    pdfUrl: null,
    attemptCount: 1,
    issuedAt: '2026-09-22T15:04:05.000Z',
    lastError: null,
    permanentFailure: false,
    label: 'B001-00000012',
    relatedDocumentId: null,
    reasonLabel: null,
    ...overrides,
  };
}

describe('buildDocumentTree', () => {
  it('returns nothing for a pedido with no documents', () => {
    expect(buildDocumentTree([])).toEqual([]);
  });

  it('leaves a lone original as a root with no children', () => {
    const tree = buildDocumentTree([buildRow()]);

    expect(tree).toHaveLength(1);
    expect(tree[0].children).toEqual([]);
  });

  it('nests a correction under the document it modifies', () => {
    const note = buildRow({
      id: NOTE_ID,
      kind: 'nota_credito',
      relatedDocumentId: ORIGINAL_ID,
      reasonLabel: 'Devolución total',
    });

    const tree = buildDocumentTree([buildRow(), note]);

    expect(tree).toHaveLength(1);
    expect(tree[0].document.id).toBe(ORIGINAL_ID);
    expect(tree[0].children.map((child) => child.id)).toEqual([NOTE_ID]);
  });

  // El caso que D-11 nombra: con dos correcciones sobre el mismo original, el orden
  // cronológico no dice cuál modifica a cuál. La columna sí.
  it('nests two corrections of the same original under it, keeping their order', () => {
    const tree = buildDocumentTree([
      buildRow(),
      buildRow({ id: NOTE_ID, kind: 'nota_credito', relatedDocumentId: ORIGINAL_ID }),
      buildRow({ id: SECOND_NOTE_ID, kind: 'nota_debito', relatedDocumentId: ORIGINAL_ID }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((child) => child.id)).toEqual([NOTE_ID, SECOND_NOTE_ID]);
  });

  // El pedido corregido: el original anulado con su nota debajo, y el comprobante reemitido
  // como raíz propia. Ordenando por fecha, la reemisión habría caído bajo la nota.
  it('keeps a reissued comprobante as its own root, not under the note that voided the first', () => {
    const tree = buildDocumentTree([
      buildRow({ status: 'voided' }),
      buildRow({ id: NOTE_ID, kind: 'nota_credito', relatedDocumentId: ORIGINAL_ID }),
      buildRow({ id: REISSUE_ID, series: 'B001', number: 13, relatedDocumentId: null }),
    ]);

    expect(tree.map((node) => node.document.id)).toEqual([ORIGINAL_ID, REISSUE_ID]);
    expect(tree[0].children.map((child) => child.id)).toEqual([NOTE_ID]);
  });

  // La anidación es una ayuda de lectura, no un filtro: esconder un documento fiscal
  // porque su padre no vino sería la peor forma de descubrirlo.
  it('promotes an orphan correction to a root instead of dropping it', () => {
    const orphan = buildRow({
      id: NOTE_ID,
      kind: 'nota_credito',
      relatedDocumentId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    });

    const tree = buildDocumentTree([orphan]);

    expect(tree).toHaveLength(1);
    expect(tree[0].document.id).toBe(NOTE_ID);
  });

  it('never loses a document: every row shows up exactly once in the tree', () => {
    const rows = [
      buildRow(),
      buildRow({ id: NOTE_ID, kind: 'nota_credito', relatedDocumentId: ORIGINAL_ID }),
      buildRow({ id: SECOND_NOTE_ID, kind: 'nota_debito', relatedDocumentId: ORIGINAL_ID }),
      buildRow({ id: REISSUE_ID, relatedDocumentId: null }),
    ];

    const tree = buildDocumentTree(rows);
    const rendered = tree.flatMap((node) => [node.document.id, ...node.children.map((c) => c.id)]);

    expect(rendered.sort()).toEqual(rows.map((row) => row.id).sort());
  });

  it('preserves the order the server sent for the roots', () => {
    const tree = buildDocumentTree([
      buildRow({ id: REISSUE_ID }),
      buildRow({ id: ORIGINAL_ID }),
    ]);

    expect(tree.map((node) => node.document.id)).toEqual([REISSUE_ID, ORIGINAL_ID]);
  });
});
