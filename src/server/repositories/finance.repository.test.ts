import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { TAX_CREDIT_RECEIPT_TYPES } from '@/lib/purchase-receipts';

import {
  buildExpenseFilters,
  findExpenseTotals,
  findManyExpenses,
  findSalesTotals,
} from './finance.repository';

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

// ── IGV de compras (spec 024) ───────────────────────────────────────────────

// Mismo sumidero que `captureSalesQuery`, pero guardando además el objeto de campos del
// `select`: los cuatro agregados son plantillas `sql` y se compilan una a una, que es
// exactamente el texto que llegaría a Postgres.
function captureExpenseTotals(range: { fromDay: string; toDay: string }) {
  let fields: Record<string, SQL> | undefined;
  let where: SQL | undefined;
  let grouped = false;

  const chain = {
    where: (condition: SQL) => {
      where = condition;
      return Promise.resolve([]);
    },
    groupBy: () => {
      grouped = true;
      return chain;
    },
  };

  const reader = {
    select: (selected: Record<string, SQL>) => {
      fields = selected;
      return { from: () => chain };
    },
  };

  void findExpenseTotals(range, reader as never);

  if (!fields || !where) throw new Error('findExpenseTotals no construyó la consulta');
  return { fields, where, grouped };
}

const renderField = (fields: Record<string, SQL>, key: string) =>
  dialect.sqlToQuery(fields[key]);

describe('findExpenseTotals — agregados de IGV', () => {
  it('keeps the two totals that already existed', () => {
    const { fields } = captureExpenseTotals(RANGE);

    expect(fields).toHaveProperty('expensesCents');
    expect(fields).toHaveProperty('expenseCount');
  });

  it('adds the four IGV aggregates of §5.4', () => {
    const { fields } = captureExpenseTotals(RANGE);

    expect(Object.keys(fields)).toEqual(
      expect.arrayContaining([
        'igvCreditableCents',
        'igvCreditableCount',
        'igvTotalCents',
        'igvCount',
      ]),
    );
  });

  it('renders the creditable sum as a conditional aggregate with FILTER', () => {
    const query = renderField(captureExpenseTotals(RANGE).fields, 'igvCreditableCents');

    expect(query.sql).toContain('filter (where');
    expect(query.sql).toContain('"igv_cents"');
  });

  it('renders the creditable count with FILTER too', () => {
    const query = renderField(captureExpenseTotals(RANGE).fields, 'igvCreditableCount');

    expect(query.sql).toContain('filter (where');
  });

  it('counts only rows whose IGV was actually computed, not every eligible row', () => {
    const query = renderField(captureExpenseTotals(RANGE).fields, 'igvCreditableCount');

    expect(query.sql).toContain('"igv_cents" is not null');
  });

  it('restricts the creditable aggregates by receipt_type', () => {
    const query = renderField(captureExpenseTotals(RANGE).fields, 'igvCreditableCents');

    expect(query.sql).toContain('"receipt_type"');
  });

  // AC16: el SQL lee la misma regla que la vista, y los valores viajan como parámetros.
  it('sends the eligible types as parameters, never inlined into the SQL text', () => {
    const query = renderField(captureExpenseTotals(RANGE).fields, 'igvCreditableCents');

    expect(query.params).toEqual([...TAX_CREDIT_RECEIPT_TYPES]);
    expect(query.sql).not.toContain('factura');
  });

  it('derives the eligible list from the catalogue, so SQL and view cannot disagree (AC16)', () => {
    const query = renderField(captureExpenseTotals(RANGE).fields, 'igvCreditableCount');

    expect(query.params).toEqual([...TAX_CREDIT_RECEIPT_TYPES]);
  });

  // El total del período no filtra por tipo: la resta del handler es la que separa lo no
  // deducible, y si este agregado llevara el `in` la resta daría siempre cero.
  it('sums every computed IGV in the total, with no receipt_type restriction', () => {
    const query = renderField(captureExpenseTotals(RANGE).fields, 'igvTotalCents');

    expect(query.sql).toContain('"igv_cents"');
    expect(query.sql).not.toContain('"receipt_type"');
  });

  it('counts every row with a computed IGV in igvCount, with no receipt_type restriction', () => {
    const query = renderField(captureExpenseTotals(RANGE).fields, 'igvCount');

    expect(query.sql).toContain('"igv_cents" is not null');
    expect(query.sql).not.toContain('"receipt_type"');
  });

  // 017 D-11: `sum(int4)` desborda el int4 y el driver entrega los bigint como texto.
  it('casts both IGV sums to bigint, like every other sum of the module', () => {
    const { fields } = captureExpenseTotals(RANGE);

    expect(renderField(fields, 'igvCreditableCents').sql).toContain('::bigint');
    expect(renderField(fields, 'igvTotalCents').sql).toContain('::bigint');
  });

  it('coalesces both IGV sums to 0: a range with no receipts is a number, not null (AC15)', () => {
    const { fields } = captureExpenseTotals(RANGE);

    expect(renderField(fields, 'igvCreditableCents').sql).toContain('coalesce');
    expect(renderField(fields, 'igvTotalCents').sql).toContain('coalesce');
  });

  it('casts both counts to int', () => {
    const { fields } = captureExpenseTotals(RANGE);

    expect(renderField(fields, 'igvCreditableCount').sql).toContain('::int');
    expect(renderField(fields, 'igvCount').sql).toContain('::int');
  });

  // El WHERE es el mismo de siempre: los agregados no pueden ensanchar ni estrechar el
  // rango, porque salen de la misma pasada (D-9).
  it('keeps the range WHERE of buildExpenseFilters untouched', () => {
    const { where } = captureExpenseTotals(RANGE);
    const query = dialect.sqlToQuery(where);

    expect(query.sql).toMatch(/"incurred_on" >= \$\d/);
    expect(query.sql).toMatch(/"incurred_on" <= \$\d/);
    expect(query.params).toEqual(['2026-09-01', '2026-09-30']);
  });

  it('never filters the summary by category, not even with the new aggregates (AC17)', () => {
    const query = dialect.sqlToQuery(captureExpenseTotals(RANGE).where);

    expect(query.sql).not.toContain('"category"');
  });

  // Sin `GROUP BY` no entra en la clase de bug del 42803 que documenta el spec 015.
  it('has no GROUP BY: the four FILTER aggregates come from a single ungrouped row', () => {
    expect(captureExpenseTotals(RANGE).grouped).toBe(false);
  });
});

