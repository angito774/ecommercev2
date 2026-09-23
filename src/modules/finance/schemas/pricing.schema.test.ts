import { describe, expect, it } from 'vitest';

import {
  initialCostFormSchema,
  pricingProductIdSchema,
  pricingQuerySchema,
  setInitialCostSchema,
} from './pricing.schema';

describe('pricingQuerySchema', () => {
  it('defaults an empty query to the first page of 20, with no search', () => {
    const result = pricingQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ page: 1, pageSize: 20 });
  });

  it('leaves `search` undefined rather than an empty string, so the WHERE stays clean', () => {
    expect(pricingQuerySchema.safeParse({}).data?.search).toBeUndefined();
  });

  it('coerces page and pageSize from the query string', () => {
    expect(pricingQuerySchema.safeParse({ page: '3', pageSize: '50' }).data).toMatchObject({
      page: 3,
      pageSize: 50,
    });
  });

  it('rejects page 0: the offset would go negative', () => {
    expect(pricingQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('rejects a non-numeric page, which is the caller’s error and not a 500', () => {
    expect(pricingQuerySchema.safeParse({ page: 'abc' }).success).toBe(false);
  });

  it('rejects a fractional page', () => {
    expect(pricingQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
  });

  it('caps pageSize so a single request cannot pull the whole catalogue', () => {
    expect(pricingQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('trims the search term', () => {
    expect(pricingQuerySchema.safeParse({ search: '  teclado  ' }).data?.search).toBe('teclado');
  });

  it('rejects a search longer than the column would ever hold', () => {
    expect(pricingQuerySchema.safeParse({ search: 'x'.repeat(200) }).success).toBe(false);
  });

  it('keeps the wildcards as written: escaping them is the repository’s job (AC22)', () => {
    expect(pricingQuerySchema.safeParse({ search: '50%_off' }).data?.search).toBe('50%_off');
  });
});

describe('setInitialCostSchema', () => {
  it('accepts a positive integer number of cents', () => {
    expect(setInitialCostSchema.safeParse({ unitCostCents: 180_000 }).success).toBe(true);
  });

  it('accepts one cent: the smallest cost a product can have', () => {
    expect(setInitialCostSchema.safeParse({ unitCostCents: 1 }).success).toBe(true);
  });

  it('accepts exactly the maximum', () => {
    expect(setInitialCostSchema.safeParse({ unitCostCents: 99_999_999 }).success).toBe(true);
  });

  // AC13. El 0 se rechaza aquí y no solo en el CHECK: un `0` diría «me costó gratis»,
  // que es justo lo que la nulabilidad de la columna existe para evitar.
  it.each([0, -1, 10.5, 100_000_000])('rejects a unitCostCents of %s (AC13)', (unitCostCents) => {
    expect(setInitialCostSchema.safeParse({ unitCostCents }).success).toBe(false);
  });

  it('rejects a missing cost: there is nothing to register', () => {
    expect(setInitialCostSchema.safeParse({}).success).toBe(false);
  });

  it('rejects the amount as a string: the API only knows integers', () => {
    expect(setInitialCostSchema.safeParse({ unitCostCents: '18000' }).success).toBe(false);
  });
});

describe('initialCostFormSchema', () => {
  it('accepts an amount in soles with two decimals', () => {
    expect(initialCostFormSchema.safeParse({ unitCost: '899.90' }).success).toBe(true);
  });

  it('accepts a whole amount with no decimal point', () => {
    expect(initialCostFormSchema.safeParse({ unitCost: '1800' }).success).toBe(true);
  });

  it('accepts one cent typed as 0.01', () => {
    expect(initialCostFormSchema.safeParse({ unitCost: '0.01' }).success).toBe(true);
  });

  it('trims what was typed', () => {
    expect(initialCostFormSchema.safeParse({ unitCost: '  899.90  ' }).data?.unitCost).toBe(
      '899.90',
    );
  });

  it.each(['0', '0.00', 'abc', '1.234', '', '-5', '1e3', '1,50'])(
    'rejects "%s"',
    (unitCost) => {
      expect(initialCostFormSchema.safeParse({ unitCost }).success).toBe(false);
    },
  );

  it('rejects more than 6 whole digits, same tope as the product price', () => {
    expect(initialCostFormSchema.safeParse({ unitCost: '1000000' }).success).toBe(false);
  });
});

describe('pricingProductIdSchema', () => {
  it('accepts a uuid', () => {
    expect(pricingProductIdSchema.safeParse('11111111-1111-4111-8111-111111111111').success).toBe(
      true,
    );
  });

  it('rejects an id that is not a uuid, so it answers 400 and never reaches the query (AC15)', () => {
    expect(pricingProductIdSchema.safeParse('LEN-IP3-15').success).toBe(false);
  });
});
