import { describe, expect, it, vi } from 'vitest';

// El service importa el cliente de Stripe de forma incondicional, y ese módulo lleva
// `server-only` y exige `STRIPE_SECRET_KEY`. Las piezas bajo prueba son las puras —la clave
// de idempotencia, la clasificación del fallo del proveedor, las precondiciones y la
// bitácora—; `adjustOrder`, que sí habla con la base y con Stripe, no se ejercita aquí.
vi.mock('@/lib/stripe', () => ({ stripe: {} }));

import { ConflictError, ValidationError } from '@/lib/errors';
import { planAdjustment } from '@/modules/invoicing/lib/adjustment';
import type { OrderAdjustmentInput } from '@/modules/invoicing/schemas/order-adjustment.schema';

import {
  assertAdjustable,
  buildIdempotencyKey,
  toAuditMetadata,
  toRefundErrorMessage,
} from './order-adjustment.service';

const ORDER_ID = '44444444-4444-4444-8444-444444444444';
const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555';
const ISSUED_AT = new Date('2026-09-20T15:00:00.000Z');

type AssertArgs = Parameters<typeof assertAdjustable>[0];

function buildOrder(overrides: Partial<AssertArgs['order']> = {}): AssertArgs['order'] {
  return {
    status: 'paid',
    amountTotalCents: 311_700,
    refundedAmountCents: 0,
    ...overrides,
  };
}

function buildOriginal(
  overrides: Partial<NonNullable<AssertArgs['original']>> = {},
): NonNullable<AssertArgs['original']> {
  return {
    id: DOCUMENT_ID,
    kind: 'boleta',
    amountCents: 311_700,
    issuedAt: ISSUED_AT,
    ...overrides,
  };
}

const TOTAL_CANCELLATION = { intent: 'anulacion_total', reasonCode: '01' } as const;

const PARTIAL_REFUND = {
  intent: 'devolucion_parcial',
  reasonCode: '04',
  amountCents: 50_000,
} as const;

const BUYER_CORRECTION = {
  intent: 'correccion_comprador',
  reasonCode: '02',
  buyer: {
    documentType: 'ruc',
    documentNumber: '20131312955',
    legalName: 'Empresa Ejemplo SAC',
  },
} as const;

function check(input: OrderAdjustmentInput, args: Partial<AssertArgs> = {}) {
  return assertAdjustable({
    input,
    order: buildOrder(),
    original: buildOriginal(),
    ...args,
  });
}

describe('buildIdempotencyKey', () => {
  // D-4: la misma operación produce la misma clave, así que Stripe devuelve el refund ya
  // creado en vez de uno nuevo. Es lo que hace que un fallo de la `tx B` no devuelva el
  // dinero dos veces al reintentar (AC8, AC10).
  it('produces the same key for the same operation on the same state', () => {
    expect(buildIdempotencyKey(ORDER_ID, 0)).toBe(buildIdempotencyKey(ORDER_ID, 0));
  });

  // Y un ajuste posterior *legítimo* parte de un `refundedBefore` distinto, así que su
  // clave también lo es y no se bloquea contra el refund anterior.
  it('produces a different key once the order has already been refunded something', () => {
    expect(buildIdempotencyKey(ORDER_ID, 0)).not.toBe(buildIdempotencyKey(ORDER_ID, 50_000));
  });

  // **El importe no entra en la clave, y es la propiedad que impide la fuga de dinero.**
  // Dos administradores que parten del mismo estado con importes distintos comparten clave:
  // Stripe rechaza el segundo por reuso con parámetros distintos en vez de crear un refund
  // real que el 409 del `UPDATE` condicional dejaría sin registrar (AC9).
  it('shares the key between two concurrent adjustments from the same state, whatever the amount', () => {
    // Dos administradores leen `refundedBefore = 0` y piden 10 000 y 20 000 céntimos. La
    // clave no los distingue —el importe no aparece en ella—, así que Stripe ve un reuso y
    // rechaza el segundo en lugar de crear un refund real que el 409 dejaría sin registrar.
    const firstAdmin = buildIdempotencyKey(ORDER_ID, 0);
    const secondAdmin = buildIdempotencyKey(ORDER_ID, 0);

    expect(firstAdmin).toBe(secondAdmin);
    expect(firstAdmin).not.toContain('10000');
    expect(firstAdmin).not.toContain('20000');
  });

  it('produces a different key for another order', () => {
    expect(buildIdempotencyKey(ORDER_ID, 0)).not.toBe(
      buildIdempotencyKey('11111111-1111-4111-8111-111111111111', 0),
    );
  });

  // Nada aleatorio dentro: un uuid nuevo por intento cubriría el reintento del mismo botón
  // pero no a dos administradores simultáneos, y habría que persistirlo.
  it('derives the key from the state alone, with nothing random in it (D-4)', () => {
    expect(buildIdempotencyKey(ORDER_ID, 0)).toBe(`refund:${ORDER_ID}:0`);
  });
});

