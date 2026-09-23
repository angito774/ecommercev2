import { describe, expect, it } from 'vitest';

import type { PurchaseReceiptInput } from '../schemas/finance.schema';
import {
  resolveReceiptColumns,
  toReceiptColumns,
  type ExpenseReceiptBefore,
} from './expense-receipt';

// `factura` es el tipo afecto confirmado de la tabla; `recibo_honorarios` el no afecto.
// Si T1 se reabre y mueve una celda, estos dos nombres son lo único que hay que revisar.
const FACTURA: PurchaseReceiptInput = {
  type: 'factura',
  supplierRuc: '20100128056',
  supplierName: 'Proveedor SAC',
  series: 'F001',
  number: '00001234',
};

const HONORARIOS: PurchaseReceiptInput = {
  type: 'recibo_honorarios',
  supplierRuc: '10425658785',
  supplierName: 'Juan Pérez Contador',
  series: 'E001',
  number: '00000042',
};

const NO_RECEIPT_BEFORE: ExpenseReceiptBefore = {
  receiptType: null,
  supplierRuc: null,
  supplierName: null,
  receiptSeries: null,
  receiptNumber: null,
  amountCents: 11_800,
};

const WITH_RECEIPT_BEFORE: ExpenseReceiptBefore = {
  receiptType: 'factura',
  supplierRuc: '20100128056',
  supplierName: 'Proveedor SAC',
  receiptSeries: 'F001',
  receiptNumber: '00001234',
  amountCents: 11_800,
};

describe('toReceiptColumns', () => {
  it('returns the six columns as null with no receipt: turning the switch off clears for real (AC10)', () => {
    expect(toReceiptColumns(null, 11_800)).toEqual({
      receiptType: null,
      supplierRuc: null,
      supplierName: null,
      receiptSeries: null,
      receiptNumber: null,
      igvCents: null,
    });
  });

  it('never returns undefined in a column: Drizzle would read it as "do not touch"', () => {
    const columns = toReceiptColumns(null, 11_800);

    for (const value of Object.values(columns)) expect(value).toBeNull();
  });

  it('splits 1800 cents of IGV out of 11800 on an IGV-bearing type (AC6)', () => {
    expect(toReceiptColumns(FACTURA, 11_800).igvCents).toBe(1800);
  });

  it('keeps amount - igv === round(amount / 1.18) by construction, not by luck (AC6)', () => {
    // Importes elegidos porque el redondeo de la base cae a cada lado del medio céntimo.
    for (const amount of [1, 2, 6, 99, 100, 11_800, 12_345, 99_999, 1_000_000]) {
      const { igvCents } = toReceiptColumns(FACTURA, amount);

      expect(igvCents).not.toBeNull();
      expect(amount - (igvCents as number)).toBe(Math.round(amount / 1.18));
    }
  });

  it('gives null IGV on a type that is not subject to IGV, never 0 (AC8)', () => {
    expect(toReceiptColumns(HONORARIOS, 11_800).igvCents).toBeNull();
  });

  it('keeps supplier and series on a non-IGV type: only the tax is absent (AC8)', () => {
    expect(toReceiptColumns(HONORARIOS, 11_800)).toEqual({
      receiptType: 'recibo_honorarios',
      supplierRuc: '10425658785',
      supplierName: 'Juan Pérez Contador',
      receiptSeries: 'E001',
      receiptNumber: '00000042',
      igvCents: null,
    });
  });

  it('maps a receipt with no series-number pair to nulls, not undefined (AC12)', () => {
    const columns = toReceiptColumns(
      { type: 'factura', supplierRuc: '20100128056', supplierName: 'Proveedor SAC' },
      11_800,
    );

    expect(columns.receiptSeries).toBeNull();
    expect(columns.receiptNumber).toBeNull();
    expect(columns.receiptType).toBe('factura');
  });

  it('never produces a negative IGV nor one equal to the amount at the minimum amount of 1', () => {
    const { igvCents } = toReceiptColumns(FACTURA, 1);

    expect(igvCents).toBe(0);
    expect(igvCents as number).toBeGreaterThanOrEqual(0);
    expect(igvCents as number).toBeLessThan(1);
  });

  it('keeps igv < amount for every amount: the CHECK of the table can never fire', () => {
    for (const amount of [1, 2, 3, 10, 118, 11_800, 100_000_000]) {
      const { igvCents } = toReceiptColumns(FACTURA, amount);

      expect(igvCents as number).toBeGreaterThanOrEqual(0);
      expect(igvCents as number).toBeLessThan(amount);
    }
  });
});

