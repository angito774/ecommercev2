import { describe, expect, it } from 'vitest';

import {
  adminOrderQuerySchema,
  cancelOrderSchema,
  orderIdSchema,
  shippingAddressSchema,
} from './admin-order.schema';

describe('adminOrderQuerySchema', () => {
  it('applies every default when the query string is empty', () => {
    const result = adminOrderQuerySchema.parse({});

    expect(result).toEqual({ status: 'all', page: 1, pageSize: 20 });
  });

  it('coerces the numeric params that arrive as strings from the query string', () => {
    const result = adminOrderQuerySchema.parse({ page: '3', pageSize: '50' });

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it('accepts the maximum allowed pageSize', () => {
    expect(adminOrderQuerySchema.parse({ pageSize: '100' }).pageSize).toBe(100);
  });

  it('rejects a pageSize above the cap', () => {
    expect(() => adminOrderQuerySchema.parse({ pageSize: '101' })).toThrow();
  });

  it('rejects a pageSize below one', () => {
    expect(() => adminOrderQuerySchema.parse({ pageSize: '0' })).toThrow();
  });

  it('rejects a page below one', () => {
    expect(() => adminOrderQuerySchema.parse({ page: '0' })).toThrow();
  });

  it('rejects a fractional pageSize', () => {
    expect(() => adminOrderQuerySchema.parse({ pageSize: '20.5' })).toThrow();
  });

  it('accepts a range where dateFrom precedes dateTo', () => {
    const result = adminOrderQuerySchema.parse({
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-01-31T23:59:59.999Z',
    });

    expect(result.dateFrom).toBe('2026-01-01T00:00:00.000Z');
    expect(result.dateTo).toBe('2026-01-31T23:59:59.999Z');
  });

  it('accepts a range collapsed to a single instant', () => {
    const value = '2026-01-01T00:00:00.000Z';
    const result = adminOrderQuerySchema.parse({ dateFrom: value, dateTo: value });

    expect(result.dateFrom).toBe(value);
  });

  it('rejects an inverted range (AC6)', () => {
    expect(() =>
      adminOrderQuerySchema.parse({
        dateFrom: '2026-02-01T00:00:00.000Z',
        dateTo: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow('La fecha inicial no puede ser posterior a la final');
  });

  it('reports the inverted range on the dateFrom path', () => {
    const result = adminOrderQuerySchema.safeParse({
      dateFrom: '2026-02-01T00:00:00.000Z',
      dateTo: '2026-01-01T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['dateFrom']);
  });

  it('accepts dateFrom alone, with no upper bound to compare against', () => {
    const result = adminOrderQuerySchema.parse({ dateFrom: '2026-02-01T00:00:00.000Z' });

    expect(result.dateTo).toBeUndefined();
  });

  it('rejects a plain date without time', () => {
    expect(() => adminOrderQuerySchema.parse({ dateFrom: '2026-01-01' })).toThrow();
  });

  it('accepts every member of the status enum', () => {
    for (const status of ['all', 'pending', 'paid', 'payment_failed', 'canceled'] as const) {
      expect(adminOrderQuerySchema.parse({ status }).status).toBe(status);
    }
  });

  it('rejects a status outside the enum', () => {
    expect(() => adminOrderQuerySchema.parse({ status: 'shipped' })).toThrow();
  });

  it('trims the customer search term', () => {
    expect(adminOrderQuerySchema.parse({ customerSearch: '  nina  ' }).customerSearch).toBe('nina');
  });

  it('rejects a customer search term longer than 120 characters', () => {
    expect(() => adminOrderQuerySchema.parse({ customerSearch: 'a'.repeat(121) })).toThrow();
  });

  it('keeps LIKE wildcards in the search term: escaping is the repository job', () => {
    expect(adminOrderQuerySchema.parse({ customerSearch: '50%_off' }).customerSearch).toBe(
      '50%_off',
    );
  });
});

describe('cancelOrderSchema', () => {
  it('accepts the only transition the panel defines', () => {
    expect(cancelOrderSchema.parse({ status: 'canceled' })).toEqual({ status: 'canceled' });
  });

  it('rejects "paid": the literal is what closes the back door (D-2)', () => {
    expect(() => cancelOrderSchema.parse({ status: 'paid' })).toThrow();
  });

  it('rejects "pending"', () => {
    expect(() => cancelOrderSchema.parse({ status: 'pending' })).toThrow();
  });

  it('rejects an empty body', () => {
    expect(() => cancelOrderSchema.parse({})).toThrow();
  });
});

describe('orderIdSchema', () => {
  it('accepts a valid uuid', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(orderIdSchema.parse(id)).toBe(id);
  });

  it('rejects a value that is not a uuid', () => {
    expect(() => orderIdSchema.parse('not-a-uuid')).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => orderIdSchema.parse('')).toThrow();
  });
});

describe('shippingAddressSchema', () => {
  it('accepts the shape that readShippingAddress writes', () => {
    const value = {
      name: 'Nelson Nina',
      address: {
        line1: 'Av. Siempre Viva 742',
        line2: null,
        city: 'Lima',
        state: null,
        postal_code: '15001',
        country: 'PE',
      },
    };

    expect(shippingAddressSchema.parse(value)).toEqual(value);
  });

  it('accepts an address with every field null', () => {
    const value = { name: null, address: { line1: null } };
    const result = shippingAddressSchema.safeParse(value);

    expect(result.success).toBe(true);
  });

  it('rejects a value with no address object', () => {
    expect(shippingAddressSchema.safeParse({ name: 'Nelson' }).success).toBe(false);
  });

  it('rejects null: an order that never reached paid has no address (AC11)', () => {
    expect(shippingAddressSchema.safeParse(null).success).toBe(false);
  });

  it('rejects a foreign shape where address is a plain string', () => {
    expect(shippingAddressSchema.safeParse({ address: 'Lima' }).success).toBe(false);
  });
});
