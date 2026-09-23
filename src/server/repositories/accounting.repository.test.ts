import { SQL } from 'drizzle-orm';
import { alias, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { NUMBERED_DOCUMENT_KINDS } from '@/lib/electronic-documents';
import { electronicDocuments } from '@/server/db/schema';

import {
  buildPurchaseRegistryFilter,
  buildSalesRegistryFilter,
  findPurchaseRegistry,
  findSalesRegistry,
  type RegistryPagination,
} from './accounting.repository';
import { buildDeclarableFilter, buildExpenseFilters } from './finance.repository';

// El dialecto real compila el árbol a texto y parámetros, así que las aserciones miran el
// SQL que llegaría a Postgres en vez de la forma interna del objeto. Sin mocks:
// `PgDialect` es la misma pieza que usa Drizzle para emitir la consulta. Mismo estilo que
// `finance.repository.test.ts`.
const dialect = new PgDialect();

const compile = (filters: SQL) => dialect.sqlToQuery(filters);

const RANGE = {
  from: new Date('2026-09-01T05:00:00.000Z'),
  to: new Date('2026-10-01T05:00:00.000Z'),
} as const;

// Los dos días del mismo rango, que es lo que consume el Registro de Compras: `incurred_on`
// es `date` sin hora y sus dos extremos son inclusivos (AC9).
const DAY_RANGE = { fromDay: '2026-09-01', toDay: '2026-09-30' } as const;

describe('buildSalesRegistryFilter', () => {
  it('lists only what exists before SUNAT today: issued, never pending, failed or voided', () => {
    const query = compile(buildSalesRegistryFilter(RANGE));

    expect(query.sql).toMatch(/"status" = \$\d/);
    expect(query.params).toContain('issued');
  });

  it('opens the window with a closed lower bound on issued_at', () => {
    const query = compile(buildSalesRegistryFilter(RANGE));

    expect(query.sql).toMatch(/"issued_at" >= \$\d/);
  });

  // AC6: la misma ventana semiabierta que `buildDeclarableFilter()`, derivada del mismo
  // `resolveFinanceRange()`. Con el extremo cerrado, un comprobante de medianoche exacta
  // caería en el registro de dos meses.
  it('closes the window with a strict upper bound: it is semi-open (AC6)', () => {
    const query = compile(buildSalesRegistryFilter(RANGE));

    expect(query.sql).toMatch(/"issued_at" < \$\d/);
    expect(query.sql).not.toMatch(/"issued_at" <= \$\d/);
  });

  it('sends both instants as parameters, serialized by the timestamptz mapper', () => {
    const query = compile(buildSalesRegistryFilter(RANGE));

    expect(query.params).toContain('2026-09-01T05:00:00.000Z');
    expect(query.params).toContain('2026-10-01T05:00:00.000Z');
  });

  it('filters by the four numbered kinds, taken from the catalogue (AC28)', () => {
    const query = compile(buildSalesRegistryFilter(RANGE));

    expect(query.sql).toContain('"kind"');
    expect(query.params).toEqual(expect.arrayContaining([...NUMBERED_DOCUMENT_KINDS]));
  });

  // D-8: no consume serie ni número propios y no lleva importes, así que no es un
  // comprobante que cruzar contra el SIRE.
  it('leaves the comunicacion_baja out of the registry (D-8)', () => {
    const query = compile(buildSalesRegistryFilter(RANGE));

    expect(query.params).not.toContain('comunicacion_baja');
  });

  // **La aserción central del spec** (AC4, AC5, D-1). El filtro del neto exige «sin padre
  // o padre issued», y `voidsParent()` deja `voided` al original en las anulaciones más
  // frecuentes: heredarlo escondería del registro justo esas notas de crédito. Se afirma
  // primero que la disyunción sigue estando en el filtro del padre, para que este test no
  // pase en silencio el día que aquella regla cambie de forma.
  it('does not carry the parent condition of buildDeclarableFilter (AC4, D-1)', () => {
    const parent = alias(electronicDocuments, 'parent_document');
    const declarable = compile(buildDeclarableFilter(RANGE, parent));
    const registry = compile(buildSalesRegistryFilter(RANGE));

    expect(declarable.sql).toContain('"related_document_id" is null');
    expect(declarable.sql).toContain('"parent_document"."status"');

    expect(registry.sql).not.toContain('"related_document_id"');
    expect(registry.sql).not.toContain('"parent_document"');
    expect(registry.sql).not.toContain(' or ');
  });

  it('builds a defined WHERE: a sales registry without a range would list the whole table', () => {
    expect(buildSalesRegistryFilter(RANGE)).toBeInstanceOf(SQL);
  });
});

// Sumidero que captura el árbol que Drizzle habría enviado, una entrada por consulta: el
// listado construye dos —las filas y el conteo— y la exportación solo una.
type CapturedQuery = {
  select: Record<string, unknown>;
  joins: string[];
  where?: SQL;
  orderBy: SQL[];
  limit?: number;
  offset?: number;
};

function captureQueries(run: (reader: never) => unknown): CapturedQuery[] {
  const queries: CapturedQuery[] = [];

  const reader = {
    select: (selected: Record<string, unknown>) => {
      const captured: CapturedQuery = { select: selected, joins: [], orderBy: [] };
      queries.push(captured);

      const chain: Record<string, unknown> = {
        innerJoin: () => {
          captured.joins.push('inner');
          return chain;
        },
        leftJoin: () => {
          captured.joins.push('left');
          return chain;
        },
        where: (condition: SQL) => {
          captured.where = condition;
          return chain;
        },
        orderBy: (...args: SQL[]) => {
          captured.orderBy.push(...args);
          return chain;
        },
        limit: (value: number) => {
          captured.limit = value;
          return chain;
        },
        offset: (value: number) => {
          captured.offset = value;
          return chain;
        },
      };
      // Thenable, para que el `await` de la función resuelva sin base de datos.
      chain.then = (resolve: (rows: unknown[]) => void) => resolve([]);

      return { from: () => chain };
    },
  };

  void run(reader as never);

  return queries;
}

const captureSalesRegistry = (pagination: RegistryPagination) =>
  captureQueries((reader) => findSalesRegistry(RANGE, pagination, reader));

const capturePurchaseRegistry = (pagination: RegistryPagination) =>
  captureQueries((reader) => findPurchaseRegistry(DAY_RANGE, pagination, reader));

describe('findSalesRegistry', () => {
  const PAGE: RegistryPagination = { page: 3, pageSize: 20 };

  it('joins orders to read the buyer document, which electronic_documents does not store (AC8)', () => {
    const [rows] = captureSalesRegistry(PAGE);

    expect(rows.joins).toEqual(['inner', 'left']);
    expect(Object.keys(rows.select)).toEqual(
      expect.arrayContaining([
        'buyerDocumentType',
        'buyerDocumentNumber',
        'buyerLegalName',
      ]),
    );
  });

  it('reads the buyer columns from orders and never from electronic_documents (AC8)', () => {
    const [rows] = captureSalesRegistry(PAGE);
    const buyer = rows.select.buyerDocumentNumber as { name: string; table: unknown };

    expect(buyer.name).toBe('buyer_document_number');
  });

  it('projects the parent series and number, to resolve what the note corrects (AC7)', () => {
    const [rows] = captureSalesRegistry(PAGE);

    expect(Object.keys(rows.select)).toEqual(
      expect.arrayContaining(['relatedSeries', 'relatedNumber']),
    );
  });

  // D-11: un registro se lee como un libro, de la primera operación del período a la
  // última. Los tres desempates son lo que hace estable la paginación (AC13).
  it('orders chronologically ascending, with a total tie-break (AC13, D-11)', () => {
    const [rows] = captureSalesRegistry(PAGE);
    const rendered = rows.orderBy.map((clause) => dialect.sqlToQuery(clause).sql);

    expect(rendered).toHaveLength(4);
    expect(rendered[0]).toMatch(/"issued_at" asc/);
    expect(rendered[1]).toMatch(/"series" asc/);
    expect(rendered[2]).toMatch(/"number" asc/);
    expect(rendered[3]).toMatch(/"id" asc/);
  });

  it('never orders descending, unlike the rest of the finance module (D-11)', () => {
    const [rows] = captureSalesRegistry(PAGE);

    for (const clause of rows.orderBy) {
      expect(dialect.sqlToQuery(clause).sql).not.toContain(' desc');
    }
  });

  it('paginates with the offset of the requested page', () => {
    const [rows] = captureSalesRegistry(PAGE);

    expect(rows.limit).toBe(20);
    expect(rows.offset).toBe(40);
  });

  // El conteo no necesita los joins: los tres filtros viven en `electronic_documents`,
  // igual que `findManyExpenses()` cuenta sin unir `users`.
  it('counts in its own query and without the joins', () => {
    const [, totals] = captureSalesRegistry(PAGE);

    expect(totals.joins).toEqual([]);
    expect(Object.keys(totals.select)).toEqual(['value']);
  });

  it('counts with exactly the same WHERE as the listing: neither widens the range', () => {
    const [rows, totals] = captureSalesRegistry(PAGE);

    expect(dialect.sqlToQuery(totals.where as SQL).sql).toBe(
      dialect.sqlToQuery(rows.where as SQL).sql,
    );
  });

  // D-7: la exportación se lleva el rango entero y su total es lo que se acaba de traer.
  it('runs no count query and applies no limit when there is no pagination (AC19, D-7)', () => {
    const queries = captureSalesRegistry(null);

    expect(queries).toHaveLength(1);
    expect(queries[0].limit).toBeUndefined();
    expect(queries[0].offset).toBeUndefined();
  });

  it('uses the same WHERE paginated and unpaginated: the CSV lists what the table lists', () => {
    const paginated = captureSalesRegistry(PAGE)[0];
    const exported = captureSalesRegistry(null)[0];

    expect(dialect.sqlToQuery(exported.where as SQL).sql).toBe(
      dialect.sqlToQuery(paginated.where as SQL).sql,
    );
    expect(exported.orderBy).toHaveLength(paginated.orderBy.length);
  });
});

describe('buildPurchaseRegistryFilter', () => {
  it('bounds both ends of the range on incurred_on', () => {
    const query = compile(buildPurchaseRegistryFilter(DAY_RANGE));

    expect(query.sql).toMatch(/"incurred_on" >= \$\d/);
    expect(query.sql).toMatch(/"incurred_on" <= \$\d/);
  });

  // AC9: los días son inclusivos tal y como se leen. La ventana semiabierta de los
  // instantes no pinta nada sobre una columna `date` sin hora, y usarla perdería el
  // último día del rango.
  it('includes the last day: the upper bound is not strict, unlike sales (AC9)', () => {
    const query = compile(buildPurchaseRegistryFilter(DAY_RANGE));

    expect(query.sql).not.toMatch(/"incurred_on" < \$\d/);
  });

  it('sends both days as parameters, not inlined into the SQL text', () => {
    const query = compile(buildPurchaseRegistryFilter(DAY_RANGE));

    expect(query.params).toEqual(['2026-09-01', '2026-09-30']);
  });

  // AC10: un gasto sin comprobante no es una compra que cruzar contra el SIRE, y sigue
  // apareciendo en el listado de Egresos como siempre.
  it('requires a receipt type: a expense without one is not a purchase (AC10)', () => {
    const query = compile(buildPurchaseRegistryFilter(DAY_RANGE));

    expect(query.sql).toContain('"receipt_type" is not null');
  });

  // El rango es el único filtro de esta pantalla: la firma recibe `DayRange` y no
  // `ExpenseFilters`, así que no hay por dónde colar la categoría del listado de gastos.
  it('never filters by category', () => {
    const query = compile(buildPurchaseRegistryFilter(DAY_RANGE));

    expect(query.sql).not.toContain('"category"');
  });

  // D-3: lo que se importa es la definición del período, no una tercera copia que se
  // quedaría atrás el día que alguien toque la de gastos.
  it('composes buildExpenseFilters instead of rewriting the window (D-3)', () => {
    const composed = compile(buildPurchaseRegistryFilter(DAY_RANGE));
    const expenseWindow = compile(buildExpenseFilters(DAY_RANGE));

    expect(composed.sql).toContain(expenseWindow.sql);
  });

  it('builds a defined WHERE: a purchase registry without a range would list the whole table', () => {
    expect(buildPurchaseRegistryFilter(DAY_RANGE)).toBeInstanceOf(SQL);
  });
});

describe('findPurchaseRegistry', () => {
  const PAGE: RegistryPagination = { page: 2, pageSize: 20 };

  it('reads the supplier from expenses itself: there is nothing to join', () => {
    const [rows] = capturePurchaseRegistry(PAGE);

    expect(rows.joins).toEqual([]);
    expect(Object.keys(rows.select)).toEqual([
      'id',
      'incurredOn',
      'receiptType',
      'supplierRuc',
      'supplierName',
      'receiptSeries',
      'receiptNumber',
      'igvCents',
      'amountCents',
    ]);
  });

  it('orders chronologically ascending, with the three tie-breaks (AC13, D-11)', () => {
    const [rows] = capturePurchaseRegistry(PAGE);
    const rendered = rows.orderBy.map((clause) => dialect.sqlToQuery(clause).sql);

    expect(rendered).toHaveLength(3);
    expect(rendered[0]).toMatch(/"incurred_on" asc/);
    expect(rendered[1]).toMatch(/"created_at" asc/);
    expect(rendered[2]).toMatch(/"id" asc/);
  });

  it('never orders descending, unlike the expenses listing (D-11)', () => {
    const [rows] = capturePurchaseRegistry(PAGE);

    for (const clause of rows.orderBy) {
      expect(dialect.sqlToQuery(clause).sql).not.toContain(' desc');
    }
  });

  it('paginates with the offset of the requested page', () => {
    const [rows] = capturePurchaseRegistry(PAGE);

    expect(rows.limit).toBe(20);
    expect(rows.offset).toBe(20);
  });

  it('counts in its own query, with the same WHERE as the listing', () => {
    const [rows, totals] = capturePurchaseRegistry(PAGE);

    expect(Object.keys(totals.select)).toEqual(['value']);
    expect(dialect.sqlToQuery(totals.where as SQL).sql).toBe(
      dialect.sqlToQuery(rows.where as SQL).sql,
    );
  });

  it('runs no count query and applies no limit when there is no pagination (AC19, D-7)', () => {
    const queries = capturePurchaseRegistry(null);

    expect(queries).toHaveLength(1);
    expect(queries[0].limit).toBeUndefined();
    expect(queries[0].offset).toBeUndefined();
  });
});