describe('toRefundErrorMessage', () => {
  function stripeError(type: string, message: string): Error {
    return Object.assign(new Error(message), { type });
  }

  it('quotes the provider text on a rejection, which is the only thing that explains it', () => {
    const message = toRefundErrorMessage(
      stripeError('StripeInvalidRequestError', 'This payment method cannot be refunded'),
    );

    expect(message).toContain('This payment method cannot be refunded');
  });

  it('quotes the minimum-amount rejection too, instead of a generic "no se pudo"', () => {
    const message = toRefundErrorMessage(
      stripeError('StripeInvalidRequestError', 'Amount must be at least 50 cents'),
    );

    expect(message).toContain('Amount must be at least 50 cents');
  });

  // Un fallo de red o un 5xx de Stripe no describen nada que el administrador pueda
  // corregir, y sí tiene sentido reintentarlos: el mensaje dice justamente eso.
  it('says "retry" on a connection failure, with no provider text to quote', () => {
    const message = toRefundErrorMessage(stripeError('StripeConnectionError', 'socket hang up'));

    expect(message).not.toContain('socket hang up');
    expect(message).toContain('Vuelve a intentarlo');
  });

  it('says "retry" on a Stripe-side API error as well', () => {
    expect(toRefundErrorMessage(stripeError('StripeAPIError', 'boom'))).toContain(
      'Vuelve a intentarlo',
    );
  });

  it('falls back to the generic message for something that is not an Error at all', () => {
    expect(toRefundErrorMessage('boom')).toContain('Vuelve a intentarlo');
    expect(toRefundErrorMessage(null)).toContain('Vuelve a intentarlo');
  });

  it('falls back to the generic message for an Error with no Stripe type', () => {
    expect(toRefundErrorMessage(new Error('something'))).toContain('Vuelve a intentarlo');
  });

  it('falls back rather than quoting an empty message', () => {
    expect(toRefundErrorMessage(stripeError('StripeInvalidRequestError', '   '))).toContain(
      'Vuelve a intentarlo',
    );
  });
});

