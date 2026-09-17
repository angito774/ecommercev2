import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildEmployeeFilters } from './employee.repository';

// El dialecto real compila el árbol a texto y parámetros, así que las aserciones miran
// el WHERE que llegaría a Postgres en vez de la forma interna del objeto. Sin mocks:
// `PgDialect` es la misma pieza que usa Drizzle para emitir la consulta.
const dialect = new PgDialect();

function compile(filters: SQL | undefined) {
  return filters ? dialect.sqlToQuery(filters) : null;
}

describe('buildEmployeeFilters', () => {
  it('restricts to the active staff with the default status (AC8)', () => {
    const query = compile(buildEmployeeFilters({ status: 'active' }));

    expect(query?.sql).toContain('"is_active"');
    expect(query?.params).toContain(true);
  });

  it('restricts to the former staff with the "inactive" status', () => {
    const query = compile(buildEmployeeFilters({ status: 'inactive' }));

    expect(query?.sql).toContain('"is_active"');
    expect(query?.params).toContain(false);
  });

  it('does not mention the column at all with the "all" sentinel', () => {
    expect(buildEmployeeFilters({ status: 'all' })).toBeUndefined();
  });

  it('keeps the status filter when a search is applied: one does not replace the other', () => {
    const query = compile(buildEmployeeFilters({ status: 'active', search: 'quispe' }));

    expect(query?.sql).toContain('"is_active"');
    expect(query?.sql).toContain('"last_name"');
  });

  it('searches across code, first name, last name and full name (AC9)', () => {
    const query = compile(buildEmployeeFilters({ status: 'all', search: 'ana' }));

    expect(query?.sql).toContain('"employee_code"');
    expect(query?.sql).toContain('"first_name"');
    expect(query?.sql).toContain('"last_name"');
    expect(query?.sql).toContain('concat_ws');
  });

  it('sends the same wildcard pattern to the four comparisons (AC9)', () => {
    const query = compile(buildEmployeeFilters({ status: 'all', search: 'ana' }));

    expect(query?.params.filter((param) => param === '%ana%')).toHaveLength(4);
  });

  it('matches case-insensitively via ilike (AC9)', () => {
    const query = compile(buildEmployeeFilters({ status: 'all', search: 'ANA' }));

    expect(query?.sql).toContain('ilike');
  });

  it('escapes LIKE wildcards so they are searched literally (AC9)', () => {
    const query = compile(buildEmployeeFilters({ status: 'all', search: '50%_off' }));

    expect(query?.params).toContain('%50\\%\\_off%');
  });

  it('treats an empty search as no filter at all', () => {
    expect(buildEmployeeFilters({ status: 'all', search: '' })).toBeUndefined();
  });

  it('treats a whitespace-only search as no filter at all', () => {
    expect(buildEmployeeFilters({ status: 'all', search: '   ' })).toBeUndefined();
  });

  it('combines both filters into a single WHERE', () => {
    const query = compile(buildEmployeeFilters({ status: 'active', search: 'quispe' }));

    expect(query?.sql).toContain(' and ');
  });

  it('carries no derived CASE expression: nothing is computed in SQL', () => {
    const query = compile(buildEmployeeFilters({ status: 'active', search: 'ana' }));

    expect(query?.sql).not.toContain('case');
  });
});
