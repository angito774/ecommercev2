import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditInput } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { EmployeeRow } from '@/modules/payroll/types/employee.types';
import type { PayrollPaymentRow } from '@/modules/payroll/types/payroll.types';
import type { users } from '@/server/db/schema';

// `vi.mock` se iza al principio del archivo, así que los dobles se crean con
// `vi.hoisted` para que existan antes que las factorías.
//
// El `tx` es un centinela: ningún doble lo inspecciona, solo se comprueba que las
// lecturas y escrituras lo reciben, que es lo que garantiza que la bitácora vive en la
// misma transacción que la mutación (AC16).
const { TX, auditEntries, employeeRepository, paymentRepository } = vi.hoisted(() => ({
  TX: Symbol('tx'),
  auditEntries: [] as AuditInput[],
  employeeRepository: { findById: vi.fn() },
  paymentRepository: {
    findActiveByPeriod: vi.fn(),
    findById: vi.fn(),
    insert: vi.fn(),
    markVoided: vi.fn(),
  },
}));

vi.mock('@/server/db', () => ({
  db: { transaction: (callback: (tx: unknown) => unknown) => callback(TX) },
}));

vi.mock('@/lib/audit', () => ({
  logAudit: (_tx: unknown, input: AuditInput) => {
    auditEntries.push(input);
    return Promise.resolve();
  },
}));

vi.mock('@/server/repositories/employee.repository', () => employeeRepository);
vi.mock('@/server/repositories/payroll-payment.repository', () => paymentRepository);

import { registerPayment, voidPayment } from './payroll.service';

type User = typeof users.$inferSelect;

const ACTOR = { id: 'actor-1' } as User;
const CONTEXT = { ipAddress: null, userAgent: null };

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

const INPUT = {
  employeeId: EMPLOYEE.id,
  period: '2026-09',
  paidAt: '2026-09-30',
  amountCents: 250_000,
};

const PAYMENT: PayrollPaymentRow = {
  id: '22222222-2222-4222-8222-222222222222',
  employeeId: EMPLOYEE.id,
  period: '2026-09',
  paidAt: '2026-09-30',
  amountCents: 250_000,
  status: 'paid',
  employeeCode: 'EMP-001',
  employeeFullName: 'Ana Quispe',
};

beforeEach(() => {
  auditEntries.length = 0;
  vi.resetAllMocks();
});

describe('registerPayment', () => {
  it('registers the payment and leaves exactly one audit entry (AC16)', async () => {
    employeeRepository.findById.mockResolvedValue(EMPLOYEE);
    paymentRepository.findActiveByPeriod.mockResolvedValue(null);
    paymentRepository.insert.mockResolvedValue(PAYMENT);

    const result = await registerPayment({ actor: ACTOR, context: CONTEXT, input: INPUT });

    expect(result).toBe(PAYMENT);
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe('payroll_payment.registered');
  });

  it('marks the entry as warning so retention never purges it (D-20)', async () => {
    employeeRepository.findById.mockResolvedValue(EMPLOYEE);
    paymentRepository.findActiveByPeriod.mockResolvedValue(null);
    paymentRepository.insert.mockResolvedValue(PAYMENT);

    await registerPayment({ actor: ACTOR, context: CONTEXT, input: INPUT });

    expect(auditEntries[0].severity).toBe('warning');
  });

  // El riesgo de seguridad principal del módulo: `audit` y `manager` leen la bitácora
  // y no tienen `payroll.read` (D-4, D-8).
  it('writes no amount into changes nor metadata (AC17)', async () => {
    employeeRepository.findById.mockResolvedValue(EMPLOYEE);
    paymentRepository.findActiveByPeriod.mockResolvedValue(null);
    paymentRepository.insert.mockResolvedValue(PAYMENT);

    await registerPayment({ actor: ACTOR, context: CONTEXT, input: INPUT });

    const serialised = JSON.stringify({
      changes: auditEntries[0].changes,
      metadata: auditEntries[0].metadata,
    });

    expect(serialised).not.toContain('amountCents');
    expect(serialised).not.toContain('250000');
  });

  it('reads the employee inside the transaction, not with the global handle', async () => {
    employeeRepository.findById.mockResolvedValue(EMPLOYEE);
    paymentRepository.findActiveByPeriod.mockResolvedValue(null);
    paymentRepository.insert.mockResolvedValue(PAYMENT);

    await registerPayment({ actor: ACTOR, context: CONTEXT, input: INPUT });

    expect(employeeRepository.findById).toHaveBeenCalledWith(EMPLOYEE.id, TX);
    expect(paymentRepository.findActiveByPeriod).toHaveBeenCalledWith(EMPLOYEE.id, '2026-09', TX);
  });

  it('throws NotFoundError when the employee does not exist', async () => {
    employeeRepository.findById.mockResolvedValue(null);

    await expect(registerPayment({ actor: ACTOR, context: CONTEXT, input: INPUT })).rejects.toThrow(
      NotFoundError,
    );
    expect(auditEntries).toHaveLength(0);
  });

  it('throws ConflictError for an inactive employee, not a validation error (D-15, AC13)', async () => {
    employeeRepository.findById.mockResolvedValue({ ...EMPLOYEE, isActive: false });

    await expect(registerPayment({ actor: ACTOR, context: CONTEXT, input: INPUT })).rejects.toThrow(
      ConflictError,
    );
    expect(paymentRepository.insert).not.toHaveBeenCalled();
  });

  it('names the employee in the inactive message so the dialog can explain it', async () => {
    employeeRepository.findById.mockResolvedValue({ ...EMPLOYEE, isActive: false });

    await expect(
      registerPayment({ actor: ACTOR, context: CONTEXT, input: INPUT }),
    ).rejects.toThrow(/Ana Quispe/);
  });

  it('throws ValidationError when paidAt precedes the hire date (D-16, AC14)', async () => {
    employeeRepository.findById.mockResolvedValue(EMPLOYEE);

    await expect(
      registerPayment({
        actor: ACTOR,
        context: CONTEXT,
        input: { ...INPUT, paidAt: '2025-09-30' },
      }),
    ).rejects.toThrow(ValidationError);
    expect(auditEntries).toHaveLength(0);
  });

  it('accepts a payment made on the very hire date: the bound is not exclusive', async () => {
    employeeRepository.findById.mockResolvedValue(EMPLOYEE);
    paymentRepository.findActiveByPeriod.mockResolvedValue(null);
    paymentRepository.insert.mockResolvedValue(PAYMENT);

    await expect(
      registerPayment({ actor: ACTOR, context: CONTEXT, input: { ...INPUT, paidAt: '2026-01-15' } }),
    ).resolves.toBe(PAYMENT);
  });

  it('throws ConflictError when a live payment already covers the period (D-19, AC11)', async () => {
    employeeRepository.findById.mockResolvedValue(EMPLOYEE);
    paymentRepository.findActiveByPeriod.mockResolvedValue(PAYMENT);

    await expect(registerPayment({ actor: ACTOR, context: CONTEXT, input: INPUT })).rejects.toThrow(
      ConflictError,
    );
    expect(paymentRepository.insert).not.toHaveBeenCalled();
    expect(auditEntries).toHaveLength(0);
  });

  it('names the month in the duplicate message instead of falling back to a generic one', async () => {
    employeeRepository.findById.mockResolvedValue(EMPLOYEE);
    paymentRepository.findActiveByPeriod.mockResolvedValue(PAYMENT);

    await expect(
      registerPayment({ actor: ACTOR, context: CONTEXT, input: INPUT }),
    ).rejects.toThrow(/2026/);
  });
});

