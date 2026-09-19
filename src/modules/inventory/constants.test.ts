import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/errors';

import { insufficientStockMessage, stockConflictProductId } from './constants';

const PRODUCT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

function conflict(data: unknown): ApiError {
  return new ApiError('Stock insuficiente', { status: 409, data });
}

describe('stockConflictProductId', () => {
  it('reads the id the 409 carries, which is the line the form has to mark (AC5)', () => {
    expect(
      stockConflictProductId(
        conflict({ message: insufficientStockMessage('Teclado', 1, 5), productId: PRODUCT_ID }),
      ),
    ).toBe(PRODUCT_ID);
  });

  // El 409 de producto repetido no apunta a ninguna línea: sin id, el error se pinta
  // arriba y no sobre una cantidad al azar.
  it('returns null for a 409 without productId', () => {
    expect(stockConflictProductId(conflict({ message: 'Ya existe un registro.' }))).toBeNull();
  });

  it('returns null for another status, even if the body carries a productId', () => {
    expect(
      stockConflictProductId(
        new ApiError('No encontrado', { status: 404, data: { productId: PRODUCT_ID } }),
      ),
    ).toBeNull();
  });

  it('returns null when the body is not an object', () => {
    expect(stockConflictProductId(conflict('Stock insuficiente'))).toBeNull();
    expect(stockConflictProductId(conflict(null))).toBeNull();
  });

  it('returns null when productId is not a string', () => {
    expect(stockConflictProductId(conflict({ productId: 42 }))).toBeNull();
  });

  it('returns null for a plain Error: a network failure names no line', () => {
    expect(stockConflictProductId(new Error('Network Error'))).toBeNull();
  });
});
