import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createExpenseSchema,
  expenseIdSchema,
  expenseQuerySchema,
  financeRangeSchema,
  MAX_EXPENSE_AMOUNT_CENTS,
  purchaseReceiptSchema,
  updateExpenseSchema,
} from './finance.schema';

// RUC reales en forma —pasan el módulo 11— y sin relación con ningún contribuyente
// concreto: lo que se prueba es la aritmética, no el padrón.
const VALID_RUC = '20100128056';

const VALID_RECEIPT = {
  type: 'factura',
  supplierRuc: VALID_RUC,
  supplierName: 'Proveedor SAC',
} as const;

describe('financeRangeSchema', () => {
  it('accepts an empty query and leaves both bounds undefined (AC4)', () => {
    const parsed = financeRangeSchema.parse({});

    expect(parsed).toEqual({});
  });

  it('accepts a well-ordered range', () => {
    expect(financeRangeSchema.parse({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });

  it('accepts from equal to to: a single day is a valid range', () => {
    expect(financeRangeSchema.safeParse({ from: '2026-09-16', to: '2026-09-16' }).success).toBe(
      true,
    );
  });

  it('rejects an inverted range (AC5)', () => {
    expect(financeRangeSchema.safeParse({ from: '2026-09-30', to: '2026-09-01' }).success).toBe(
      false,
    );
  });

  it('rejects a month that does not exist (AC5)', () => {
    expect(financeRangeSchema.safeParse({ from: '2026-13-01' }).success).toBe(false);
  });

  it('rejects a date that is not YYYY-MM-DD (AC5)', () => {
    expect(financeRangeSchema.safeParse({ from: '01/09/2026' }).success).toBe(false);
  });
});

describe('expenseQuerySchema', () => {
  it('defaults to every category, page 1 and 20 rows, with no dates (AC19)', () => {
    expect(expenseQuerySchema.parse({})).toEqual({ category: 'all', page: 1, pageSize: 20 });
  });

  it('coerces the page and page size that arrive as query strings', () => {
    const parsed = expenseQuerySchema.parse({ page: '3', pageSize: '50' });

    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it('accepts a category of the enum', () => {
    expect(expenseQuerySchema.parse({ category: 'rent' }).category).toBe('rent');
  });

  it('rejects a category outside the enum', () => {
    expect(expenseQuerySchema.safeParse({ category: 'payroll' }).success).toBe(false);
  });

  it('rejects page 0', () => {
    expect(expenseQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('rejects a page size above the cap', () => {
    expect(expenseQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('rejects an inverted range like the summary does (AC5)', () => {
    expect(
      expenseQuerySchema.safeParse({ from: '2026-09-30', to: '2026-09-01' }).success,
    ).toBe(false);
  });
});

describe('purchaseReceiptSchema', () => {
  it('accepts a well-formed receipt with no series-number pair (AC12)', () => {
    expect(purchaseReceiptSchema.parse(VALID_RECEIPT)).toEqual(VALID_RECEIPT);
  });

  it('accepts the four types of the catalogue', () => {
    for (const type of ['factura', 'boleta', 'recibo_honorarios', 'otro']) {
      expect(purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, type }).success).toBe(true);
    }
  });

  it('rejects a type outside the catalogue', () => {
    expect(
      purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, type: 'guia_remision' }).success,
    ).toBe(false);
  });

  // AC5: el comprobante viaja completo o no viaja. Cada caso se construye con los dos
  // campos que sí van, en vez de desestructurar para descartar uno.
  it('rejects a receipt with no type (AC5)', () => {
    expect(
      purchaseReceiptSchema.safeParse({
        supplierRuc: VALID_RUC,
        supplierName: 'Proveedor SAC',
      }).success,
    ).toBe(false);
  });

  it('rejects a receipt with no supplierRuc (AC5)', () => {
    expect(
      purchaseReceiptSchema.safeParse({ type: 'factura', supplierName: 'Proveedor SAC' }).success,
    ).toBe(false);
  });

  it('rejects a receipt with no supplierName (AC5)', () => {
    expect(
      purchaseReceiptSchema.safeParse({ type: 'factura', supplierRuc: VALID_RUC }).success,
    ).toBe(false);
  });

  // AC4: el dígito verificador, reutilizado de `isValidRuc()` del spec 022.
  it('rejects a RUC whose check digit was changed (AC4)', () => {
    expect(
      purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, supplierRuc: '20100128057' }).success,
    ).toBe(false);
  });

  it('rejects a RUC of ten digits (AC4)', () => {
    expect(
      purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, supplierRuc: '2010012805' }).success,
    ).toBe(false);
  });

  it('rejects a RUC whose prefix is not a taxpayer type, like 11 (AC4)', () => {
    expect(
      purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, supplierRuc: '11100128056' }).success,
    ).toBe(false);
  });

  it('rejects a RUC with letters (AC4)', () => {
    expect(
      purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, supplierRuc: '2010012805X' }).success,
    ).toBe(false);
  });

  it('hangs the RUC error on its own field, not on the root', () => {
    const parsed = purchaseReceiptSchema.safeParse({
      ...VALID_RECEIPT,
      supplierRuc: '20100128057',
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['supplierRuc']);
  });

  it('rejects a supplier name of two characters', () => {
    expect(purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, supplierName: 'ab' }).success).toBe(
      false,
    );
  });

  it('rejects a supplier name of 161 characters', () => {
    expect(
      purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, supplierName: 'a'.repeat(161) }).success,
    ).toBe(false);
  });

  it('trims the surrounding whitespace of the supplier name', () => {
    const parsed = purchaseReceiptSchema.parse({
      ...VALID_RECEIPT,
      supplierName: '  Proveedor SAC  ',
    });

    expect(parsed.supplierName).toBe('Proveedor SAC');
  });

  it('uppercases the series: the paper prints F001, not f001', () => {
    const parsed = purchaseReceiptSchema.parse({
      ...VALID_RECEIPT,
      series: 'f001',
      number: '00001234',
    });

    expect(parsed.series).toBe('F001');
  });

  it('keeps the leading zeros of the correlative: it is a string, not an integer (D-14)', () => {
    const parsed = purchaseReceiptSchema.parse({
      ...VALID_RECEIPT,
      series: 'F001',
      number: '00001234',
    });

    expect(parsed.number).toBe('00001234');
  });

  it('rejects a series of five characters', () => {
    expect(
      purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, series: 'F0011', number: '1' }).success,
    ).toBe(false);
  });

  it('rejects a correlative that is not digits', () => {
    expect(
      purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, series: 'F001', number: '12-34' })
        .success,
    ).toBe(false);
  });

  it('rejects a series with no number (AC12)', () => {
    expect(purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, series: 'F001' }).success).toBe(
      false,
    );
  });

  it('rejects a number with no series (AC12)', () => {
    expect(purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, number: '00001234' }).success).toBe(
      false,
    );
  });

  it('accepts both of them together (AC12)', () => {
    expect(
      purchaseReceiptSchema.safeParse({ ...VALID_RECEIPT, series: 'F001', number: '00001234' })
        .success,
    ).toBe(true);
  });

  // AC7: no hay ningún camino en el que el cliente fije el impuesto.
  it('drops an igvCents smuggled into the receipt (AC7)', () => {
    const parsed = purchaseReceiptSchema.parse({ ...VALID_RECEIPT, igvCents: 999 });

    expect(parsed).not.toHaveProperty('igvCents');
  });
});

