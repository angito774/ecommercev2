import { describe, expect, it } from 'vitest';

import { adjustmentAmountFormSchema, orderAdjustmentSchema } from './order-adjustment.schema';

const VALID_BUYER = {
  documentType: 'ruc' as const,
  documentNumber: '20131312955',
  legalName: 'Empresa Ejemplo SAC',
};

describe('orderAdjustmentSchema', () => {
  it('accepts a total cancellation with nothing but its reason', () => {
    const parsed = orderAdjustmentSchema.safeParse({
      intent: 'anulacion_total',
      reasonCode: '01',
    });

    expect(parsed.success).toBe(true);
  });

  // Aceptarlo permitiría «anular totalmente» por menos del total, que es otra operación y
  // ya tiene su propio nombre. La unión lo rechaza sin un solo `if` de saneamiento (D-2).
  it('refuses an amount inside a total cancellation instead of ignoring it in silence', () => {
    const parsed = orderAdjustmentSchema.safeParse({
      intent: 'anulacion_total',
      reasonCode: '01',
      amountCents: 500,
    });

    expect(parsed.success).toBe(false);
  });

  it('refuses a buyer inside an extra charge, which is the case D-2 names', () => {
    const parsed = orderAdjustmentSchema.safeParse({
      intent: 'cargo_adicional',
      reasonCode: '01',
      amountCents: 5_000,
      buyer: VALID_BUYER,
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts a partial refund with an integer amount in cents', () => {
    const parsed = orderAdjustmentSchema.safeParse({
      intent: 'devolucion_parcial',
      reasonCode: '04',
      amountCents: 12_500,
    });

    expect(parsed.success).toBe(true);
  });

  it('refuses a fractional amount: every amount of this API is an integer of cents (AC24)', () => {
    const parsed = orderAdjustmentSchema.safeParse({
      intent: 'devolucion_parcial',
      reasonCode: '04',
      amountCents: 125.5,
    });

    expect(parsed.success).toBe(false);
  });

  it('refuses a zero or negative amount', () => {
    for (const amountCents of [0, -1]) {
      expect(
        orderAdjustmentSchema.safeParse({
          intent: 'devolucion_parcial',
          reasonCode: '04',
          amountCents,
        }).success,
      ).toBe(false);
    }
  });

  it('caps the amount at the same sanity ceiling as every other price of the repo', () => {
    expect(
      orderAdjustmentSchema.safeParse({
        intent: 'devolucion_parcial',
        reasonCode: '04',
        amountCents: 100_000_000,
      }).success,
    ).toBe(false);
  });

  // AC13: el catálogo se valida **contra la intención**, no contra la lista completa. `06`
  // es un motivo legítimo del catálogo 09 y aun así no pertenece a la devolución parcial.
  it('refuses a reason that belongs to another intention (AC13)', () => {
    expect(
      orderAdjustmentSchema.safeParse({
        intent: 'devolucion_parcial',
        reasonCode: '06',
        amountCents: 12_500,
      }).success,
    ).toBe(false);
  });

  it('refuses a reason that is in no catalog at all', () => {
    expect(
      orderAdjustmentSchema.safeParse({ intent: 'anulacion_total', reasonCode: '99' }).success,
    ).toBe(false);
  });

  it('refuses an intention that does not exist', () => {
    expect(
      orderAdjustmentSchema.safeParse({ intent: 'devolucion_por_item', reasonCode: '07' }).success,
    ).toBe(false);
  });

  it('accepts a buyer correction and validates its RUC with the same rule as the checkout', () => {
    expect(
      orderAdjustmentSchema.safeParse({
        intent: 'correccion_comprador',
        reasonCode: '02',
        buyer: VALID_BUYER,
      }).success,
    ).toBe(true);
  });

  it('refuses a buyer correction whose RUC fails its check digit', () => {
    expect(
      orderAdjustmentSchema.safeParse({
        intent: 'correccion_comprador',
        reasonCode: '02',
        buyer: { ...VALID_BUYER, documentNumber: '20131312954' },
      }).success,
    ).toBe(false);
  });

  it('refuses a buyer correction with a legal name on a DNI, like the checkout does', () => {
    expect(
      orderAdjustmentSchema.safeParse({
        intent: 'correccion_comprador',
        reasonCode: '02',
        buyer: { documentType: 'dni', documentNumber: '41281230', legalName: 'Ada Lovelace' },
      }).success,
    ).toBe(false);
  });

  it('refuses a buyer correction with no buyer at all', () => {
    expect(
      orderAdjustmentSchema.safeParse({ intent: 'correccion_comprador', reasonCode: '02' })
        .success,
    ).toBe(false);
  });
});

describe('adjustmentAmountFormSchema', () => {
  it('accepts soles with up to two decimals, which is what the input captures', () => {
    expect(adjustmentAmountFormSchema.safeParse({ amount: '125.50' }).success).toBe(true);
    expect(adjustmentAmountFormSchema.safeParse({ amount: '125' }).success).toBe(true);
  });

  it('refuses a third decimal instead of silently rounding it', () => {
    expect(adjustmentAmountFormSchema.safeParse({ amount: '125.505' }).success).toBe(false);
  });

  it('refuses zero: an adjustment that moves nothing is not an adjustment', () => {
    expect(adjustmentAmountFormSchema.safeParse({ amount: '0.00' }).success).toBe(false);
  });

  it('refuses text that is not a number', () => {
    expect(adjustmentAmountFormSchema.safeParse({ amount: 'ciento veinte' }).success).toBe(false);
  });
});
