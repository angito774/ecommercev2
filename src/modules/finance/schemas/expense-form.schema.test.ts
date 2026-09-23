import { describe, expect, it } from 'vitest';

import {
  expenseFormSchema,
  INVALID_RUC_MESSAGE,
  RECEIPT_PAIR_MESSAGE,
} from './expense-form.schema';

// Los cuatro campos del gasto en sí, válidos siempre: lo que estos tests ejercitan es el
// bloque del comprobante y su bandera.
const BASE = {
  concept: 'Alquiler del almacén',
  amount: '1500.00',
  category: 'rent',
  incurredOn: '2026-09-16',
} as const;

const OFF = {
  ...BASE,
  hasReceipt: false,
  receiptType: 'factura',
  supplierRuc: '',
  supplierName: '',
  receiptSeries: '',
  receiptNumber: '',
} as const;

const ON = {
  ...OFF,
  hasReceipt: true,
  supplierRuc: '20100128056',
  supplierName: 'Proveedor SAC',
} as const;

const issuePaths = (value: unknown): string[][] => {
  const parsed = expenseFormSchema.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path as string[]);
};

describe('expenseFormSchema with the receipt switch off', () => {
  it('accepts empty receipt fields: a hidden block is not validated (AC18)', () => {
    expect(expenseFormSchema.safeParse(OFF).success).toBe(true);
  });

  it('accepts a garbage RUC left behind in the hidden field (AC18)', () => {
    expect(expenseFormSchema.safeParse({ ...OFF, supplierRuc: 'no-es-un-ruc' }).success).toBe(
      true,
    );
  });

  it('accepts a half-typed series-number pair left behind (AC18)', () => {
    expect(expenseFormSchema.safeParse({ ...OFF, receiptSeries: 'F001' }).success).toBe(true);
  });

  it('still validates the expense itself: the switch does not disable the rest', () => {
    expect(expenseFormSchema.safeParse({ ...OFF, concept: 'ab' }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...OFF, amount: 'gratis' }).success).toBe(false);
  });
});

describe('expenseFormSchema with the receipt switch on', () => {
  it('accepts a complete receipt with no series-number pair', () => {
    expect(expenseFormSchema.safeParse(ON).success).toBe(true);
  });

  it('accepts a complete receipt with both series and number', () => {
    expect(
      expenseFormSchema.safeParse({ ...ON, receiptSeries: 'F001', receiptNumber: '00001234' })
        .success,
    ).toBe(true);
  });

  it('rejects an invalid RUC and hangs the error on supplierRuc, not on the root', () => {
    const parsed = expenseFormSchema.safeParse({ ...ON, supplierRuc: '20100128057' });

    expect(parsed.success).toBe(false);
    expect(issuePaths({ ...ON, supplierRuc: '20100128057' })).toContainEqual(['supplierRuc']);
  });

  it('uses the shared message so the copy cannot drift from the API schema', () => {
    const parsed = expenseFormSchema.safeParse({ ...ON, supplierRuc: '20100128057' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message)).toContain(INVALID_RUC_MESSAGE);
  });

  it('rejects an empty RUC: with the switch on the field is required', () => {
    expect(issuePaths({ ...ON, supplierRuc: '' })).toContainEqual(['supplierRuc']);
  });

  it('rejects a RUC whose prefix is not a taxpayer type', () => {
    expect(issuePaths({ ...ON, supplierRuc: '11100128056' })).toContainEqual(['supplierRuc']);
  });

  it('rejects an empty supplier name and hangs the error on its own field', () => {
    expect(issuePaths({ ...ON, supplierName: '' })).toContainEqual(['supplierName']);
  });

  it('rejects a supplier name of two characters', () => {
    expect(issuePaths({ ...ON, supplierName: 'ab' })).toContainEqual(['supplierName']);
  });

  it('rejects a supplier name of 161 characters', () => {
    expect(issuePaths({ ...ON, supplierName: 'a'.repeat(161) })).toContainEqual(['supplierName']);
  });

  it('demands the pair: a series with no number hangs the error on the number (AC12)', () => {
    expect(issuePaths({ ...ON, receiptSeries: 'F001' })).toContainEqual(['receiptNumber']);
  });

  it('demands the pair: a number with no series hangs the error on the series (AC12)', () => {
    expect(issuePaths({ ...ON, receiptNumber: '00001234' })).toContainEqual(['receiptSeries']);
  });

  it('names the pair rule in the message', () => {
    const parsed = expenseFormSchema.safeParse({ ...ON, receiptSeries: 'F001' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message)).toContain(RECEIPT_PAIR_MESSAGE);
  });

  it('accepts neither of the two: series and number are optional even with a receipt (AC12)', () => {
    expect(
      expenseFormSchema.safeParse({ ...ON, receiptSeries: '', receiptNumber: '' }).success,
    ).toBe(true);
  });

  it('rejects a series of five characters', () => {
    expect(
      issuePaths({ ...ON, receiptSeries: 'F0011', receiptNumber: '1' }),
    ).toContainEqual(['receiptSeries']);
  });

  it('rejects a correlative that is not digits', () => {
    expect(
      issuePaths({ ...ON, receiptSeries: 'F001', receiptNumber: '12-34' }),
    ).toContainEqual(['receiptNumber']);
  });

  it('accepts a lowercase series: the API schema uppercases it', () => {
    expect(
      expenseFormSchema.safeParse({ ...ON, receiptSeries: 'f001', receiptNumber: '1' }).success,
    ).toBe(true);
  });

  it('accepts the four receipt types of the catalogue', () => {
    for (const receiptType of ['factura', 'boleta', 'recibo_honorarios', 'otro']) {
      expect(expenseFormSchema.safeParse({ ...ON, receiptType }).success).toBe(true);
    }
  });

  it('rejects a receipt type outside the catalogue', () => {
    expect(expenseFormSchema.safeParse({ ...ON, receiptType: 'guia_remision' }).success).toBe(
      false,
    );
  });

  it('reports every offending field at once instead of stopping at the first', () => {
    const paths = issuePaths({ ...ON, supplierRuc: 'x', supplierName: '' });

    expect(paths).toContainEqual(['supplierRuc']);
    expect(paths).toContainEqual(['supplierName']);
  });
});
