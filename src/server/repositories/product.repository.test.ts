import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildStockChangeExpression, buildStockChangeFilter } from './product.repository';

// El dialecto real compila el árbol a texto y parámetros, así que las aserciones miran
// lo que llegaría a Postgres en vez de la forma interna del objeto. Sin mocks:
// `PgDialect` es la misma pieza que usa Drizzle para emitir la consulta.
const dialect = new PgDialect();

function compile(fragment: SQL) {
  return dialect.sqlToQuery(fragment);
}

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

describe('buildStockChangeFilter', () => {
  it('always narrows by the product id', () => {
    const query = compile(buildStockChangeFilter({ productId: PRODUCT_ID, delta: 5 }));

    expect(query.sql).toContain('"id"');
    expect(query.params).toContain(PRODUCT_ID);
  });

  it('adds no stock condition for an inbound movement: an entry cannot run short (D-7)', () => {
    const query = compile(buildStockChangeFilter({ productId: PRODUCT_ID, delta: 5 }));

    expect(query.sql).not.toContain('"stock"');
  });

  it('guards the stock for an outbound movement, inside the WHERE (D-7, AC5)', () => {
    const query = compile(buildStockChangeFilter({ productId: PRODUCT_ID, delta: -5 }));

    expect(query.sql).toMatch(/"stock" >= \$\d/);
  });

  it('guards with the absolute value of the delta, as a parameter', () => {
    const query = compile(buildStockChangeFilter({ productId: PRODUCT_ID, delta: -5 }));

    expect(query.params).toEqual([PRODUCT_ID, 5]);
    expect(query.sql).not.toContain('-5');
  });

  it('uses ">=" so a movement of exactly the remaining stock is allowed', () => {
    const query = compile(buildStockChangeFilter({ productId: PRODUCT_ID, delta: -3 }));

    expect(query.sql).toContain('>=');
    expect(query.sql).not.toMatch(/"stock" > \$\d/);
  });

  it('adds no stock condition for a zero delta: there is nothing to run short of', () => {
    const query = compile(buildStockChangeFilter({ productId: PRODUCT_ID, delta: 0 }));

    expect(query.sql).not.toContain('"stock"');
  });

  it('always builds a defined WHERE: an unbounded UPDATE would touch the whole table', () => {
    expect(buildStockChangeFilter({ productId: PRODUCT_ID, delta: -1 })).toBeInstanceOf(SQL);
  });
});

describe('buildStockChangeExpression', () => {
  it('sets the stock relative to the column, never to a value read beforehand (D-7)', () => {
    const query = compile(buildStockChangeExpression(5));

    expect(query.sql).toContain('"stock" + $1');
  });

  it('sends the delta as a parameter, not interpolated into the SQL text', () => {
    const query = compile(buildStockChangeExpression(7));

    expect(query.params).toEqual([7]);
    expect(query.sql).not.toContain('7');
  });

  it('keeps the sign of an outbound movement in the parameter, still adding in SQL', () => {
    const query = compile(buildStockChangeExpression(-5));

    expect(query.sql).toContain('"stock" + $1');
    expect(query.params).toEqual([-5]);
  });
});
