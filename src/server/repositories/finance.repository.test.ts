import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildExpenseFilters, findSalesTotals } from './finance.repository';

// El dialecto real compila el árbol a texto y parámetros, así que las aserciones miran
// el SQL que llegaría a Postgres en vez de la forma interna del objeto. Sin mocks:
// `PgDialect` es la misma pieza que usa Drizzle para emitir la consulta.
const dialect = new PgDialect();

const compile = (filters: SQL) => dialect.sqlToQuery(filters);

const RANGE = { fromDay: '2026-09-01', toDay: '2026-09-30' } as const;

describe('buildExpenseFilters', () => {
  it('always bounds both ends of the range, even with no category (AC8)', () => {
    const query = compile(buildExpenseFilters(RANGE));

    expect(query.sql).toMatch(/"incurred_on" >= \$\d/);
    expect(query.sql).toMatch(/"incurred_on" <= \$\d/);
  });

  it('includes the last day of the range: the upper bound is not strict (AC8)', () => {
    const query = compile(buildExpenseFilters(RANGE));

    expect(query.sql).not.toMatch(/"incurred_on" < \$\d/);
  });

  it('sends both days as parameters, not inlined into the SQL text', () => {
    const query = compile(buildExpenseFilters(RANGE));

    expect(query.params).toContain('2026-09-01');
    expect(query.params).toContain('2026-09-30');
  });

  it('does not filter by category with the "all" sentinel (AC20)', () => {
    const query = compile(buildExpenseFilters({ ...RANGE, category: 'all' }));

    expect(query.sql).not.toContain('"category"');
  });

  it('does not filter by category when it is omitted: the summary never receives one', () => {
    const query = compile(buildExpenseFilters(RANGE));

    expect(query.sql).not.toContain('"category"');
  });

  it('filters by category when one of the enum is given', () => {
    const query = compile(buildExpenseFilters({ ...RANGE, category: 'rent' }));

    expect(query.sql).toContain('"category"');
    expect(query.params).toContain('rent');
  });

  it('keeps both ends of the range when a category is applied: it never widens the window', () => {
    const query = compile(buildExpenseFilters({ ...RANGE, category: 'suppliers' }));

    expect(query.sql).toMatch(/"incurred_on" >= \$\d/);
    expect(query.sql).toMatch(/"incurred_on" <= \$\d/);
  });

  it('combines every filter into a single WHERE, in order', () => {
    const query = compile(buildExpenseFilters({ ...RANGE, category: 'logistics' }));

    expect(query.sql).toContain(' and ');
    expect(query.params).toEqual(['2026-09-01', '2026-09-30', 'logistics']);
  });

  it('builds a defined WHERE with no category: the range is never empty', () => {
    expect(buildExpenseFilters(RANGE)).toBeInstanceOf(SQL);
  });

  it('works for a single-day range', () => {
    const query = compile(buildExpenseFilters({ fromDay: '2026-09-16', toDay: '2026-09-16' }));

    expect(query.params).toEqual(['2026-09-16', '2026-09-16']);
  });
});

// `findSalesTotals` no expone su WHERE como pieza aparte, así que se le pasa un lector
// falso que captura la consulta en vez de ejecutarla. No es un mock del dominio: es un
// sumidero que deja compilar el árbol que Drizzle habría enviado.
function captureSalesQuery(range: { from: Date; to: Date }) {
  let captured: SQL | undefined;

  const reader = {
    select: () => ({
      from: () => ({
        where: (condition: SQL) => {
          captured = condition;
          return Promise.resolve([]);
        },
      }),
    }),
  };

  // El tipo del `reader` real es el cliente Drizzle entero; aquí solo se necesita la
  // cadena `select().from().where()` que esta función recorre.
  void findSalesTotals(range, reader as never);

  if (!captured) throw new Error('findSalesTotals no construyó ningún WHERE');
  return dialect.sqlToQuery(captured);
}

describe('findSalesTotals', () => {
  const RANGE_INSTANTS = {
    from: new Date('2026-09-01T05:00:00.000Z'),
    to: new Date('2026-10-01T05:00:00.000Z'),
  };

  it('counts only paid orders (AC7)', () => {
    const query = captureSalesQuery(RANGE_INSTANTS);

    expect(query.sql).toContain('"status"');
    expect(query.params).toContain('paid');
  });

  it('opens the window with a closed lower bound on created_at', () => {
    const query = captureSalesQuery(RANGE_INSTANTS);

    expect(query.sql).toMatch(/"created_at" >= \$\d/);
  });

  it('closes the window with a strict upper bound: it is semi-open (AC6)', () => {
    const query = captureSalesQuery(RANGE_INSTANTS);

    expect(query.sql).toMatch(/"created_at" < \$\d/);
    expect(query.sql).not.toMatch(/"created_at" <= \$\d/);
  });

  // Drizzle aplica el mapper de la columna al compilar, así que el `Date` llega a
  // Postgres ya serializado a ISO. Se asierta sobre eso —lo que de verdad viaja por el
  // cable— y no sobre el objeto, que no es lo que se envía.
  it('sends both instants as parameters, serialized by the timestamptz mapper', () => {
    const query = captureSalesQuery(RANGE_INSTANTS);

    expect(query.params).toContain('2026-09-01T05:00:00.000Z');
    expect(query.params).toContain('2026-10-01T05:00:00.000Z');
  });

  it('never inlines the instants into the SQL text', () => {
    const query = captureSalesQuery(RANGE_INSTANTS);

    expect(query.sql).not.toContain('2026-09-01');
  });

  it('never touches the expenses table: sales and expenses are separate reads', () => {
    const query = captureSalesQuery(RANGE_INSTANTS);

    expect(query.sql).not.toContain('"expenses"');
  });
});
