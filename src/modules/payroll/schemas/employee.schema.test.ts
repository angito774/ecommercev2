import { describe, expect, it } from 'vitest';

import {
  createEmployeeSchema,
  employeeCodeSchema,
  employeeQuerySchema,
  updateEmployeeSchema,
} from './employee.schema';

const VALID_EMPLOYEE = {
  employeeCode: 'EMP-001',
  firstName: 'Ana',
  lastName: 'Quispe',
  jobTitle: 'Analista de soporte',
  hiredAt: '2026-01-15',
  baseSalaryCents: 250_000,
};

describe('employeeQuerySchema', () => {
  it('defaults an empty query to active employees on the first page (AC8)', () => {
    const parsed = employeeQuerySchema.parse({});

    expect(parsed).toEqual({ status: 'active', page: 1, pageSize: 20 });
  });

  it('does not default to "all": an ex employee is not part of today payroll (D-14)', () => {
    expect(employeeQuerySchema.parse({}).status).not.toBe('all');
  });

  it('keeps an explicit status over the default', () => {
    expect(employeeQuerySchema.parse({ status: 'inactive' }).status).toBe('inactive');
  });

  it('coerces the page and page size coming from the query string', () => {
    const parsed = employeeQuerySchema.parse({ page: '3', pageSize: '50' });

    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it('rejects a page size above the cap so a request cannot dump the table', () => {
    expect(employeeQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('rejects an unknown status instead of silently falling back', () => {
    expect(employeeQuerySchema.safeParse({ status: 'fired' }).success).toBe(false);
  });
});

describe('employeeCodeSchema', () => {
  it('accepts uppercase letters, digits and dashes', () => {
    expect(employeeCodeSchema.parse('EMP-001')).toBe('EMP-001');
  });

  it('rejects a lowercase code: the format is normalised, not free text', () => {
    expect(employeeCodeSchema.safeParse('emp-001').success).toBe(false);
  });

  it('rejects a code that starts with a dash', () => {
    expect(employeeCodeSchema.safeParse('-EMP').success).toBe(false);
  });

  it('rejects a code shorter than two characters', () => {
    expect(employeeCodeSchema.safeParse('E').success).toBe(false);
  });

  it('rejects a code longer than thirty characters', () => {
    expect(employeeCodeSchema.safeParse('E'.repeat(31)).success).toBe(false);
  });
});

describe('createEmployeeSchema', () => {
  it('accepts a complete payload and defaults isActive to true', () => {
    const parsed = createEmployeeSchema.parse(VALID_EMPLOYEE);

    expect(parsed.isActive).toBe(true);
    expect(parsed.employeeCode).toBe('EMP-001');
  });

  it('rejects a fractional salary: cents are integers (AC6)', () => {
    const parsed = createEmployeeSchema.safeParse({ ...VALID_EMPLOYEE, baseSalaryCents: 2500.5 });

    expect(parsed.success).toBe(false);
  });

  it('rejects a zero salary', () => {
    expect(
      createEmployeeSchema.safeParse({ ...VALID_EMPLOYEE, baseSalaryCents: 0 }).success,
    ).toBe(false);
  });

  it('rejects a negative salary', () => {
    expect(
      createEmployeeSchema.safeParse({ ...VALID_EMPLOYEE, baseSalaryCents: -1 }).success,
    ).toBe(false);
  });

  it('rejects a salary above the sanity cap', () => {
    expect(
      createEmployeeSchema.safeParse({ ...VALID_EMPLOYEE, baseSalaryCents: 100_000_000 }).success,
    ).toBe(false);
  });

  it('rejects a hire date that is not ISO: dd-mm-yyyy does not pass', () => {
    expect(
      createEmployeeSchema.safeParse({ ...VALID_EMPLOYEE, hiredAt: '17-09-2026' }).success,
    ).toBe(false);
  });

  it('rejects a hire date that is a full timestamp: the column is a calendar day (D-11)', () => {
    expect(
      createEmployeeSchema.safeParse({ ...VALID_EMPLOYEE, hiredAt: '2026-09-17T00:00:00Z' })
        .success,
    ).toBe(false);
  });

  it('trims the surrounding whitespace of the free text fields', () => {
    const parsed = createEmployeeSchema.parse({ ...VALID_EMPLOYEE, firstName: '  Ana  ' });

    expect(parsed.firstName).toBe('Ana');
  });
});

describe('updateEmployeeSchema', () => {
  it('rejects an empty body: a PATCH with nothing would be an UPDATE without columns', () => {
    expect(updateEmployeeSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a single field', () => {
    const parsed = updateEmployeeSchema.safeParse({ jobTitle: 'Jefe de almacén' });

    expect(parsed.success).toBe(true);
  });

  it('adds no default keys to a partial payload (spec 001, C2)', () => {
    const parsed = updateEmployeeSchema.parse({ jobTitle: 'Jefe de almacén' });

    expect(Object.keys(parsed)).toEqual(['jobTitle']);
    expect('isActive' in parsed).toBe(false);
  });

  it('still validates the fields that are present', () => {
    expect(updateEmployeeSchema.safeParse({ baseSalaryCents: 2500.5 }).success).toBe(false);
  });
});
