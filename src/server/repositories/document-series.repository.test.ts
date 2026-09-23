import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  buildNextNumberExpression,
  missingSeriesMessage,
  nextNumber,
} from './document-series.repository';

// El dialecto real compila el árbol a texto y parámetros, así que las aserciones miran el
// SQL que llegaría a Postgres en vez de la forma interna del objeto. Sin mocks:
// `PgDialect` es la misma pieza que usa Drizzle para emitir la consulta.
const dialect = new PgDialect();

describe('buildNextNumberExpression', () => {
  it('increments the column against itself, never against a value read in TypeScript', () => {
    const query = dialect.sqlToQuery(buildNextNumberExpression());

    expect(query.sql).toContain('"last_number"');
    expect(query.sql).toContain('+ 1');
  });

  it('sends no parameter at all: there is no number travelling from the application (AC17)', () => {
    // Un parámetro aquí significaría que el nuevo correlativo se calculó fuera del motor,
    // y dos emisiones simultáneas de la misma serie habrían leído el mismo valor previo.
    expect(dialect.sqlToQuery(buildNextNumberExpression()).params).toEqual([]);
  });
});

describe('nextNumber', () => {
  // La firma es lo que impide consumir un correlativo fuera de la transacción de la fila
  // que lo usa: no acepta el `db` global, y eso se comprueba en el tipo (AC16).
  it('takes the transaction handle as its first parameter', () => {
    expect(nextNumber.length).toBe(2);
  });
});

describe('missingSeriesMessage', () => {
  it('names the key and points at the seed instead of failing silently', () => {
    const message = missingSeriesMessage('nota_credito_factura');

    expect(message).toContain('nota_credito_factura');
    expect(message).toContain('db:seed');
  });
});