describe('resolveReceiptColumns', () => {
  it('returns null when receipt is omitted and the amount does not change: omitting is not deleting (AC11)', () => {
    expect(resolveReceiptColumns(WITH_RECEIPT_BEFORE, { concept: 'Otro concepto' })).toBeNull();
  });

  it('returns null when the patch repeats the very same amount', () => {
    expect(resolveReceiptColumns(WITH_RECEIPT_BEFORE, { amountCents: 11_800 })).toBeNull();
  });

  it('recomputes the IGV of the previous receipt when only the amount changes (AC9)', () => {
    const columns = resolveReceiptColumns(WITH_RECEIPT_BEFORE, { amountCents: 23_600 });

    expect(columns?.igvCents).toBe(3600);
  });

  it('keeps the previous supplier and series untouched while recomputing the IGV (AC9)', () => {
    expect(resolveReceiptColumns(WITH_RECEIPT_BEFORE, { amountCents: 23_600 })).toEqual({
      receiptType: 'factura',
      supplierRuc: '20100128056',
      supplierName: 'Proveedor SAC',
      receiptSeries: 'F001',
      receiptNumber: '00001234',
      igvCents: 3600,
    });
  });

  it('never leaves the IGV of the previous amount behind (AC9)', () => {
    const columns = resolveReceiptColumns(WITH_RECEIPT_BEFORE, { amountCents: 23_600 });

    expect(columns?.igvCents).not.toBe(1800);
  });

  it('clears the six columns with an explicit receipt: null (AC10)', () => {
    expect(resolveReceiptColumns(WITH_RECEIPT_BEFORE, { receipt: null })).toEqual({
      receiptType: null,
      supplierRuc: null,
      supplierName: null,
      receiptSeries: null,
      receiptNumber: null,
      igvCents: null,
    });
  });

  it('distinguishes receipt: null from an omitted receipt: one clears, the other does not', () => {
    expect(resolveReceiptColumns(WITH_RECEIPT_BEFORE, { receipt: null })).not.toBeNull();
    expect(resolveReceiptColumns(WITH_RECEIPT_BEFORE, { concept: 'Otro' })).toBeNull();
  });

  it('invents no receipt on an expense that never had one when receipt is omitted', () => {
    expect(resolveReceiptColumns(NO_RECEIPT_BEFORE, { amountCents: 50_000 })).toBeNull();
  });

  it('adds a receipt to an expense that had none when the body brings one', () => {
    const columns = resolveReceiptColumns(NO_RECEIPT_BEFORE, { receipt: FACTURA });

    expect(columns?.receiptType).toBe('factura');
    // Sobre el importe que ya tenía la fila: el cuerpo no trajo uno nuevo.
    expect(columns?.igvCents).toBe(1800);
  });

  it('computes the IGV over the merged state when both the receipt and the amount change', () => {
    const columns = resolveReceiptColumns(NO_RECEIPT_BEFORE, {
      receipt: FACTURA,
      amountCents: 23_600,
    });

    expect(columns?.igvCents).toBe(3600);
  });

  it('replaces an IGV-bearing receipt with a non-IGV one and drops the tax to null (AC8)', () => {
    const columns = resolveReceiptColumns(WITH_RECEIPT_BEFORE, { receipt: HONORARIOS });

    expect(columns?.receiptType).toBe('recibo_honorarios');
    expect(columns?.igvCents).toBeNull();
  });

  it('does not recompute anything for a previous non-IGV receipt beyond keeping it null', () => {
    const before: ExpenseReceiptBefore = {
      receiptType: 'recibo_honorarios',
      supplierRuc: '10425658785',
      supplierName: 'Juan Pérez Contador',
      receiptSeries: null,
      receiptNumber: null,
      amountCents: 11_800,
    };

    expect(resolveReceiptColumns(before, { amountCents: 23_600 })).toEqual({
      receiptType: 'recibo_honorarios',
      supplierRuc: '10425658785',
      supplierName: 'Juan Pérez Contador',
      receiptSeries: null,
      receiptNumber: null,
      igvCents: null,
    });
  });
});