describe('assertAdjustable', () => {
  it('lets a normal paid order with an issued original through', () => {
    const original = check(PARTIAL_REFUND);

    expect(original.id).toBe(DOCUMENT_ID);
    expect(original.kind).toBe('boleta');
    expect(original.issuedAt).toBe(ISSUED_AT);
  });

  // AC4: y ocurre en la `tx A`, antes de cualquier llamada a Stripe.
  it('refuses an order that is not paid, naming its current state (AC4)', () => {
    for (const status of ['pending', 'payment_failed', 'canceled'] as const) {
      expect(() => check(PARTIAL_REFUND, { order: buildOrder({ status }) })).toThrow(
        ConflictError,
      );
    }
  });

  it('names the state in the message, instead of a bare "no se pudo"', () => {
    expect(() => check(PARTIAL_REFUND, { order: buildOrder({ status: 'pending' }) })).toThrow(
      /Pendiente/,
    );
  });

  // AC5: no se puede acreditar un documento que SUNAT todavía no tiene.
  it('refuses an order whose original comprobante is not issued yet (AC5)', () => {
    expect(() => check(PARTIAL_REFUND, { original: null })).toThrow(ConflictError);
  });

  it('points at the action that is available in the same screen', () => {
    expect(() => check(PARTIAL_REFUND, { original: null })).toThrow(/Emite primero/);
  });

  it('checks the state of the order before the state of its comprobante', () => {
    // Un pedido `pending` no tiene original emitido tampoco, y el mensaje útil es el del
    // pedido: decirle «emite el comprobante» de algo que no se ha cobrado sería un callejón.
    expect(() =>
      check(PARTIAL_REFUND, { order: buildOrder({ status: 'pending' }), original: null }),
    ).toThrow(/Pendiente/);
  });

  it('refuses an original with no amount instead of hiding a corrupt row behind a 500', () => {
    expect(() => check(PARTIAL_REFUND, { original: buildOriginal({ amountCents: null }) })).toThrow(
      ConflictError,
    );
  });

  it('refuses an original with no issuance date', () => {
    expect(() => check(PARTIAL_REFUND, { original: buildOriginal({ issuedAt: null }) })).toThrow(
      ConflictError,
    );
  });

  it('refuses a parent that is not an original comprobante', () => {
    expect(() =>
      check(PARTIAL_REFUND, { original: buildOriginal({ kind: 'nota_credito' }) }),
    ).toThrow(ConflictError);
  });

  // AC16 / D-7: corregir datos y devolver dinero son dos historias que no se mezclan.
  it('refuses a buyer correction over an order with a previous refund (AC16)', () => {
    expect(() =>
      check(BUYER_CORRECTION, { order: buildOrder({ refundedAmountCents: 1 }) }),
    ).toThrow(ConflictError);
  });

  it('explains why, because the rule is not self-evident', () => {
    expect(() =>
      check(BUYER_CORRECTION, { order: buildOrder({ refundedAmountCents: 1 }) }),
    ).toThrow(/neto/);
  });

  it('allows a buyer correction on an order that was never refunded', () => {
    expect(() => check(BUYER_CORRECTION)).not.toThrow();
  });

  // AC6: un 400 y no un 409 —el recurso no está en conflicto, el importe es incorrecto—.
  it('refuses a partial refund over the remaining balance with a ValidationError (AC6)', () => {
    expect(() =>
      check(
        { intent: 'devolucion_parcial', reasonCode: '04', amountCents: 311_701 },
        { order: buildOrder() },
      ),
    ).toThrow(ValidationError);
  });

  it('puts the available balance in the message, so it can be fixed without closing', () => {
    expect(() =>
      check(
        { intent: 'devolucion_parcial', reasonCode: '04', amountCents: 300_000 },
        { order: buildOrder({ refundedAmountCents: 200_000 }) },
      ),
      // 311 700 − 200 000 = 111 700 céntimos, que son S/ 1 117,00: el saldo formateado, no
      // el entero desnudo. La división por 100 solo ocurre al formatear (AC24).
    ).toThrow(/1[.,]117[.,]00/);
  });

  it('accepts a partial refund for exactly the remaining balance', () => {
    expect(() =>
      check(
        { intent: 'devolucion_parcial', reasonCode: '04', amountCents: 111_700 },
        { order: buildOrder({ refundedAmountCents: 200_000 }) },
      ),
    ).not.toThrow();
  });

  it('refuses a total cancellation over an order already refunded in full', () => {
    expect(() =>
      check(TOTAL_CANCELLATION, { order: buildOrder({ refundedAmountCents: 311_700 }) }),
    ).toThrow(ConflictError);
  });

  it('allows a total cancellation of whatever balance is left', () => {
    expect(() =>
      check(TOTAL_CANCELLATION, { order: buildOrder({ refundedAmountCents: 100_000 }) }),
    ).not.toThrow();
  });

  // La nota de débito no toca el saldo: documenta un importe **mayor** (AC18, D-8).
  it('allows an extra charge on a fully refunded order: it moves no money', () => {
    expect(() =>
      check(
        { intent: 'cargo_adicional', reasonCode: '02', amountCents: 20_000 },
        { order: buildOrder({ refundedAmountCents: 311_700 }) },
      ),
    ).not.toThrow();
  });
});

describe('toAuditMetadata', () => {
  const plan = planAdjustment({
    input: PARTIAL_REFUND,
    original: { kind: 'boleta', amountCents: 311_700, issuedAt: ISSUED_AT },
    amountTotalCents: 311_700,
    refundedAmountCents: 0,
    now: new Date('2026-09-22T15:00:00.000Z'),
  });

  it('records the order, the intention, the mechanism, the reason and the amount (AC19)', () => {
    const metadata = toAuditMetadata({
      orderId: ORDER_ID,
      intent: 'devolucion_parcial',
      plan,
      documentId: DOCUMENT_ID,
    });

    expect(metadata).toEqual({
      orderId: ORDER_ID,
      intent: 'devolucion_parcial',
      kind: 'nota_credito',
      reasonCode: '04',
      amountCents: 50_000,
      refundCents: 50_000,
      documentId: DOCUMENT_ID,
    });
  });

  // AC19 / §10: ni el documento del comprador, ni su razón social, ni el objeto `Refund`,
  // ni el `payment_intent`. `audit` y `manager` leen la bitácora íntegra.
  it('never carries the buyer document, the legal name or any raw Stripe object', () => {
    const serialized = JSON.stringify(
      toAuditMetadata({
        orderId: ORDER_ID,
        intent: 'correccion_comprador',
        plan,
        documentId: DOCUMENT_ID,
      }),
    );

    expect(serialized).not.toContain('20131312955');
    expect(serialized).not.toContain('Empresa Ejemplo SAC');
    expect(serialized).not.toContain('pi_');
    expect(serialized).not.toContain('re_');
    expect(serialized).not.toContain('client_secret');
  });
});
