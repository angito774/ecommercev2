import { describe, expect, it } from 'vitest';

import type { EmployeeRow } from '../types/employee.types';

import { hasSalaryChange, toAuditableEmployee } from './auditable-employee';

const EMPLOYEE: EmployeeRow = {
  id: '11111111-1111-4111-8111-111111111111',
  employeeCode: 'EMP-001',
  firstName: 'Ana',
  lastName: 'Quispe',
  jobTitle: 'Analista de soporte',
  hiredAt: '2026-01-15',
  baseSalaryCents: 250_000,
  isActive: true,
};

describe('toAuditableEmployee', () => {
  // Comprobado con `in` y no solo con el tipo: el tipo desaparece en runtime y lo que
  // acaba en `audit_logs` es el objeto, no su declaración (AC17).
  it('drops the salary key entirely, not just its value (D-8, AC17)', () => {
    const result = toAuditableEmployee(EMPLOYEE);

    expect('baseSalaryCents' in result).toBe(false);
  });

  it('drops the id: it already travels as entityId', () => {
    const result = toAuditableEmployee(EMPLOYEE);

    expect('id' in result).toBe(false);
  });

  it('serialises without any amount reaching the log payload', () => {
    const serialised = JSON.stringify(toAuditableEmployee(EMPLOYEE));

    expect(serialised).not.toContain('250000');
    expect(serialised).not.toContain('baseSalaryCents');
  });

  it('keeps what the audit trail is for: who, which post and since when', () => {
    expect(toAuditableEmployee(EMPLOYEE)).toEqual({
      employeeCode: 'EMP-001',
      firstName: 'Ana',
      lastName: 'Quispe',
      jobTitle: 'Analista de soporte',
      hiredAt: '2026-01-15',
      isActive: true,
    });
  });

  it('exposes exactly six keys: the projection is positive, not a delete', () => {
    expect(Object.keys(toAuditableEmployee(EMPLOYEE))).toHaveLength(6);
  });

  it('does not mutate the row it receives', () => {
    const row = { ...EMPLOYEE };
    toAuditableEmployee(row);

    expect(row.baseSalaryCents).toBe(250_000);
  });
});

describe('hasSalaryChange', () => {
  it('detects a raise', () => {
    expect(hasSalaryChange(EMPLOYEE, { ...EMPLOYEE, baseSalaryCents: 300_000 })).toBe(true);
  });

  it('detects a cut', () => {
    expect(hasSalaryChange(EMPLOYEE, { ...EMPLOYEE, baseSalaryCents: 200_000 })).toBe(true);
  });

  it('returns false when the PATCH did not carry the field (AC17)', () => {
    expect(hasSalaryChange(EMPLOYEE, { ...EMPLOYEE, jobTitle: 'Jefe de soporte' })).toBe(false);
  });

  it('returns false for an untouched row', () => {
    expect(hasSalaryChange(EMPLOYEE, EMPLOYEE)).toBe(false);
  });

  it('answers with a boolean, never with the figures themselves (D-8)', () => {
    expect(typeof hasSalaryChange(EMPLOYEE, { ...EMPLOYEE, baseSalaryCents: 1 })).toBe('boolean');
  });
});
