import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  buildActivePeriodFilter,
  buildPayrollFilters,
  buildVoidableFilter,
  resolvePaymentStatus,
} from './payroll-payment.repository';

const dialect = new PgDialect();

function compile(filters: SQL | undefined) {
  return filters ? dialect.sqlToQuery(filters) : null;
}

const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';
const PAYMENT_ID = '22222222-2222-4222-8222-222222222222';

describe('buildPayrollFilters', () => {
  it('does not mention the period column with the "all" sentinel', () => {
    expect(buildPayrollFilters({ period: 'all' })).toBeUndefined();
  });

  it('filters by period when a concrete month is given', () => {
    const query = compile(buildPayrollFilters({ period: '2026-09' }));

    expect(query?.sql).toContain('"period"');
  });

  it('sends the period as a parameter, not inlined into the SQL text', () => {
    const query = compile(buildPayrollFilters({ period: '2026-09' }));

    expect(query?.params).toContain('2026-09');
    expect(query?.sql).not.toContain('2026-09');
  });

  it('searches over the joined employee data, not over the amount', () => {
    const query = compile(buildPayrollFilters({ period: 'all', search: 'ana' }));

    expect(query?.sql).toContain('"employee_code"');
    expect(query?.sql).toContain('"first_name"');
    expect(query?.sql).toContain('"last_name"');
    expect(query?.sql).toContain('concat_ws');
    expect(query?.sql).not.toContain('"amount_cents"');
  });

  it('escapes LIKE wildcards so they are searched literally (AC9)', () => {
    const query = compile(buildPayrollFilters({ period: 'all', search: '50%_off' }));

    expect(query?.params).toContain('%50\\%\\_off%');
  });

  it('keeps the period filter when a search is applied', () => {
    const query = compile(buildPayrollFilters({ period: '2026-09', search: 'ana' }));

    expect(query?.sql).toContain('"period"');
    expect(query?.sql).toContain(' and ');
  });

  it('treats an empty search as no filter at all', () => {
    expect(buildPayrollFilters({ period: 'all', search: '' })).toBeUndefined();
  });

  it('does not filter out the voided payments: the list shows them with a badge (AC15)', () => {
    const query = compile(buildPayrollFilters({ period: '2026-09', search: 'ana' }));

    expect(query?.sql).not.toContain('"voided_at"');
  });
});

describe('buildActivePeriodFilter', () => {
  it('always bounds the lookup to the live payments (AC12)', () => {
    const query = compile(buildActivePeriodFilter(EMPLOYEE_ID, '2026-09'));

    expect(query?.sql).toContain('"voided_at" is null');
  });

  it('pins both the employee and the period', () => {
    const query = compile(buildActivePeriodFilter(EMPLOYEE_ID, '2026-09'));

    expect(query?.sql).toContain('"employee_id"');
    expect(query?.sql).toContain('"period"');
    expect(query?.params).toEqual([EMPLOYEE_ID, '2026-09']);
  });

  it('builds a defined WHERE: this lookup is never unfiltered', () => {
    expect(buildActivePeriodFilter(EMPLOYEE_ID, '2026-09')).toBeInstanceOf(SQL);
  });
});

describe('buildVoidableFilter', () => {
  it('only reaches rows that are still live: voiding twice changes nothing (AC15)', () => {
    const query = compile(buildVoidableFilter(PAYMENT_ID));

    expect(query?.sql).toContain('"voided_at" is null');
  });

  it('pins the payment by id', () => {
    const query = compile(buildVoidableFilter(PAYMENT_ID));

    expect(query?.sql).toContain('"id"');
    expect(query?.params).toEqual([PAYMENT_ID]);
  });

  it('never overwrites an existing void mark, so the original date survives', () => {
    const query = compile(buildVoidableFilter(PAYMENT_ID));

    expect(query?.sql).not.toContain('"voided_at" is not null');
  });
});

describe('resolvePaymentStatus', () => {
  it('reads a null void mark as a live payment', () => {
    expect(resolvePaymentStatus(null)).toBe('paid');
  });

  it('reads a void mark as a voided payment', () => {
    expect(resolvePaymentStatus(new Date('2026-09-30T12:00:00.000Z'))).toBe('voided');
  });

  it('derives the status in TypeScript, so no CASE is needed in SQL (D-9)', () => {
    const query = compile(buildPayrollFilters({ period: '2026-09' }));

    expect(query?.sql).not.toContain('case');
  });
});
