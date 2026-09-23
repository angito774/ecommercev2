import { describe, expect, it } from 'vitest';

import { accountingQuerySchema } from './accounting.schema';

describe('accountingQuerySchema', () => {
  it('defaults to page 1 and 20 rows, with no dates', () => {
    expect(accountingQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('accepts a well-ordered range and keeps both days as given', () => {
    expect(accountingQuerySchema.parse({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      page: 1,
      pageSize: 20,
    });
  });

  it('accepts from equal to to: a single day is a valid range', () => {
    expect(
      accountingQuerySchema.safeParse({ from: '2026-09-16', to: '2026-09-16' }).success,
    ).toBe(true);
  });

  // La misma regla que `financeRangeSchema` y `expenseQuerySchema`, porque es la misma
  // función importada: las tres no pueden discrepar sobre qué rango es válido (T3).
  it('rejects an inverted range and hangs the issue on `from`', () => {
    const parsed = accountingQuerySchema.safeParse({ from: '2026-09-30', to: '2026-09-01' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['from']);
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    expect(accountingQuerySchema.safeParse({ from: '01/09/2026' }).success).toBe(false);
  });

  it('coerces the page and the page size from the query string', () => {
    expect(accountingQuerySchema.parse({ page: '3', pageSize: '50' })).toMatchObject({
      page: 3,
      pageSize: 50,
    });
  });

  it('rejects page zero and negative pages', () => {
    expect(accountingQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(accountingQuerySchema.safeParse({ page: '-1' }).success).toBe(false);
  });

  it('rejects a fractional page: half a page does not exist', () => {
    expect(accountingQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
  });

  // El tope es lo que empuja a quien quiere el rango entero hacia la exportación, que no
  // pagina, en vez de traer el registro completo en un JSON (§6.1, D-7).
  it('caps the page size at 100', () => {
    expect(accountingQuerySchema.safeParse({ pageSize: '100' }).success).toBe(true);
    expect(accountingQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
  });

  // El rango es el único filtro de esta pantalla (§3), y lo que lo hace cumplir es la
  // firma: Zod descarta lo que no declara, así que un `?category=rent` no llega al
  // repositorio.
  it('drops category, search and sortBy: the range is the only filter', () => {
    const parsed = accountingQuerySchema.parse({
      category: 'rent',
      search: 'factura',
      sortBy: 'amount',
    });

    expect(parsed).toEqual({ page: 1, pageSize: 20 });
  });
});
