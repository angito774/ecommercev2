import { describe, expect, it } from 'vitest';

import { inventoryQuerySchema } from './inventory.schema';

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';

describe('inventoryQuerySchema', () => {
  it('applies every default when the query string is empty', () => {
    expect(inventoryQuerySchema.parse({})).toEqual({
      categoryId: 'all',
      page: 1,
      pageSize: 20,
    });
  });

  it('leaves search undefined when it is not sent', () => {
    expect(inventoryQuerySchema.parse({}).search).toBeUndefined();
  });

  it('trims the search term', () => {
    expect(inventoryQuerySchema.parse({ search: '  teclado  ' }).search).toBe('teclado');
  });

  it('reduces a whitespace-only search to an empty string, which filters nothing', () => {
    expect(inventoryQuerySchema.parse({ search: '   ' }).search).toBe('');
  });

  it('keeps LIKE wildcards in the search term: escaping is the repository job (AC9)', () => {
    expect(inventoryQuerySchema.parse({ search: '50%_off' }).search).toBe('50%_off');
  });

  it('accepts a search term of exactly 160 characters', () => {
    expect(inventoryQuerySchema.parse({ search: 'a'.repeat(160) }).search).toHaveLength(160);
  });

  it('rejects a search term longer than 160 characters', () => {
    expect(() => inventoryQuerySchema.parse({ search: 'a'.repeat(161) })).toThrow();
  });

  it('accepts the "all" sentinel for categoryId (AC10)', () => {
    expect(inventoryQuerySchema.parse({ categoryId: 'all' }).categoryId).toBe('all');
  });

  it('accepts a uuid for categoryId (AC10)', () => {
    expect(inventoryQuerySchema.parse({ categoryId: CATEGORY_ID }).categoryId).toBe(CATEGORY_ID);
  });

  it('rejects a categoryId that is neither a uuid nor the sentinel', () => {
    expect(() => inventoryQuerySchema.parse({ categoryId: 'perifericos' })).toThrow();
  });

  it('rejects an empty categoryId', () => {
    expect(() => inventoryQuerySchema.parse({ categoryId: '' })).toThrow();
  });

  it('coerces the numeric params that arrive as strings from the query string', () => {
    const result = inventoryQuerySchema.parse({ page: '3', pageSize: '50' });

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it('rejects a page below one (AC11)', () => {
    expect(() => inventoryQuerySchema.parse({ page: '0' })).toThrow();
  });

  it('rejects a negative page', () => {
    expect(() => inventoryQuerySchema.parse({ page: '-1' })).toThrow();
  });

  it('rejects a fractional page', () => {
    expect(() => inventoryQuerySchema.parse({ page: '1.5' })).toThrow();
  });

  it('rejects a page that is not a number at all (AC2 checks this never runs first)', () => {
    expect(() => inventoryQuerySchema.parse({ page: 'abc' })).toThrow();
  });

  it('accepts the maximum allowed pageSize', () => {
    expect(inventoryQuerySchema.parse({ pageSize: '100' }).pageSize).toBe(100);
  });

  it('rejects a pageSize above the cap (AC11)', () => {
    expect(() => inventoryQuerySchema.parse({ pageSize: '500' })).toThrow();
  });

  it('rejects a pageSize below one', () => {
    expect(() => inventoryQuerySchema.parse({ pageSize: '0' })).toThrow();
  });

  it('exposes the failure as issues so the handler can return them in the 400 (AC11)', () => {
    const result = inventoryQuerySchema.safeParse({ page: '0' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['page']);
  });

  it('has no parameter that could widen the low-stock filter (AC5)', () => {
    const parsed = inventoryQuerySchema.parse({ search: 'x', categoryId: 'all' });

    expect(Object.keys(parsed).sort()).toEqual(['categoryId', 'page', 'pageSize', 'search']);
  });
});
