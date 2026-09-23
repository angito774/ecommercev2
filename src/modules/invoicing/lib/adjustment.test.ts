import { describe, expect, it } from 'vitest';

import type { OrderAdjustmentInput } from '../schemas/order-adjustment.schema';

import { canVoidWithCommunication, planAdjustment, voidsParent } from './adjustment';

const ISSUED_AT = new Date('2026-09-20T15:00:00.000Z');
const NOW = new Date('2026-09-22T15:00:00.000Z');

const ORIGINAL = { kind: 'boleta', amountCents: 311_700, issuedAt: ISSUED_AT } as const;

function plan(input: OrderAdjustmentInput, overrides: Partial<Parameters<typeof planAdjustment>[0]> = {}) {
  return planAdjustment({
    input,
    original: ORIGINAL,
    amountTotalCents: 311_700,
    refundedAmountCents: 0,
    now: NOW,
    ...overrides,
  });
}

describe('canVoidWithCommunication', () => {
  // D-12: mientras la regla no se confirme contra la norma, `false` significa «siempre nota
  // de crédito», que es el mecanismo general y nunca es inválido. El test fija el
  // comportamiento vigente, no la regla futura.
  it('says no for a boleta, whatever the dates', () => {
    expect(canVoidWithCommunication({ kind: 'boleta', issuedAt: ISSUED_AT }, NOW)).toBe(false);
  });

  it('says no for a factura too, including one issued minutes ago', () => {
    expect(canVoidWithCommunication({ kind: 'factura', issuedAt: NOW }, NOW)).toBe(false);
  });

  // El plazo se contará desde la **emisión** del original y no desde el cobro (§10): con la
  // emisión manual esos dos instantes pueden estar separados por días. La firma ya lo
  // refleja, y este caso es el que cambiará de valor el día que la regla se active.
  it('takes the issuance date of the original, not the date of the order', () => {
    const justIssued = canVoidWithCommunication({ kind: 'factura', issuedAt: NOW }, NOW);
    const longIssued = canVoidWithCommunication(
      { kind: 'factura', issuedAt: new Date('2026-01-01T00:00:00.000Z') },
      NOW,
    );

    expect(justIssued).toBe(longIssued);
    expect(justIssued).toBe(false);
  });
});

describe('voidsParent', () => {
  it('always voids the parent from a comunicación de baja', () => {
    expect(voidsParent({ kind: 'comunicacion_baja', reasonCode: '01' })).toBe(true);
  });

  it('voids the parent from a credit note that cancels the whole operation (01, 06)', () => {
    expect(voidsParent({ kind: 'nota_credito', reasonCode: '01' })).toBe(true);
    expect(voidsParent({ kind: 'nota_credito', reasonCode: '06' })).toBe(true);
  });

  it('voids the parent from a credit note that corrects the buyer data (02, 03)', () => {
    expect(voidsParent({ kind: 'nota_credito', reasonCode: '02' })).toBe(true);
    expect(voidsParent({ kind: 'nota_credito', reasonCode: '03' })).toBe(true);
  });

  it('leaves the parent alive after a partial refund: the sale still happened', () => {
    for (const reasonCode of ['04', '07', '09']) {
      expect(voidsParent({ kind: 'nota_credito', reasonCode })).toBe(false);
    }
  });

  // Una nota de débito documenta un importe **mayor**: el original sigue describiendo una
  // venta que ocurrió, y anularlo dejaría al pedido sin comprobante vigente.
  it('never voids the parent from a debit note, whatever its reason', () => {
    for (const reasonCode of ['01', '02', '03']) {
      expect(voidsParent({ kind: 'nota_debito', reasonCode })).toBe(false);
    }
  });

  it('never voids anything from an original comprobante', () => {
    expect(voidsParent({ kind: 'boleta', reasonCode: null })).toBe(false);
    expect(voidsParent({ kind: 'factura', reasonCode: '01' })).toBe(false);
  });

  it('treats a credit note with no reason as not voiding, instead of guessing', () => {
    expect(voidsParent({ kind: 'nota_credito', reasonCode: null })).toBe(false);
  });
});

