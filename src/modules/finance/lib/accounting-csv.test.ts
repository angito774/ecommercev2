import { describe, expect, it } from 'vitest';

import type {
  PurchaseRegistryRow,
  SalesRegistryRow,
} from '../types/accounting.types';

import {
  PURCHASE_REGISTRY_HEADERS,
  purchaseRegistryCsv,
  registryFileName,
  SALES_REGISTRY_HEADERS,
  salesRegistryCsv,
} from './accounting-csv';
import { CSV_BOM } from './csv';

const SALE: SalesRegistryRow = {
  id: 'doc-1',
  issuedAt: '2026-09-16T15:00:00.000Z',
  kind: 'factura',
  label: 'F001-00000123',
  buyerDocumentType: 'ruc',
  buyerDocumentNumber: '20100128056',
  buyerLegalName: 'Distribuidora SAC',
  baseCents: 100_000,
  igvCents: 18_000,
  amountCents: 118_000,
  relatedLabel: null,
};

const PURCHASE: PurchaseRegistryRow = {
  id: 'exp-1',
  incurredOn: '2026-09-16',
  receiptType: 'factura',
  supplierRuc: '20100128056',
  supplierName: 'Proveedor SAC',
  label: 'F001-00001234',
  baseCents: 100_000,
  igvCents: 18_000,
  amountCents: 118_000,
};

// El CSV se parte por registros y se descartan el BOM y el renglón final vacío: lo que se
// asierta son las celdas, no la fontanería del serializador, que tiene su propio test.
const records = (csv: string): string[][] =>
  csv
    .slice(CSV_BOM.length)
    .split('\r\n')
    .filter((line) => line !== '')
    .map((line) => line.split(','));

describe('salesRegistryCsv', () => {
  it('writes the headers in Spanish as the first line (AC14)', () => {
    expect(records(salesRegistryCsv([]))[0]).toEqual([...SALES_REGISTRY_HEADERS]);
  });

  it('writes only the headers for a range with no documents (AC23)', () => {
    expect(records(salesRegistryCsv([]))).toHaveLength(1);
  });

  it('writes one record per document, with one cell per header', () => {
    const [, row] = records(salesRegistryCsv([SALE]));

    expect(row).toHaveLength(SALES_REGISTRY_HEADERS.length);
  });

  it('writes the cells in the order of the headers', () => {
    const [, row] = records(salesRegistryCsv([SALE]));

    expect(row).toEqual([
      '2026-09-16',
      'Factura electrónica',
      'F001-00000123',
      'RUC',
      '20100128056',
      'Distribuidora SAC',
      '1000.00',
      '180.00',
      '1180.00',
      '',
    ]);
  });

  // AC18, D-16: el día es el de **Lima**, no el de UTC. A las 22:00 del 30 en Lima ya es
  // día 1 en UTC, y el comprobante pertenece al mes que se está cerrando.
  it('dates a document issued at 22:00 of the 30th in Lima on the 30th (AC18)', () => {
    const [, row] = records(
      salesRegistryCsv([{ ...SALE, issuedAt: '2026-10-01T03:00:00.000Z' }]),
    );

    expect(row[0]).toBe('2026-09-30');
  });

  // AC7: la serie-número del padre se resuelve por `related_document_id`, no por la letra
  // de la serie. Un original la trae vacía.
  it('carries the series-number of the document a credit note corrects (AC7)', () => {
    const [, row] = records(
      salesRegistryCsv([
        {
          ...SALE,
          kind: 'nota_credito',
          label: 'FC01-00000007',
          relatedLabel: 'F001-00000123',
        },
      ]),
    );

    expect(row[1]).toBe('Nota de crédito electrónica');
    expect(row[9]).toBe('F001-00000123');
  });

  it('leaves the corrected document empty for an original (AC7)', () => {
    const [, row] = records(salesRegistryCsv([SALE]));

    expect(row[9]).toBe('');
  });

  // Una boleta no lleva razón social —el `CHECK orders_buyer_legal_name_requires_ruc` lo
  // garantiza— y la celda queda vacía, no con un guion ni con un «—» (§10).
  it('leaves the buyer cells empty when the order has no fiscal data', () => {
    const [, row] = records(
      salesRegistryCsv([
        {
          ...SALE,
          kind: 'boleta',
          buyerDocumentType: null,
          buyerDocumentNumber: null,
          buyerLegalName: null,
        },
      ]),
    );

    expect(row.slice(3, 6)).toEqual(['', '', '']);
  });

  it('labels a DNI buyer as DNI', () => {
    const [, row] = records(
      salesRegistryCsv([
        { ...SALE, kind: 'boleta', buyerDocumentType: 'dni', buyerDocumentNumber: '09876543' },
      ]),
    );

    expect(row[3]).toBe('DNI');
  });

  // Nunca `0.00`: un importe ausente y un importe de cero son afirmaciones distintas.
  it('leaves an absent amount empty and never zero', () => {
    const [, row] = records(
      salesRegistryCsv([{ ...SALE, baseCents: null, igvCents: null, amountCents: null }]),
    );

    expect(row.slice(6, 9)).toEqual(['', '', '']);
  });

  it('quotes a legal name that contains a comma, without breaking the columns (AC15)', () => {
    const csv = salesRegistryCsv([{ ...SALE, buyerLegalName: 'Distribuidora, S.A.' }]);

    expect(csv).toContain('"Distribuidora, S.A."');
  });
});

