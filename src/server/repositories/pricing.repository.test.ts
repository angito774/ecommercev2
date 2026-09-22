import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildPricingFilters } from './pricing.repository';

// El dialecto real compila el árbol a texto y parámetros, así que las aserciones miran el
// WHERE que llegaría a Postgres en vez de la forma interna del objeto. Sin mocks:
// `PgDialect` es la misma pieza que usa Drizzle para emitir la consulta.
const dialect = new PgDialect();

function compile(filters: SQL) {
  return dialect.sqlToQuery(filters);
}

const NO_FILTERS = {} as const;

describe('buildPricingFilters', () => {
  it('always filters out the inactive products, even with no search (AC21)', () => {
    const query = compile(buildPricingFilters(NO_FILTERS));

    expect(query.sql).toContain('"is_active"');
    expect(query.params).toEqual([true]);
  });

  it('adds nothing else without a search: the whole active catalogue is the answer', () => {
    const query = compile(buildPricingFilters(NO_FILTERS));

    expect(query.sql).not.toContain('"name"');
    expect(query.sql).not.toContain('"sku"');
  });

  it('always builds a defined WHERE: an unbounded listing would be the whole table', () => {
    expect(buildPricingFilters(NO_FILTERS)).toBeInstanceOf(SQL);
  });

  it('searches by name and by sku, not by one or the other (AC22)', () => {
    const query = compile(buildPricingFilters({ search: 'teclado' }));

    expect(query.sql).toContain('"name"');
    expect(query.sql).toContain('"sku"');
    expect(query.sql).toContain(' or ');
  });

  it('keeps the invariant alongside the search, joined with and', () => {
    const query = compile(buildPricingFilters({ search: 'teclado' }));

    expect(query.sql).toContain('"is_active"');
    expect(query.sql).toContain(' and ');
  });

  it('searches case-insensitively, because nobody types the SKU in lower case', () => {
    const query = compile(buildPricingFilters({ search: 'len-ip3' }));

    expect(query.sql).toContain('ilike');
  });

  it('escapes the LIKE wildcards: a term with % must not return the whole table (AC22)', () => {
    const query = compile(buildPricingFilters({ search: '50%_off' }));

    expect(query.params).toEqual([true, '%50\\%\\_off%', '%50\\%\\_off%']);
  });

  it('sends the pattern as a parameter, never interpolated into the SQL text', () => {
    const query = compile(buildPricingFilters({ search: "o'brien" }));

    expect(query.sql).not.toContain("o'brien");
    expect(query.params).toContain("%o'brien%");
  });

  it('wraps the term in wildcards on both sides, so it matches mid-name', () => {
    const query = compile(buildPricingFilters({ search: 'ideapad' }));

    expect(query.params).toContain('%ideapad%');
  });
});
