import { describe, expect, it } from 'vitest';

import type { expenses } from '@/server/db/schema';

import { toAuditableExpense } from './expense-audit';

type Expense = typeof expenses.$inferSelect;

function buildExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    concept: 'Servicio contable de marzo',
    amountCents: 11_800,
    category: 'software',
    incurredOn: '2026-03-15',
    createdById: '44444444-4444-4444-8444-444444444444',
    createdAt: new Date('2026-03-15T10:00:00.000Z'),
    updatedAt: new Date('2026-03-16T10:00:00.000Z'),
    receiptType: 'factura',
    supplierRuc: '20100128056',
    supplierName: 'Proveedor SAC',
    receiptSeries: 'F001',
    receiptNumber: '00001234',
    igvCents: 1_800,
    ...overrides,
  };
}

describe('toAuditableExpense', () => {
  it('drops supplierRuc, which is what keeps the taxpayer id out of the audit log', () => {
    const auditable = toAuditableExpense(buildExpense());

    expect('supplierRuc' in auditable).toBe(false);
  });

  it('drops it as an own key, not as an undefined value', () => {
    const auditable = toAuditableExpense(buildExpense());

    expect(Object.keys(auditable)).not.toContain('supplierRuc');
    expect(JSON.stringify(auditable)).not.toContain('supplierRuc');
  });

  it('does not leak the number by any other key either', () => {
    const auditable = toAuditableExpense(buildExpense({ supplierRuc: '20100128056' }));

    expect(JSON.stringify(auditable)).not.toContain('20100128056');
  });

  it('keeps the RUC of a natural person out too: it carries the DNI in its first digits', () => {
    // `10425658785` es un RUC de persona natural: `42565878` es el DNI y el `10` el
    // prefijo. Es el caso que convierte el campo en PII y no en un dato solo fiscal.
    const auditable = toAuditableExpense(buildExpense({ supplierRuc: '10425658785' }));

    expect(JSON.stringify(auditable)).not.toContain('42565878');
  });

  it('keeps supplierName: a trade name is not an identity document', () => {
    const auditable = toAuditableExpense(buildExpense());

    expect(auditable.supplierName).toBe('Proveedor SAC');
  });

  it('keeps every other field identical, so the bitácora still shows what changed', () => {
    const expense = buildExpense();

    const { supplierRuc, ...rest } = expense;

    expect(toAuditableExpense(expense)).toEqual(rest);
    // La desestructuración de arriba es la aserción; esto solo deja escrito el valor que
    // se retiró para que el caso no se lea como una tautología.
    expect(supplierRuc).toBe('20100128056');
  });

  it('projects positively: a new sensitive column would not slip in on its own', () => {
    const expense = { ...buildExpense(), supplierEmail: 'contacto@proveedor.pe' } as Expense;

    expect(JSON.stringify(toAuditableExpense(expense))).not.toContain('supplierEmail');
  });

  it('works the same on an expense with no receipt at all (AC21)', () => {
    const auditable = toAuditableExpense(
      buildExpense({
        receiptType: null,
        supplierRuc: null,
        supplierName: null,
        receiptSeries: null,
        receiptNumber: null,
        igvCents: null,
      }),
    );

    expect('supplierRuc' in auditable).toBe(false);
    expect(auditable.concept).toBe('Servicio contable de marzo');
  });

  it('keeps the nullable fields as null instead of turning them into undefined', () => {
    const auditable = toAuditableExpense(
      buildExpense({ receiptSeries: null, receiptNumber: null, igvCents: null }),
    );

    expect(auditable.receiptSeries).toBeNull();
    expect(auditable.receiptNumber).toBeNull();
    expect(auditable.igvCents).toBeNull();
  });
});
