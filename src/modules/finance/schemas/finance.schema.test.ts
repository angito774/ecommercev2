import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createExpenseSchema,
  expenseIdSchema,
  expenseQuerySchema,
  financeRangeSchema,
  MAX_EXPENSE_AMOUNT_CENTS,
  updateExpenseSchema,
} from './finance.schema';

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

  it('accepts a well-formed expense', () => {
    expect(createExpenseSchema.parse(valid)).toEqual(valid);
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
});

describe('expenseIdSchema', () => {
  it('accepts a uuid', () => {
    expect(expenseIdSchema.safeParse('11111111-1111-4111-8111-111111111111').success).toBe(true);
  });

  it('rejects anything that is not a uuid', () => {
    expect(expenseIdSchema.safeParse('42').success).toBe(false);
  });
});