describe('createExpenseSchema', () => {
  // El día se fija para que «hoy» y «mañana» sean deterministas: el schema compara
  // contra `new Date()` porque la validación de fecha futura no admite inyectar el
  // reloj a través de Zod.
  const TODAY = '2026-09-16';
  const TOMORROW = '2026-09-17';

  const valid = {
    concept: 'Alquiler del almacén',
    amountCents: 150_000,
    category: 'rent',
    incurredOn: TODAY,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T17:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // El alta sin comprobante sigue produciendo exactamente lo de antes del spec 024, más
  // el `receipt: null` que el resto del código espera en vez de un `undefined` (AC3).
  it('accepts a well-formed expense and defaults the receipt to null (AC3)', () => {
    expect(createExpenseSchema.parse(valid)).toEqual({ ...valid, receipt: null });
  });

  it('accepts an explicit receipt: null exactly like an omitted one (AC3)', () => {
    expect(createExpenseSchema.parse({ ...valid, receipt: null }).receipt).toBeNull();
  });

  it('accepts a well-formed receipt and keeps it in the output', () => {
    const parsed = createExpenseSchema.parse({ ...valid, receipt: VALID_RECEIPT });

    expect(parsed.receipt).toEqual(VALID_RECEIPT);
  });

  it('rejects the whole body when the receipt RUC is invalid: no row is inserted (AC4)', () => {
    expect(
      createExpenseSchema.safeParse({
        ...valid,
        receipt: { ...VALID_RECEIPT, supplierRuc: '20100128057' },
      }).success,
    ).toBe(false);
  });

  it('rejects the whole body when the receipt is incomplete (AC5)', () => {
    expect(
      createExpenseSchema.safeParse({
        ...valid,
        receipt: { type: 'factura', supplierRuc: VALID_RUC },
      }).success,
    ).toBe(false);
  });

  // AC7: el cuerpo se acepta —Zod no es estricto— pero el campo no llega a la salida, así
  // que no existe un camino por el que el cliente fije el impuesto.
  it('accepts a body carrying igvCents but never propagates it to the parsed output (AC7)', () => {
    const parsed = createExpenseSchema.parse({ ...valid, igvCents: 999 });

    expect(parsed).not.toHaveProperty('igvCents');
  });

  it('never propagates a receipt.igvCents either (AC7)', () => {
    const parsed = createExpenseSchema.parse({
      ...valid,
      receipt: { ...VALID_RECEIPT, igvCents: 777 },
    });

    expect(parsed.receipt).not.toHaveProperty('igvCents');
  });

  it('trims the surrounding whitespace of the concept', () => {
    const parsed = createExpenseSchema.parse({ ...valid, concept: '  Alquiler  ' });

    expect(parsed.concept).toBe('Alquiler');
  });

  it('rejects a concept of two characters', () => {
    expect(createExpenseSchema.safeParse({ ...valid, concept: 'ab' }).success).toBe(false);
  });

  it('rejects a concept of 161 characters', () => {
    expect(createExpenseSchema.safeParse({ ...valid, concept: 'a'.repeat(161) }).success).toBe(
      false,
    );
  });

  it('accepts a concept of exactly 160 characters', () => {
    expect(createExpenseSchema.safeParse({ ...valid, concept: 'a'.repeat(160) }).success).toBe(
      true,
    );
  });

  it('rejects an amount of 0 (AC12)', () => {
    expect(createExpenseSchema.safeParse({ ...valid, amountCents: 0 }).success).toBe(false);
  });

  it('rejects a negative amount (AC12)', () => {
    expect(createExpenseSchema.safeParse({ ...valid, amountCents: -1 }).success).toBe(false);
  });

  it('rejects an amount with decimals: there is no half a cent (AC12)', () => {
    expect(createExpenseSchema.safeParse({ ...valid, amountCents: 10.5 }).success).toBe(false);
  });

  it('rejects an amount above the sanity cap, which would overflow the int4 column', () => {
    expect(
      createExpenseSchema.safeParse({ ...valid, amountCents: MAX_EXPENSE_AMOUNT_CENTS + 1 })
        .success,
    ).toBe(false);
  });

  it('accepts exactly the sanity cap', () => {
    expect(
      createExpenseSchema.safeParse({ ...valid, amountCents: MAX_EXPENSE_AMOUNT_CENTS }).success,
    ).toBe(true);
  });

  it('rejects a category outside the enum: payroll belongs to spec 018', () => {
    expect(createExpenseSchema.safeParse({ ...valid, category: 'payroll' }).success).toBe(false);
  });

  it('accepts an expense dated today in Lima', () => {
    expect(createExpenseSchema.safeParse({ ...valid, incurredOn: TODAY }).success).toBe(true);
  });

  it('accepts an expense dated in the past', () => {
    expect(createExpenseSchema.safeParse({ ...valid, incurredOn: '2026-01-05' }).success).toBe(
      true,
    );
  });

  it('rejects an expense dated tomorrow (AC13)', () => {
    expect(createExpenseSchema.safeParse({ ...valid, incurredOn: TOMORROW }).success).toBe(false);
  });

  it('still accepts today in Lima when UTC has already rolled to the next day (AC13)', () => {
    // 2026-09-16 21:00 en Lima es 2026-09-17T02:00Z.
    vi.setSystemTime(new Date('2026-09-17T02:00:00.000Z'));

    expect(createExpenseSchema.safeParse({ ...valid, incurredOn: TODAY }).success).toBe(true);
  });
});

describe('updateExpenseSchema', () => {
  it('accepts a single field', () => {
    expect(updateExpenseSchema.parse({ concept: 'Alquiler de octubre' })).toEqual({
      concept: 'Alquiler de octubre',
    });
  });

  it('rejects an empty body: there would be nothing to update', () => {
    expect(updateExpenseSchema.safeParse({}).success).toBe(false);
  });

  it('keeps the amount rules of the create schema (AC12)', () => {
    expect(updateExpenseSchema.safeParse({ amountCents: 0 }).success).toBe(false);
  });

  // Las tres semánticas del PATCH. La primera es la que el `default(null)` del alta
  // rompería si se heredase tal cual: omitir tiene que llegar como ausente, no como null.
  it('leaves the receipt key absent when it is omitted: omitting is not deleting (AC11)', () => {
    const parsed = updateExpenseSchema.parse({ amountCents: 500 });

    expect('receipt' in parsed).toBe(false);
  });

  it('keeps an explicit receipt: null as null, which means delete it (AC10)', () => {
    expect(updateExpenseSchema.parse({ receipt: null })).toEqual({ receipt: null });
  });

  it('distinguishes receipt: null from an omitted receipt (AC10, AC11)', () => {
    const cleared = updateExpenseSchema.parse({ receipt: null });
    const untouched = updateExpenseSchema.parse({ concept: 'Alquiler de octubre' });

    expect(cleared.receipt).toBeNull();
    expect(untouched.receipt).toBeUndefined();
  });

  it('accepts a receipt with a value', () => {
    expect(updateExpenseSchema.parse({ receipt: VALID_RECEIPT }).receipt).toEqual(VALID_RECEIPT);
  });

  it('keeps the RUC rules of the create schema (AC4)', () => {
    expect(
      updateExpenseSchema.safeParse({ receipt: { ...VALID_RECEIPT, supplierRuc: '20100128057' } })
        .success,
    ).toBe(false);
  });

  // El `default(null)` heredado también habría roto esto: `{}` habría parseado a
  // `{ receipt: null }`, con una clave, y el cuerpo vacío habría dejado de serlo.
  it('still rejects an empty body now that the create schema has a defaulted field', () => {
    expect(updateExpenseSchema.safeParse({}).success).toBe(false);
  });

  it('never propagates an igvCents in the patch either (AC7)', () => {
    const parsed = updateExpenseSchema.parse({ amountCents: 500, igvCents: 999 });

    expect(parsed).not.toHaveProperty('igvCents');
  });
});

describe('expenseIdSchema', () => {
  it('accepts a uuid', () => {
    expect(expenseIdSchema.safeParse('11111111-1111-4111-8111-111111111111').success).toBe(true);
  });

  it('rejects anything that is not a uuid', () => {
    expect(expenseIdSchema.safeParse('42').success).toBe(false);
  });
});
