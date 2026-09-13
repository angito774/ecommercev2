import { describe, expect, it } from 'vitest';

import { orderHistoryQuerySchema, orderIdParamSchema } from './order-history.schema';

describe('orderHistoryQuerySchema', () => {
  it('parses an empty object (both bounds omitted)', () => {
    const result = orderHistoryQuerySchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts a valid range where "from" is before "to"', () => {
    const result = orderHistoryQuerySchema.parse({
      from: '2024-01-01T00:00:00.000Z',
      to: '2024-01-31T23:59:59.999Z',
    });

    expect(result).toEqual({
      from: '2024-01-01T00:00:00.000Z',
      to: '2024-01-31T23:59:59.999Z',
    });
  });

  it('accepts a range where "from" and "to" are the same instant', () => {
    const value = '2024-01-01T00:00:00.000Z';
    const result = orderHistoryQuerySchema.parse({ from: value, to: value });
    expect(result).toEqual({ from: value, to: value });
  });

  it('rejects a range where "from" is after "to"', () => {
    expect(() =>
      orderHistoryQuerySchema.parse({
        from: '2024-02-01T00:00:00.000Z',
        to: '2024-01-01T00:00:00.000Z',
      }),
    ).toThrow('La fecha inicial no puede ser posterior a la final');
  });

  it('accepts only "from" without "to"', () => {
    const result = orderHistoryQuerySchema.parse({ from: '2024-01-01T00:00:00.000Z' });
    expect(result.from).toBe('2024-01-01T00:00:00.000Z');
    expect(result.to).toBeUndefined();
  });

  it('accepts only "to" without "from"', () => {
    const result = orderHistoryQuerySchema.parse({ to: '2024-01-31T23:59:59.999Z' });
    expect(result.to).toBe('2024-01-31T23:59:59.999Z');
    expect(result.from).toBeUndefined();
  });

  it('rejects a plain date without time for "from"', () => {
    expect(() => orderHistoryQuerySchema.parse({ from: '2024-01-01' })).toThrow();
  });

  it('rejects a non-date string for "to"', () => {
    expect(() => orderHistoryQuerySchema.parse({ to: 'not-a-date' })).toThrow();
  });
});

describe('orderIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(orderIdParamSchema.parse(id)).toBe(id);
  });

  it('rejects a value that is not a UUID', () => {
    expect(() => orderIdParamSchema.parse('not-a-uuid')).toThrow();
  });

  it('rejects a non-string value', () => {
    expect(() => orderIdParamSchema.parse(12345)).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => orderIdParamSchema.parse('')).toThrow();
  });
});
