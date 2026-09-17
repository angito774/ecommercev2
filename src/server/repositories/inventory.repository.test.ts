import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildInventoryFilters } from './inventory.repository';

// El dialecto real compila el árbol a texto y parámetros, así que las aserciones
// miran el WHERE que llegaría a Postgres en vez de la forma interna del objeto. Sin
// mocks: `PgDialect` es la misma pieza que usa Drizzle para emitir la consulta.
const dialect = new PgDialect();

function compile(filters: SQL) {
  return dialect.sqlToQuery(filters);
}

const THRESHOLD = 10;
const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const NO_FILTERS = { categoryId: 'all' } as const;

describe('buildInventoryFilters', () => {
  it('always filters out the inactive products, even with no filters (AC6)', () => {
    const query = compile(buildInventoryFilters(NO_FILTERS, THRESHOLD));

    expect(query.sql).toContain('"is_active"');
  });

  it('always bounds the stock below the threshold, even with no filters (AC4)', () => {
    const query = compile(buildInventoryFilters(NO_FILTERS, THRESHOLD));

    expect(query.sql).toContain('"stock"');
    expect(query.sql).toMatch(/"stock" < \$\d/);
  });

  it('sends the threshold as a parameter, not inlined into the SQL text', () => {
    const query = compile(buildInventoryFilters(NO_FILTERS, THRESHOLD));

    expect(query.params).toContain(THRESHOLD);
    expect(query.sql).not.toContain('10');
  });

  it('uses a strict "<" so the threshold itself is not an alert (AC4)', () => {
    const query = compile(buildInventoryFilters(NO_FILTERS, THRESHOLD));

    expect(query.sql).not.toMatch(/"stock" <= /);
  });

  it('keeps both invariants when a search is applied: they are not overridable (AC5)', () => {
    const query = compile(buildInventoryFilters({ ...NO_FILTERS, search: 'teclado' }, THRESHOLD));

    expect(query.sql).toContain('"is_active"');
    expect(query.sql).toMatch(/"stock" < \$\d/);
  });

  it('keeps both invariants when a category is applied (AC5)', () => {
    const query = compile(
      buildInventoryFilters({ categoryId: CATEGORY_ID, search: 'x' }, THRESHOLD),
    );

    expect(query.sql).toContain('"is_active"');
    expect(query.sql).toMatch(/"stock" < \$\d/);
  });

  it('searches across name and SKU with two wildcard parameters (AC9)', () => {
    const query = compile(buildInventoryFilters({ ...NO_FILTERS, search: 'teclado' }, THRESHOLD));

    expect(query.sql).toContain('"name"');
    expect(query.sql).toContain('"sku"');
    expect(query.params).toContain('%teclado%');
    expect(query.params.filter((param) => param === '%teclado%')).toHaveLength(2);
  });

  it('matches case-insensitively via ilike (AC9)', () => {
    const query = compile(buildInventoryFilters({ ...NO_FILTERS, search: 'TECLADO' }, THRESHOLD));

    expect(query.sql).toContain('ilike');
  });

  it('escapes LIKE wildcards so they are searched literally (AC9)', () => {
    const query = compile(buildInventoryFilters({ ...NO_FILTERS, search: '50%_off' }, THRESHOLD));

    expect(query.params).toContain('%50\\%\\_off%');
  });

  it('treats an empty search as no filter at all', () => {
    const query = compile(buildInventoryFilters({ ...NO_FILTERS, search: '' }, THRESHOLD));

    expect(query.sql).not.toContain('"name"');
    expect(query.sql).not.toContain('"sku"');
  });

  it('does not filter by category with the "all" sentinel (AC10)', () => {
    const query = compile(buildInventoryFilters({ ...NO_FILTERS, search: 'x' }, THRESHOLD));

    expect(query.sql).not.toContain('"category_id"');
  });

  it('filters by category when a uuid is given (AC10)', () => {
    const query = compile(buildInventoryFilters({ categoryId: CATEGORY_ID }, THRESHOLD));

    expect(query.sql).toContain('"category_id"');
    expect(query.params).toContain(CATEGORY_ID);
  });

  it('combines every filter into a single WHERE', () => {
    const query = compile(
      buildInventoryFilters({ search: 'teclado', categoryId: CATEGORY_ID }, THRESHOLD),
    );

    expect(query.sql).toContain(' and ');
    expect(query.params).toEqual([true, THRESHOLD, '%teclado%', '%teclado%', CATEGORY_ID]);
  });

  it('builds a defined WHERE even with no filters: the invariants are never empty', () => {
    expect(buildInventoryFilters(NO_FILTERS, THRESHOLD)).toBeInstanceOf(SQL);
  });

  it('carries no derived CASE expression: the status is resolved in TypeScript (D-14)', () => {
    const query = compile(buildInventoryFilters(NO_FILTERS, THRESHOLD));

    expect(query.sql).not.toContain('case');
  });
});
