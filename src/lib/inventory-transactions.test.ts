import { describe, expect, it } from 'vitest';

import {
  isTransactionTypeCode,
  transactionDirection,
  TRANSACTION_TYPE_CODES,
  TRANSACTION_TYPES,
  transactionTypesByDirection,
} from './inventory-transactions';

describe('TRANSACTION_TYPES', () => {
  it('holds exactly the six rows of the requirement', () => {
    expect(TRANSACTION_TYPES).toHaveLength(6);
  });

  it('splits three and three between the two directions', () => {
    expect(transactionTypesByDirection('ingreso')).toHaveLength(3);
    expect(transactionTypesByDirection('salida')).toHaveLength(3);
  });

  it('has no duplicate codes: the id is the primary key of the seeded table', () => {
    expect(new Set(TRANSACTION_TYPE_CODES).size).toBe(TRANSACTION_TYPES.length);
  });

  it('mirrors every code into TRANSACTION_TYPE_CODES, which is what Zod validates', () => {
    expect([...TRANSACTION_TYPE_CODES]).toEqual(TRANSACTION_TYPES.map((type) => type.id));
  });
});

describe('isTransactionTypeCode', () => {
  it('accepts a code of the catalogue', () => {
    expect(isTransactionTypeCode('ingreso_compra')).toBe(true);
  });

  it('rejects a made-up code: what is not in the code does not exist (AC7)', () => {
    expect(isTransactionTypeCode('ajuste_por_merma')).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isTransactionTypeCode('')).toBe(false);
  });
});

describe('transactionDirection', () => {
  it('reads a sale as an outbound movement', () => {
    expect(transactionDirection('salida_venta')).toBe('salida');
  });

  it('reads a purchase as an inbound movement', () => {
    expect(transactionDirection('ingreso_compra')).toBe('ingreso');
  });

  it('resolves every code of the catalogue', () => {
    for (const type of TRANSACTION_TYPES) {
      expect(transactionDirection(type.id)).toBe(type.direction);
    }
  });
});

describe('transactionTypesByDirection', () => {
  it('only offers outbound types for an outbound note (AC15)', () => {
    expect(
      transactionTypesByDirection('salida').every((type) => type.direction === 'salida'),
    ).toBe(true);
  });

  it('only offers inbound types for an inbound note (AC15)', () => {
    expect(
      transactionTypesByDirection('ingreso').every((type) => type.direction === 'ingreso'),
    ).toBe(true);
  });
});