describe('planAdjustment — anulacion_total (rule 1)', () => {
  it('refunds exactly the balance that was not refunded yet (AC12)', () => {
    const result = plan({ intent: 'anulacion_total', reasonCode: '01' });

    expect(result.refundCents).toBe(311_700);
  });

  it('refunds only the remaining balance when a partial refund came first', () => {
    const result = plan(
      { intent: 'anulacion_total', reasonCode: '01' },
      { refundedAmountCents: 100_000 },
    );

    expect(result.refundCents).toBe(211_700);
  });

  it('chooses a credit note while canVoidWithCommunication says no (D-12)', () => {
    const result = plan({ intent: 'anulacion_total', reasonCode: '06' });

    expect(result.kind).toBe('nota_credito');
    expect(result.amountCents).toBe(311_700);
  });

  it('voids the parent with either of its two reasons', () => {
    expect(plan({ intent: 'anulacion_total', reasonCode: '01' }).voidsParent).toBe(true);
    expect(plan({ intent: 'anulacion_total', reasonCode: '06' }).voidsParent).toBe(true);
  });

  it('carries the reason the caller chose, never one of its own', () => {
    expect(plan({ intent: 'anulacion_total', reasonCode: '06' }).reasonCode).toBe('06');
  });
});

describe('planAdjustment — devolucion_parcial (rule 2)', () => {
  const input = { intent: 'devolucion_parcial', reasonCode: '04', amountCents: 50_000 } as const;

  it('issues a credit note for the requested amount and refunds the same amount', () => {
    const result = plan(input);

    expect(result.kind).toBe('nota_credito');
    expect(result.amountCents).toBe(50_000);
    expect(result.refundCents).toBe(50_000);
  });

  it('leaves the parent alive: part of the sale still stands (AC7)', () => {
    expect(plan(input).voidsParent).toBe(false);
  });

  it('ignores the balance already refunded: the amount is the one that was asked for', () => {
    expect(plan(input, { refundedAmountCents: 100_000 }).amountCents).toBe(50_000);
  });
});

describe('planAdjustment — correccion_comprador (rule 3)', () => {
  const input = {
    intent: 'correccion_comprador',
    reasonCode: '02',
    buyer: { documentType: 'ruc', documentNumber: '20131312955', legalName: 'Empresa Ejemplo SAC' },
  } as const;

  it('moves no money at all: what is wrong is the data, not the amount', () => {
    expect(plan(input).refundCents).toBe(0);
  });

  it('credits the whole amount of the original, not the total of the order', () => {
    const result = plan(input, {
      original: { kind: 'factura', amountCents: 250_000, issuedAt: ISSUED_AT },
    });

    expect(result.amountCents).toBe(250_000);
  });

  it('voids the parent, which is what lets the reissue be born (AC15)', () => {
    expect(plan(input).voidsParent).toBe(true);
  });

  it('uses the same mechanism as a total cancellation', () => {
    expect(plan(input).kind).toBe('nota_credito');
  });
});

describe('planAdjustment — cargo_adicional (rule 4)', () => {
  const input = { intent: 'cargo_adicional', reasonCode: '02', amountCents: 20_000 } as const;

  it('issues a debit note for the requested amount', () => {
    expect(plan(input).kind).toBe('nota_debito');
    expect(plan(input).amountCents).toBe(20_000);
  });

  it('refunds nothing and charges nothing (AC18, D-8)', () => {
    expect(plan(input).refundCents).toBe(0);
  });

  it('leaves the parent alive', () => {
    expect(plan(input).voidsParent).toBe(false);
  });
});

describe('planAdjustment — rule 5: the baja carries no amount', () => {
  // La baja está construida de punta a punta y hoy no se elige porque
  // `canVoidWithCommunication()` devuelve `false` (D-12). Esta prueba fija la invariante
  // que el `CHECK electronic_documents_void_has_no_amount` exige, para que el día que la
  // regla se active el plan ya sea correcto.
  it('is the invariant the CHECK enforces: kind = comunicacion_baja iff amountCents is null', () => {
    const plans = [
      plan({ intent: 'anulacion_total', reasonCode: '01' }),
      plan({ intent: 'devolucion_parcial', reasonCode: '04', amountCents: 50_000 }),
      plan({ intent: 'cargo_adicional', reasonCode: '02', amountCents: 20_000 }),
    ];

    for (const result of plans) {
      expect(result.kind === 'comunicacion_baja').toBe(result.amountCents === null);
    }
  });

  it('never plans an original comprobante: an adjustment only creates corrections', () => {
    const kinds = [
      plan({ intent: 'anulacion_total', reasonCode: '01' }).kind,
      plan({ intent: 'devolucion_parcial', reasonCode: '07', amountCents: 1 }).kind,
      plan({ intent: 'cargo_adicional', reasonCode: '03', amountCents: 1 }).kind,
    ];

    expect(kinds).not.toContain('boleta');
    expect(kinds).not.toContain('factura');
  });
});