describe('voidPayment', () => {
  it('voids a live payment and leaves exactly one audit entry (AC16)', async () => {
    const voided: PayrollPaymentRow = { ...PAYMENT, status: 'voided' };
    paymentRepository.findById.mockResolvedValue(PAYMENT);
    paymentRepository.markVoided.mockResolvedValue(voided);

    const result = await voidPayment({ actor: ACTOR, context: CONTEXT, paymentId: PAYMENT.id });

    expect(result).toBe(voided);
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe('payroll_payment.voided');
  });

  it('writes no amount into the void entry either (AC17)', async () => {
    paymentRepository.findById.mockResolvedValue(PAYMENT);
    paymentRepository.markVoided.mockResolvedValue({ ...PAYMENT, status: 'voided' });

    await voidPayment({ actor: ACTOR, context: CONTEXT, paymentId: PAYMENT.id });

    const serialised = JSON.stringify({
      changes: auditEntries[0].changes,
      metadata: auditEntries[0].metadata,
    });

    expect(serialised).not.toContain('amountCents');
    expect(serialised).not.toContain('250000');
  });

  it('is idempotent: voiding an already voided payment writes no second entry (AC15)', async () => {
    const alreadyVoided: PayrollPaymentRow = { ...PAYMENT, status: 'voided' };
    paymentRepository.findById.mockResolvedValue(alreadyVoided);

    const result = await voidPayment({ actor: ACTOR, context: CONTEXT, paymentId: PAYMENT.id });

    expect(result).toBe(alreadyVoided);
    expect(paymentRepository.markVoided).not.toHaveBeenCalled();
    expect(auditEntries).toHaveLength(0);
  });

  it('writes no entry when another tab won the race between the read and the update', async () => {
    paymentRepository.findById.mockResolvedValue(PAYMENT);
    paymentRepository.markVoided.mockResolvedValue(null);

    const result = await voidPayment({ actor: ACTOR, context: CONTEXT, paymentId: PAYMENT.id });

    expect(result).toBe(PAYMENT);
    expect(auditEntries).toHaveLength(0);
  });

  it('throws NotFoundError when the payment does not exist', async () => {
    paymentRepository.findById.mockResolvedValue(null);

    await expect(
      voidPayment({ actor: ACTOR, context: CONTEXT, paymentId: PAYMENT.id }),
    ).rejects.toThrow(NotFoundError);
    expect(auditEntries).toHaveLength(0);
  });

  it('records only the status transition, never the figures', async () => {
    paymentRepository.findById.mockResolvedValue(PAYMENT);
    paymentRepository.markVoided.mockResolvedValue({ ...PAYMENT, status: 'voided' });

    await voidPayment({ actor: ACTOR, context: CONTEXT, paymentId: PAYMENT.id });

    expect(auditEntries[0].changes).toEqual({
      before: { status: 'paid' },
      after: { status: 'voided' },
    });
  });
});
