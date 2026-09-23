import { SQL } from 'drizzle-orm';
import { alias, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { TAX_CREDIT_RECEIPT_TYPES } from '@/lib/purchase-receipts';
import { electronicDocuments } from '@/server/db/schema';

import {
  buildDeclarableFilter,
  buildExpenseFilters,
  findDeclarableSalesByKind,
  findDeclarableTaxTotals,
  findExpenseTotals,
  findManyExpenses,
  findSalesTotals,
  findUninvoicedPaidOrderCount,
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

// ── Ventas declarables (spec 025) ───────────────────────────────────────────

// Mismo sumidero que los anteriores, ampliado con las cláusulas que este agregado sí
// usa: el `leftJoin` al padre, el `group by` y el `order by`. Captura el árbol que
// Drizzle habría enviado, sin base de datos.
function captureDeclarableQuery(range: { from: Date; to: Date }) {
  let fields: Record<string, SQL> | undefined;
  let where: SQL | undefined;
  let joined = false;
  const groupBy: SQL[] = [];
  const orderBy: SQL[] = [];

  const chain: Record<string, unknown> = {
    leftJoin: () => {
      joined = true;
      return chain;
    },
    where: (condition: SQL) => {
      where = condition;
      return chain;
    },
    groupBy: (...args: SQL[]) => {
      groupBy.push(...args);
      return chain;
    },
    orderBy: (...args: SQL[]) => {
      orderBy.push(...args);
      return chain;
    },
  };
  // Thenable, para que el `await` de la función resuelva sin base de datos.
  chain.then = (resolve: (rows: unknown[]) => void) => resolve([]);

  const reader = {
    select: (selected: Record<string, SQL>) => {
      fields = selected;
      return { from: () => chain };
    },
  };

  void findDeclarableSalesByKind(range, reader as never);

  if (!fields || !where) throw new Error('findDeclarableSalesByKind no construyó la consulta');
  return { fields, where, joined, groupBy, orderBy };
}

const DECLARABLE_RANGE = {
  from: new Date('2026-09-01T05:00:00.000Z'),
  to: new Date('2026-10-01T05:00:00.000Z'),
};

// El filtro se compila contra el mismo alias del padre que usa la consulta real: la
// disyunción de la condición (c) se apoya en él, y probarlo con otro alias probaría
// otra consulta.
const declarableFilter = () =>
  dialect.sqlToQuery(captureDeclarableQuery(DECLARABLE_RANGE).where);

describe('buildDeclarableFilter', () => {
  // Se exporta para poder compilarla suelta, pero probar una copia no probaría nada: la
  // aserción es que el texto compilado a mano y el que la consulta envía son el mismo.
  it('is the very WHERE that findDeclarableSalesByKind sends, not a lookalike', () => {
    const parent = alias(electronicDocuments, 'parent_document');
    const direct = dialect.sqlToQuery(buildDeclarableFilter(DECLARABLE_RANGE, parent));

    expect(direct.sql).toBe(declarableFilter().sql);
    expect(direct.params).toEqual(declarableFilter().params);
  });

  it('bounds the lower end of issued_at (AC4)', () => {
    expect(declarableFilter().sql).toMatch(/"issued_at" >= \$\d/);
  });

  it('closes the window with a strict upper bound: it is semi-open, like orders (AC4)', () => {
    const query = declarableFilter();

    expect(query.sql).toMatch(/"issued_at" < \$\d/);
    expect(query.sql).not.toMatch(/"issued_at" <= \$\d/);
  });

  // AC4: el rango se aplica sobre `issued_at` y nunca sobre `created_at`, `updated_at`
  // ni la fecha del pedido. `updated_at` lleva `$onUpdate` y movería la venta de mes.
  it('never bounds the range by created_at or updated_at', () => {
    const query = declarableFilter();

    expect(query.sql).not.toContain('"created_at"');
    expect(query.sql).not.toContain('"updated_at"');
  });

  it('counts only issued documents: a voided original does not sum (AC6)', () => {
    const query = declarableFilter();

    expect(query.sql).toContain('"electronic_documents"."status"');
    expect(query.params).toContain('issued');
  });

  // El punto de §5.2: un documento cuenta si no tiene padre —es un original— o si su
  // padre sigue `issued`. Sin la disyunción, una anulación total fuera de ventana
  // declararía ventas negativas (D-1, AC7 a AC11).
  it('keeps the disjunction "no parent OR parent still issued" (D-1)', () => {
    const query = declarableFilter();

    expect(query.sql).toContain(
      '("electronic_documents"."related_document_id" is null or "parent_document"."status" = ',
    );
  });

  it('decides by the parent state and never by a list of reason codes (D-1)', () => {
    const query = declarableFilter();

    expect(query.sql).not.toContain('"reason_code"');
    expect(query.params).not.toContain('01');
    expect(query.params).not.toContain('06');
  });

  // La `comunicacion_baja` sale sola por la condición (c): su padre siempre queda
  // `voided` al emitirse ella. No hay cláusula que la nombre (AC7).
  it('never names comunicacion_baja: it leaves the sum through the parent rule (AC7)', () => {
    expect(declarableFilter().sql).not.toContain('comunicacion_baja');
  });

  it('sends both instants as parameters, serialized by the timestamptz mapper', () => {
    const query = declarableFilter();

    expect(query.params).toContain('2026-09-01T05:00:00.000Z');
    expect(query.params).toContain('2026-10-01T05:00:00.000Z');
  });

  it('never inlines the instants into the SQL text', () => {
    expect(declarableFilter().sql).not.toContain('2026-09-01');
  });

  it('never filters by category: the summary is the whole period (AC18)', () => {
    expect(declarableFilter().sql).not.toContain('"category"');
  });
});

describe('findDeclarableSalesByKind', () => {
  const fields = () => captureDeclarableQuery(DECLARABLE_RANGE).fields;
  const field = (key: string) => dialect.sqlToQuery(fields()[key]);

  it('joins the parent by its primary key, so the indexed side is the PK (§5.1)', () => {
    expect(captureDeclarableQuery(DECLARABLE_RANGE).joined).toBe(true);
  });

  // D-5: con un `coalesce` en el SELECT, el ordinal es la forma que no puede
  // desalinearse. Repetir la expresión —o reutilizar la plantilla `sql` entre
  // cláusulas— es la condición exacta que produjo el 42803 del spec 015.
  it('groups by ordinal and not by the expression', () => {
    const { groupBy } = captureDeclarableQuery(DECLARABLE_RANGE);

    expect(groupBy).toHaveLength(1);
    expect(dialect.sqlToQuery(groupBy[0]).sql).toBe('1');
  });

  it('orders by ordinal too: the enum already puts boleta before factura', () => {
    const { orderBy } = captureDeclarableQuery(DECLARABLE_RANGE);

    expect(orderBy).toHaveLength(1);
    expect(dialect.sqlToQuery(orderBy[0]).sql).toBe('1');
  });

  it('does not repeat the coalesce in the grouping clauses', () => {
    const { groupBy, orderBy } = captureDeclarableQuery(DECLARABLE_RANGE);

    for (const clause of [...groupBy, ...orderBy]) {
      expect(dialect.sqlToQuery(clause).sql).not.toContain('coalesce');
    }
  });

  // AC12: la familia es la del padre cuando lo hay, leída de `related_document_id` y no
  // de la letra de la serie (D-2).
  it('takes the family from the parent when there is one, never from the series', () => {
    const query = field('kind');

    expect(query.sql).toBe(
      'coalesce("parent_document"."kind", "electronic_documents"."kind")',
    );
    expect(query.sql).not.toContain('"series"');
  });

  // El signo lo da el `kind`: original +, nota de crédito −, nota de débito +.
  it('negates only credit notes in the signed sum', () => {
    const query = field('amountCents');

    expect(query.sql).toContain(`case when "electronic_documents"."kind" = 'nota_credito'`);
    expect(query.sql).toContain('then -"electronic_documents"."amount_cents"');
    expect(query.sql).toContain('else "electronic_documents"."amount_cents"');
  });

  it('does not negate debit notes: they add (AC11)', () => {
    expect(field('amountCents').sql).not.toContain(`= 'nota_debito'`);
  });

  // 017 D-11, agravado aquí: la suma lleva signo, así que el int4 desborda por los dos
  // extremos.
  it('casts the signed sum to bigint and coalesces it to 0', () => {
    const query = field('amountCents');

    expect(query.sql).toContain('::bigint');
    expect(query.sql).toContain('coalesce');
  });

  it('counts originals and adjustments apart, each with its own FILTER', () => {
    expect(field('documentCount').sql).toBe(
      'count(*) filter (where "electronic_documents"."related_document_id" is null)::int',
    );
    expect(field('adjustmentCount').sql).toBe(
      'count(*) filter (where "electronic_documents"."related_document_id" is not null)::int',
    );
  });

  it('publishes exactly the four columns of DeclarableSalesByKind', () => {
    expect(Object.keys(fields())).toEqual([
      'kind',
      'amountCents',
      'documentCount',
      'adjustmentCount',
    ]);
  });

  // D-13: `base_cents` e `igv_cents` existen en la tabla desde el spec 022 y son el
  // insumo del sub-proyecto #4. Publicarlos aquí fijaría esa decisión desde la pantalla
  // equivocada.
  it('never reads base_cents nor igv_cents: this spec publishes totals, not tax', () => {
    for (const key of Object.keys(fields())) {
      expect(field(key).sql).not.toContain('"base_cents"');
      expect(field(key).sql).not.toContain('"igv_cents"');
    }
  });
});

// ── Impuestos: débito fiscal de ventas (spec 026) ───────────────────────────

// Mismo sumidero que `captureDeclarableQuery`, pero con `groupBy` y `orderBy` también
// enganchados para poder afirmar que **no** se llaman: el IGV se declara junto, sin
// desglose por familia (§5.2).
function captureTaxTotalsQuery(range: { from: Date; to: Date }) {
  let fields: Record<string, SQL> | undefined;
  let where: SQL | undefined;
  let joined = false;
  let grouped = false;
  let ordered = false;

  const chain: Record<string, unknown> = {
    leftJoin: () => {
      joined = true;
      return chain;
    },
    where: (condition: SQL) => {
      where = condition;
      return chain;
    },
    groupBy: () => {
      grouped = true;
      return chain;
    },
    orderBy: () => {
      ordered = true;
      return chain;
    },
  };
  // Thenable, para que el `await` de la función resuelva sin base de datos.
  chain.then = (resolve: (rows: unknown[]) => void) => resolve([]);

  const reader = {
    select: (selected: Record<string, SQL>) => {
      fields = selected;
      return { from: () => chain };
    },
  };

  void findDeclarableTaxTotals(range, reader as never);

  if (!fields || !where) throw new Error('findDeclarableTaxTotals no construyó la consulta');
  return { fields, where, joined, grouped, ordered };
}

describe('findDeclarableTaxTotals', () => {
  const fields = () => captureTaxTotalsQuery(DECLARABLE_RANGE).fields;
  const field = (key: string) => dialect.sqlToQuery(fields()[key]);
  const where = () => dialect.sqlToQuery(captureTaxTotalsQuery(DECLARABLE_RANGE).where);

  // AC6 y D-2: la aserción no es «se parece al filtro de ventas declarables», es que el
  // texto compilado es **el mismo**. Si alguien copiara la condición en vez de
  // importarla, las dos pantallas podrían divergir en silencio (§10).
  it('sends the very buildDeclarableFilter of the declarable sales, not a copy (AC6)', () => {
    const parent = alias(electronicDocuments, 'parent_document');
    const direct = dialect.sqlToQuery(buildDeclarableFilter(DECLARABLE_RANGE, parent));

    expect(where().sql).toBe(direct.sql);
    expect(where().params).toEqual(direct.params);
  });

  it('is byte-for-byte the WHERE that findDeclarableSalesByKind sends (AC6)', () => {
    expect(where().sql).toBe(declarableFilter().sql);
    expect(where().params).toEqual(declarableFilter().params);
  });

  it('counts only issued documents: a voided original contributes nothing (AC8)', () => {
    expect(where().sql).toContain('"electronic_documents"."status"');
    expect(where().params).toContain('issued');
  });

  it('bounds both ends of issued_at, the upper one strictly (AC5)', () => {
    expect(where().sql).toMatch(/"issued_at" >= \$\d/);
    expect(where().sql).toMatch(/"issued_at" < \$\d/);
    expect(where().sql).not.toMatch(/"issued_at" <= \$\d/);
  });

  // AC5: el rango se aplica sobre `issued_at` y nunca sobre `created_at` ni `updated_at`,
  // que lleva `$onUpdate` y movería el IGV de un mes a otro.
  it('never bounds the range by created_at or updated_at (AC5)', () => {
    expect(where().sql).not.toContain('"created_at"');
    expect(where().sql).not.toContain('"updated_at"');
  });

  // La disyunción es la que hace que una anulación total no reste dos veces: la venta sale
  // por el lado del original y la nota anulatoria queda fuera con él (AC10).
  it('keeps the disjunction "no parent OR parent still issued" (AC9, AC10)', () => {
    expect(where().sql).toContain(
      '("electronic_documents"."related_document_id" is null or "parent_document"."status" = ',
    );
  });

  it('never names comunicacion_baja: it leaves the sum through the parent rule (AC11)', () => {
    expect(where().sql).not.toContain('comunicacion_baja');
  });

  it('joins the parent, so the disjunction has a table to read (§5.1)', () => {
    expect(captureTaxTotalsQuery(DECLARABLE_RANGE).joined).toBe(true);
  });

  it('sums igv_cents negated only for credit notes (AC7, AC9, AC12)', () => {
    const query = field('igvCents');

    expect(query.sql).toContain(`case when "electronic_documents"."kind" = 'nota_credito'`);
    expect(query.sql).toContain('then -"electronic_documents"."igv_cents"');
    expect(query.sql).toContain('else "electronic_documents"."igv_cents"');
  });

  it('sums base_cents with the same sign rule (AC17)', () => {
    const query = field('baseCents');

    expect(query.sql).toContain(`case when "electronic_documents"."kind" = 'nota_credito'`);
    expect(query.sql).toContain('then -"electronic_documents"."base_cents"');
    expect(query.sql).toContain('else "electronic_documents"."base_cents"');
  });

  it('does not negate debit notes: they add to the debit (AC12)', () => {
    expect(field('igvCents').sql).not.toContain(`= 'nota_debito'`);
    expect(field('baseCents').sql).not.toContain(`= 'nota_debito'`);
  });

  it('never sums amount_cents: this screen declares tax, not totals', () => {
    expect(field('igvCents').sql).not.toContain('"amount_cents"');
    expect(field('baseCents').sql).not.toContain('"amount_cents"');
  });

  // 017 D-11, agravado aquí: las dos sumas llevan signo, así que el int4 desborda por los
  // dos extremos.
  it('casts both signed sums to bigint and coalesces them to 0 (AC21)', () => {
    for (const key of ['igvCents', 'baseCents']) {
      expect(field(key).sql).toContain('::bigint');
      expect(field(key).sql).toContain('coalesce');
    }
  });

  it('counts originals and adjustments apart, each with its own FILTER', () => {
    expect(field('documentCount').sql).toBe(
      'count(*) filter (where "electronic_documents"."related_document_id" is null)::int',
    );
    expect(field('adjustmentCount').sql).toBe(
      'count(*) filter (where "electronic_documents"."related_document_id" is not null)::int',
    );
  });

  it('publishes exactly the four columns of DeclarableTaxTotals', () => {
    expect(Object.keys(fields())).toEqual([
      'igvCents',
      'baseCents',
      'documentCount',
      'adjustmentCount',
    ]);
  });

  // D-3: sin `GROUP BY` el IGV se declara junto, y la consulta ni siquiera roza la clase
  // de bug del 42803 del spec 015.
  it('has no GROUP BY nor ORDER BY: the IGV is declared as one figure (D-3)', () => {
    const captured = captureTaxTotalsQuery(DECLARABLE_RANGE);

    expect(captured.grouped).toBe(false);
    expect(captured.ordered).toBe(false);
  });

  it('never touches the expenses table: the credit side is a separate read (D-4)', () => {
    expect(where().sql).not.toContain('"expenses"');
  });

  it('never inlines the instants into the SQL text', () => {
    expect(where().sql).not.toContain('2026-09-01');
  });
});

function captureUninvoicedQuery(range: { from: Date; to: Date }) {
  let where: SQL | undefined;

  const reader = {
    select: () => ({
      from: () => ({
        where: (condition: SQL) => {
          where = condition;
          return Promise.resolve([]);
        },
      }),
    }),
  };

  void findUninvoicedPaidOrderCount(range, reader as never);

  if (!where) throw new Error('findUninvoicedPaidOrderCount no construyó ningún WHERE');
  return dialect.sqlToQuery(where);
}

describe('findUninvoicedPaidOrderCount', () => {
  const query = () => captureUninvoicedQuery(DECLARABLE_RANGE);

  it('counts only paid orders: the indicator is a subset of confirmed sales', () => {
    expect(query().sql).toContain('"orders"."status"');
    expect(query().params).toContain('paid');
  });

  it('bounds created_at with the same semi-open window as findSalesTotals', () => {
    expect(query().sql).toMatch(/"orders"\."created_at" >= \$\d/);
    expect(query().sql).toMatch(/"orders"\."created_at" < \$\d/);
    expect(query().sql).not.toMatch(/"orders"\."created_at" <= \$\d/);
  });

  it('uses NOT EXISTS and not a left join with an is-null test', () => {
    expect(query().sql).toContain('not exists (select 1 from "electronic_documents"');
  });

  // AC16 y AC17: la subconsulta exige original **y** emitido. Sin `related_document_id
  // is null`, una nota de crédito taparía la falta del comprobante; sin
  // `status = 'issued'`, un `pending` o un `failed` contarían como emitidos.
  it('requires the document to be an original: related_document_id is null', () => {
    expect(query().sql).toContain('"electronic_documents"."related_document_id" is null');
  });

  it('requires the original to be issued, so pending and failed still count (AC16)', () => {
    expect(query().sql).toContain('"electronic_documents"."status" = ');
    expect(query().params).toEqual([
      'paid',
      '2026-09-01T05:00:00.000Z',
      '2026-10-01T05:00:00.000Z',
      'issued',
    ]);
  });

  it('correlates the subquery with the order at hand', () => {
    expect(query().sql).toContain('"electronic_documents"."order_id" = "orders"."id"');
  });

  it('never inlines the instants into the SQL text', () => {
    expect(query().sql).not.toContain('2026-09-01');
  });

  it('never filters by category: the summary is the whole period (AC18)', () => {
    expect(query().sql).not.toContain('"category"');
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
