import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  buildAverageCostExpression,
  buildInitialCostFilter,
  buildStockChangeExpression,
  buildStockChangeFilter,
} from './product.repository';

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

// La aritmética del promedio vive en SQL y ningún test unitario la ejecuta (spec 021
// §10): estos casos fijan la **forma** de la expresión —las tres piezas de las que
// depende cada regla de §6.4— y la aritmética se comprueba contra la base real (T13).
describe('buildAverageCostExpression', () => {
  const QUANTITY = 10;
  const UNIT_COST = 12_000;

  it('averages against the previous columns, never against values read beforehand (D-7)', () => {
    const query = compile(buildAverageCostExpression(QUANTITY, UNIT_COST));

    expect(query.sql).toContain('"stock"');
    expect(query.sql).toContain('"average_cost_cents"');
  });

  it('clamps a negative stock to zero, so an oversold product never weights negatively (AC10)', () => {
    const query = compile(buildAverageCostExpression(QUANTITY, UNIT_COST));

    expect(query.sql).toMatch(/greatest\("products"\."stock", 0\)/);
  });

  it('values the pre-existing stock at the cost of this purchase when there is none yet (AC8)', () => {
    const query = compile(buildAverageCostExpression(QUANTITY, UNIT_COST));

    expect(query.sql).toMatch(/coalesce\("products"\."average_cost_cents", \$\d\)/);
  });

  it('computes in numeric: the numerator reaches 1e14 and overflows int4', () => {
    const query = compile(buildAverageCostExpression(QUANTITY, UNIT_COST));

    expect(query.sql).toContain('::numeric');
  });

  it('stores an integer number of cents, rounded to the nearest one (AC12)', () => {
    const query = compile(buildAverageCostExpression(QUANTITY, UNIT_COST));

    expect(query.sql).toMatch(/^round\(/);
    expect(query.sql).toMatch(/\)::integer$/);
  });

  it('clamps the stock in the denominator too, so it can never be cancelled out (AC10)', () => {
    const query = compile(buildAverageCostExpression(QUANTITY, UNIT_COST));

    const denominator = query.sql.slice(query.sql.lastIndexOf('/'));

    expect(denominator).toContain('greatest');
  });

  it('sends the quantity and the cost as parameters, not interpolated into the SQL text', () => {
    const query = compile(buildAverageCostExpression(QUANTITY, UNIT_COST));

    expect(query.params).toEqual([UNIT_COST, QUANTITY, UNIT_COST, QUANTITY]);
    expect(query.sql).not.toContain(String(UNIT_COST));
    expect(query.sql).not.toContain(String(QUANTITY));
  });

  it('always builds a defined expression', () => {
    expect(buildAverageCostExpression(1, 1)).toBeInstanceOf(SQL);
  });
});

describe('buildInitialCostFilter', () => {
  it('narrows by the product id', () => {
    const query = compile(buildInitialCostFilter(PRODUCT_ID));

    expect(query.sql).toContain('"id"');
    expect(query.params).toEqual([PRODUCT_ID]);
  });

  it('guards "no cost yet" inside the WHERE, which is what serialises two callers (AC14)', () => {
    const query = compile(buildInitialCostFilter(PRODUCT_ID));

    expect(query.sql).toContain('"average_cost_cents" is null');
  });

  it('keeps both conditions: the guard alone would touch every product without cost', () => {
    const query = compile(buildInitialCostFilter(PRODUCT_ID));

    expect(query.sql).toContain(' and ');
  });

  it('always builds a defined WHERE: an unbounded UPDATE would touch the whole table', () => {
    expect(buildInitialCostFilter(PRODUCT_ID)).toBeInstanceOf(SQL);
  });
});