// El listado proyecta las seis columnas nuevas desde el mismo SELECT: ni una consulta
// más, ni un N+1 (§10).
function captureExpenseListSelects() {
  const selects: Record<string, unknown>[] = [];

  const chain: Record<string, unknown> = {};
  for (const method of ['innerJoin', 'where', 'orderBy', 'limit', 'offset']) {
    chain[method] = () => chain;
  }
  // Thenable, para que el `await Promise.all` de la función resuelva sin base de datos.
  chain.then = (resolve: (rows: unknown[]) => void) => resolve([]);

  const reader = {
    select: (selected: Record<string, unknown>) => {
      selects.push(selected);
      return { from: () => chain };
    },
  };

  void findManyExpenses(
    { page: 1, pageSize: 20, category: 'all' } as never,
    RANGE,
    reader as never,
  );

  return selects;
}

describe('findManyExpenses — proyección del comprobante', () => {
  const RECEIPT_KEYS = [
    'receiptType',
    'supplierRuc',
    'supplierName',
    'receiptSeries',
    'receiptNumber',
    'igvCents',
  ];

  it('selects the six new columns in the listing query', () => {
    const [rowSelect] = captureExpenseListSelects();

    expect(Object.keys(rowSelect)).toEqual(expect.arrayContaining(RECEIPT_KEYS));
  });

  it('maps each key to its own physical column', () => {
    const [rowSelect] = captureExpenseListSelects();
    const expected: Record<string, string> = {
      receiptType: 'receipt_type',
      supplierRuc: 'supplier_ruc',
      supplierName: 'supplier_name',
      receiptSeries: 'receipt_series',
      receiptNumber: 'receipt_number',
      igvCents: 'igv_cents',
    };

    for (const [key, column] of Object.entries(expected)) {
      expect((rowSelect[key] as { name: string }).name).toBe(column);
    }
  });

  it('keeps the columns the listing already selected', () => {
    const [rowSelect] = captureExpenseListSelects();

    expect(Object.keys(rowSelect)).toEqual(
      expect.arrayContaining(['id', 'concept', 'amountCents', 'category', 'incurredOn']),
    );
  });

  it('adds no extra query: still the rows read plus the count', () => {
    expect(captureExpenseListSelects()).toHaveLength(2);
  });

  it('keeps the count query free of the receipt columns: the filters live in expenses', () => {
    const [, countSelect] = captureExpenseListSelects();

    expect(Object.keys(countSelect)).toEqual(['value']);
  });
});