describe('purchaseRegistryCsv', () => {
  it('writes the headers in Spanish as the first line (AC14)', () => {
    expect(records(purchaseRegistryCsv([]))[0]).toEqual([...PURCHASE_REGISTRY_HEADERS]);
  });

  it('writes only the headers for a range with no purchases (AC23)', () => {
    expect(records(purchaseRegistryCsv([]))).toHaveLength(1);
  });

  it('writes the cells in the order of the headers', () => {
    const [, row] = records(purchaseRegistryCsv([PURCHASE]));

    expect(row).toEqual([
      '2026-09-16',
      '20100128056',
      'Proveedor SAC',
      'Factura',
      'F001-00001234',
      '1000.00',
      '180.00',
      '1180.00',
      'Sí',
    ]);
  });

  it('writes the day of the expense as registered, with no timezone in the way', () => {
    const [, row] = records(purchaseRegistryCsv([{ ...PURCHASE, incurredOn: '2026-09-30' }]));

    expect(row[0]).toBe('2026-09-30');
  });

  // AC11, D-10: la elegibilidad se deriva de `grantsTaxCredit()` y no viaja en el
  // contrato. Una factura sustenta crédito fiscal; una boleta, por regla general, no.
  it('derives the tax credit column from grantsTaxCredit (AC11)', () => {
    const [, factura] = records(purchaseRegistryCsv([PURCHASE]));
    const [, boleta] = records(
      purchaseRegistryCsv([{ ...PURCHASE, receiptType: 'boleta' }]),
    );

    expect(factura[8]).toBe('Sí');
    expect(boleta[8]).toBe('No');
  });

  it('leaves the tax credit empty when the receipt type is missing (D-14)', () => {
    const [, row] = records(
      purchaseRegistryCsv([{ ...PURCHASE, receiptType: null, label: null }]),
    );

    expect(row[3]).toBe('');
    expect(row[8]).toBe('');
  });

  it('leaves the series-number empty for a receipt registered without one', () => {
    const [, row] = records(purchaseRegistryCsv([{ ...PURCHASE, label: null }]));

    expect(row[4]).toBe('');
  });

  // AC12: nunca se inventa una base con un 18 % sobre un recibo por honorarios. La fila ya
  // llega con la base resuelta y el IGV ausente sale como celda vacía, no como `0.00`.
  it('writes the full amount as base and an empty IGV for a receipt without IGV (AC12)', () => {
    const [, row] = records(
      purchaseRegistryCsv([
        {
          ...PURCHASE,
          receiptType: 'recibo_honorarios',
          igvCents: null,
          baseCents: 118_000,
        },
      ]),
    );

    expect(row[5]).toBe('1180.00');
    expect(row[6]).toBe('');
    expect(row[7]).toBe('1180.00');
    expect(row[8]).toBe('No');
  });

  it('quotes a supplier name that contains a comma (AC15)', () => {
    const csv = purchaseRegistryCsv([{ ...PURCHASE, supplierName: 'Servicios, S.A.' }]);

    expect(csv).toContain('"Servicios, S.A."');
  });

  // AC16, D-5: una razón social tecleada como fórmula se neutraliza en el serializador.
  it('neutralizes a supplier name typed as a formula (AC16)', () => {
    const csv = purchaseRegistryCsv([{ ...PURCHASE, supplierName: '=CMD()' }]);

    expect(csv).toContain("'=CMD()");
  });
});

describe('registryFileName', () => {
  const RANGE = { from: '2026-09-01', to: '2026-09-30' };

  it('names the sales file after its registry and range (AC20)', () => {
    expect(registryFileName('sales', RANGE)).toBe('registro-ventas-2026-09-01_2026-09-30.csv');
  });

  it('names the purchases file after its registry and range (AC20)', () => {
    expect(registryFileName('purchases', RANGE)).toBe(
      'registro-compras-2026-09-01_2026-09-30.csv',
    );
  });

  it('names a single-day range with the same day twice', () => {
    expect(registryFileName('sales', { from: '2026-09-16', to: '2026-09-16' })).toBe(
      'registro-ventas-2026-09-16_2026-09-16.csv',
    );
  });

  // El nombre no dice «PLE» ni «declaración»: el riesgo de esta pantalla es que alguien
  // tome el archivo por el registro oficial (§10).
  it('never calls the file a PLE or a declaration', () => {
    const name = registryFileName('sales', RANGE);

    expect(name).not.toContain('ple');
    expect(name).not.toContain('declaracion');
  });
});
