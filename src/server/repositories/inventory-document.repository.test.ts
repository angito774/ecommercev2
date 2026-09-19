import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildDocumentFilters, insertDocument, insertMovements } from './inventory-document.repository';

// El dialecto real compila el árbol a texto y parámetros, así que las aserciones miran
// el WHERE que llegaría a Postgres en vez de la forma interna del objeto.
const dialect = new PgDialect();

function compile(filters: SQL) {
  return dialect.sqlToQuery(filters);
}

const NO_FILTERS = { direction: 'all' } as const;

describe('buildDocumentFilters', () => {
  it('builds no WHERE at all without filters: the full list is a legitimate answer', () => {
    expect(buildDocumentFilters(NO_FILTERS)).toBeUndefined();
  });

  it('does not filter by direction with the "all" sentinel', () => {
    expect(buildDocumentFilters({ direction: 'all', search: 'F001' })).toBeInstanceOf(SQL);
    expect(compile(buildDocumentFilters({ direction: 'all', search: 'F001' }) as SQL).sql).not.toContain(
      '"tipotrans"',
    );
  });

  it('filters inbound documents by tipotrans of the catalogue (AC12)', () => {
    const query = compile(buildDocumentFilters({ direction: 'ingreso' }) as SQL);

    expect(query.sql).toContain('"tipotrans"');
    expect(query.params).toContain('ingreso');
  });

  it('filters outbound documents by tipotrans of the catalogue (AC12)', () => {
    const query = compile(buildDocumentFilters({ direction: 'salida' }) as SQL);

    expect(query.sql).toContain('"tipotrans"');
    expect(query.params).toContain('salida');
  });

  it('bounds the range on doc_date with both ends inclusive (AC12)', () => {
    const query = compile(
      buildDocumentFilters({ ...NO_FILTERS, from: '2026-09-01', to: '2026-09-30' }) as SQL,
    );

    expect(query.sql).toMatch(/"doc_date" >= \$\d/);
    expect(query.sql).toMatch(/"doc_date" <= \$\d/);
    expect(query.params).toEqual(['2026-09-01', '2026-09-30']);
  });

  it('accepts a single open end', () => {
    const query = compile(buildDocumentFilters({ ...NO_FILTERS, from: '2026-09-01' }) as SQL);

    expect(query.sql).toMatch(/"doc_date" >= \$\d/);
    expect(query.sql).not.toMatch(/"doc_date" <= \$\d/);
  });

  it('searches the reference case-insensitively with a wildcard parameter', () => {
    const query = compile(buildDocumentFilters({ ...NO_FILTERS, search: 'F001' }) as SQL);

    expect(query.sql).toContain('"reference"');
    expect(query.sql).toContain('ilike');
    expect(query.params).toContain('%F001%');
  });

  it('escapes LIKE wildcards so they are searched literally (AC13)', () => {
    const query = compile(buildDocumentFilters({ ...NO_FILTERS, search: '50%_off' }) as SQL);

    expect(query.params).toContain('%50\\%\\_off%');
  });

  it('treats an empty search as no filter at all', () => {
    expect(buildDocumentFilters({ ...NO_FILTERS, search: '   ' })).toBeUndefined();
  });

  it('never searches over the document number: that filter is out of scope (§11)', () => {
    const query = compile(buildDocumentFilters({ ...NO_FILTERS, search: '137' }) as SQL);

    expect(query.sql).not.toContain('"doc_number"');
  });

  it('combines every filter into a single WHERE', () => {
    const query = compile(
      buildDocumentFilters({
        direction: 'salida',
        from: '2026-09-01',
        to: '2026-09-30',
        search: 'F001',
      }) as SQL,
    );

    expect(query.sql).toContain(' and ');
    expect(query.params).toEqual(['salida', '2026-09-01', '2026-09-30', '%F001%']);
  });
});

describe('the mutators', () => {
  // La firma es lo que impide registrar un documento fuera de la transacción de su
  // efecto en stock y de su entrada en la bitácora: ninguno de los dos acepta el `db`
  // global, y eso se comprueba en el tipo, no en tiempo de ejecución.
  it('take the transaction handle as their first parameter', () => {
    expect(insertDocument.length).toBe(2);
    expect(insertMovements.length).toBe(2);
  });
});
