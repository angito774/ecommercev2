import { describe, expect, it } from 'vitest';

import {
  createPayrollPaymentSchema,
  payrollPeriodSchema,
  payrollQuerySchema,
} from './payroll.schema';

const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';

const VALID_PAYMENT = {
  employeeId: EMPLOYEE_ID,
  period: '2026-09',
  paidAt: '2026-09-30',
  amountCents: 250_000,
};

describe('payrollPeriodSchema', () => {
  it('accepts a well formed AAAA-MM period', () => {
    expect(payrollPeriodSchema.parse('2026-09')).toBe('2026-09');
  });

  it('accepts december, the upper bound of the month range', () => {
    expect(payrollPeriodSchema.parse('2026-12')).toBe('2026-12');
  });

  it('rejects month 13 (AC10)', () => {
    expect(payrollPeriodSchema.safeParse('2026-13').success).toBe(false);
  });

  it('rejects month 00 (AC10)', () => {
    expect(payrollPeriodSchema.safeParse('2026-00').success).toBe(false);
  });

  it('rejects a two-digit year (AC10)', () => {
    expect(payrollPeriodSchema.safeParse('26-09').success).toBe(false);
  });

  it('rejects an unpadded month: the fixed width is what makes the order chronological (AC10)', () => {
    expect(payrollPeriodSchema.safeParse('2026-9').success).toBe(false);
  });

  it('rejects a full date: the period is a month, not a day (D-5)', () => {
    expect(payrollPeriodSchema.safeParse('2026-09-17').success).toBe(false);
  });
});

describe('payrollQuerySchema', () => {
  it('defaults a missing period to the "all" sentinel', () => {
    expect(payrollQuerySchema.parse({}).period).toBe('all');
  });

  it('defaults the pagination like the rest of the panel', () => {
    const parsed = payrollQuerySchema.parse({});

    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it('accepts a concrete period', () => {
    expect(payrollQuerySchema.parse({ period: '2026-09' }).period).toBe('2026-09');
  });

  it('rejects a malformed period instead of falling back to "all"', () => {
    expect(payrollQuerySchema.safeParse({ period: '2026-13' }).success).toBe(false);
  });

  it('rejects a page size above the cap', () => {
    expect(payrollQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('coerces the pagination coming from the query string', () => {
    const parsed = payrollQuerySchema.parse({ page: '2', pageSize: '10' });

    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(10);
  });
});

describe('createPayrollPaymentSchema', () => {
  it('accepts a complete payment payload', () => {
    expect(createPayrollPaymentSchema.parse(VALID_PAYMENT)).toEqual(VALID_PAYMENT);
  });

  it('rejects a zero amount', () => {
    expect(
      createPayrollPaymentSchema.safeParse({ ...VALID_PAYMENT, amountCents: 0 }).success,
    ).toBe(false);
  });

  it('rejects a fractional amount: cents are integers', () => {
    expect(
      createPayrollPaymentSchema.safeParse({ ...VALID_PAYMENT, amountCents: 2500.5 }).success,
    ).toBe(false);
  });

  it('rejects an employee id that is not a uuid', () => {
    expect(
      createPayrollPaymentSchema.safeParse({ ...VALID_PAYMENT, employeeId: 'EMP-001' }).success,
    ).toBe(false);
  });

  it('rejects a payment date that is not ISO', () => {
    expect(
      createPayrollPaymentSchema.safeParse({ ...VALID_PAYMENT, paidAt: '30-09-2026' }).success,
    ).toBe(false);
  });

  it('rejects a malformed period in the body too, not only in the query (AC10)', () => {
    expect(
      createPayrollPaymentSchema.safeParse({ ...VALID_PAYMENT, period: '2026-9' }).success,
    ).toBe(false);
  });
});
