import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import type { AdminOrderQueryParams } from '@/modules/orders/schemas/admin-order.schema';

import { buildAdminOrderFilters } from './order.repository';

// El dialecto real compila el árbol a texto y parámetros, así que las aserciones
// miran el WHERE que llegaría a Postgres en vez de la forma interna del objeto. Sin
// mocks: `PgDialect` es la misma pieza que usa Drizzle para emitir la consulta.
const dialect = new PgDialect();

function compile(filters: SQL | undefined) {
  if (!filters) throw new Error('se esperaba un WHERE definido');
  return dialect.sqlToQuery(filters);
}

const NO_FILTERS: AdminOrderQueryParams = { status: 'all', page: 1, pageSize: 20 };

describe('buildAdminOrderFilters', () => {
  it('returns undefined when nothing is filtered: no WHERE at all', () => {
    expect(buildAdminOrderFilters(NO_FILTERS)).toBeUndefined();
  });

  it('treats an empty customer search as no filter', () => {
    expect(buildAdminOrderFilters({ ...NO_FILTERS, customerSearch: '' })).toBeUndefined();
  });

  it('treats a whitespace-only customer search as no filter', () => {
    expect(buildAdminOrderFilters({ ...NO_FILTERS, customerSearch: '   ' })).toBeUndefined();
  });

  it('filters by status when it is not "all"', () => {
    const query = compile(buildAdminOrderFilters({ ...NO_FILTERS, status: 'paid' }));

    expect(query.sql).toContain('"orders"."status"');
    expect(query.params).toEqual(['paid']);
  });

  it('does not filter by status with the "all" sentinel (AC7)', () => {
    const filters = buildAdminOrderFilters({ ...NO_FILTERS, status: 'all', customerSearch: 'x' });

    expect(compile(filters).sql).not.toContain('"orders"."status"');
  });

  it('bounds the lower end of the range inclusively (AC5)', () => {
    const query = compile(
      buildAdminOrderFilters({ ...NO_FILTERS, dateFrom: '2026-01-01T00:00:00.000Z' }),
    );

    // `>=` y no `>`: el extremo entra en el rango.
    expect(query.sql).toMatch(/"created_at" >= \$1/);
    // Drizzle serializa el parámetro de una `timestamptz` a texto ISO en UTC antes
    // de mandarlo al driver, así que lo que se compara es el instante exacto.
    expect(query.params).toEqual(['2026-01-01T00:00:00.000Z']);
  });

  it('bounds the upper end of the range inclusively (AC5)', () => {
    const query = compile(
      buildAdminOrderFilters({ ...NO_FILTERS, dateTo: '2026-01-31T23:59:59.999Z' }),
    );

    expect(query.sql).toMatch(/"created_at" <= \$1/);
    expect(query.params).toEqual(['2026-01-31T23:59:59.999Z']);
  });

  it('searches the customer across email, first name, last name and full name (AC8)', () => {
    const query = compile(buildAdminOrderFilters({ ...NO_FILTERS, customerSearch: 'nina' }));

    expect(query.sql).toContain('"users"."email"');
    expect(query.sql).toContain('"users"."first_name"');
    expect(query.sql).toContain('"users"."last_name"');
    expect(query.sql).toContain("concat_ws(' '");
    expect(query.params).toEqual(['%nina%', '%nina%', '%nina%', '%nina%']);
  });

  it('matches case-insensitively via ilike (AC8)', () => {
    const query = compile(buildAdminOrderFilters({ ...NO_FILTERS, customerSearch: 'NINA' }));

    expect(query.sql).toContain('ilike');
  });

  it('escapes LIKE wildcards so they are searched literally (AC9)', () => {
    const query = compile(buildAdminOrderFilters({ ...NO_FILTERS, customerSearch: '50%_off' }));

    expect(query.params).toEqual([
      '%50\\%\\_off%',
      '%50\\%\\_off%',
      '%50\\%\\_off%',
      '%50\\%\\_off%',
    ]);
  });

  it('trims the search term before wrapping it in wildcards', () => {
    const query = compile(buildAdminOrderFilters({ ...NO_FILTERS, customerSearch: '  nina  ' }));

    expect(query.params[0]).toBe('%nina%');
  });

  it('combines every filter into a single WHERE', () => {
    const query = compile(
      buildAdminOrderFilters({
        ...NO_FILTERS,
        status: 'pending',
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-01-31T23:59:59.999Z',
        customerSearch: 'nina',
      }),
    );

    expect(query.params).toEqual([
      'pending',
      '2026-01-01T00:00:00.000Z',
      '2026-01-31T23:59:59.999Z',
      '%nina%',
      '%nina%',
      '%nina%',
      '%nina%',
    ]);
    expect(query.sql).toContain(' and ');
  });

  it('never filters by user_id: orders.read spans every customer', () => {
    const query = compile(
      buildAdminOrderFilters({ ...NO_FILTERS, status: 'paid', customerSearch: 'nina' }),
    );

    expect(query.sql).not.toContain('"orders"."user_id"');
  });

  it('never hides the orders without a Stripe session, unlike the customer history (D-7)', () => {
    const query = compile(buildAdminOrderFilters({ ...NO_FILTERS, status: 'paid' }));

    expect(query.sql).not.toContain('stripe_checkout_session_id');
  });
});
