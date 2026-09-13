import { describe, expect, it } from 'vitest';

import { MAX_LINE_QUANTITY } from '@/modules/cart/constants';

import { MAX_CHECKOUT_LINES } from '../constants';
import { checkoutLineSchema, checkoutSchema } from './checkout.schema';

const VALID_PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

describe('checkoutLineSchema', () => {
  describe('productId', () => {
    it('accepts a valid UUID', () => {
      const result = checkoutLineSchema.parse({ productId: VALID_PRODUCT_ID, quantity: 1 });
      expect(result.productId).toBe(VALID_PRODUCT_ID);
    });

    it('rejects a value that is not a UUID', () => {
      expect(() =>
        checkoutLineSchema.parse({ productId: 'not-a-uuid', quantity: 1 }),
      ).toThrow();
    });

    it('rejects a missing productId', () => {
      expect(() => checkoutLineSchema.parse({ quantity: 1 })).toThrow();
    });
  });

  describe('quantity', () => {
    it('rejects a quantity of 0', () => {
      expect(() =>
        checkoutLineSchema.parse({ productId: VALID_PRODUCT_ID, quantity: 0 }),
      ).toThrow();
    });

    it('rejects a negative quantity', () => {
      expect(() =>
        checkoutLineSchema.parse({ productId: VALID_PRODUCT_ID, quantity: -1 }),
      ).toThrow();
    });

    it('rejects a non-integer quantity', () => {
      expect(() =>
        checkoutLineSchema.parse({ productId: VALID_PRODUCT_ID, quantity: 1.5 }),
      ).toThrow();
    });

    it('accepts the minimum value of 1', () => {
      const result = checkoutLineSchema.parse({ productId: VALID_PRODUCT_ID, quantity: 1 });
      expect(result.quantity).toBe(1);
    });

    it(`accepts the maximum value of ${MAX_LINE_QUANTITY}`, () => {
      const result = checkoutLineSchema.parse({
        productId: VALID_PRODUCT_ID,
        quantity: MAX_LINE_QUANTITY,
      });
      expect(result.quantity).toBe(MAX_LINE_QUANTITY);
    });

    it(`rejects a quantity above ${MAX_LINE_QUANTITY}`, () => {
      expect(() =>
        checkoutLineSchema.parse({
          productId: VALID_PRODUCT_ID,
          quantity: MAX_LINE_QUANTITY + 1,
        }),
      ).toThrow();
    });

    it('accepts a quantity within range', () => {
      const result = checkoutLineSchema.parse({ productId: VALID_PRODUCT_ID, quantity: 5 });
      expect(result.quantity).toBe(5);
    });
  });
});

describe('checkoutSchema', () => {
  it('accepts a valid cart with a single line', () => {
    const result = checkoutSchema.parse({
      lines: [{ productId: VALID_PRODUCT_ID, quantity: 2 }],
    });

    expect(result).toEqual({
      lines: [{ productId: VALID_PRODUCT_ID, quantity: 2 }],
    });
  });

  it('accepts a valid cart with multiple distinct products', () => {
    const result = checkoutSchema.parse({
      lines: [
        { productId: VALID_PRODUCT_ID, quantity: 1 },
        { productId: OTHER_PRODUCT_ID, quantity: 3 },
      ],
    });

    expect(result.lines).toHaveLength(2);
  });

  it('rejects an empty cart', () => {
    expect(() => checkoutSchema.parse({ lines: [] })).toThrow();
  });

  it('rejects duplicated products in the cart', () => {
    expect(() =>
      checkoutSchema.parse({
        lines: [
          { productId: VALID_PRODUCT_ID, quantity: 1 },
          { productId: VALID_PRODUCT_ID, quantity: 2 },
        ],
      }),
    ).toThrow('Hay productos repetidos en el carrito.');
  });

  it(`accepts a cart at the ${MAX_CHECKOUT_LINES}-line maximum`, () => {
    const lines = Array.from({ length: MAX_CHECKOUT_LINES }, (_, index) => ({
      productId: `11111111-1111-4111-8111-1111111111${String(index).padStart(2, '0')}`,
      quantity: 1,
    }));

    const result = checkoutSchema.parse({ lines });
    expect(result.lines).toHaveLength(MAX_CHECKOUT_LINES);
  });

  it(`rejects a cart with more than ${MAX_CHECKOUT_LINES} lines`, () => {
    const lines = Array.from({ length: MAX_CHECKOUT_LINES + 1 }, (_, index) => ({
      productId: `11111111-1111-4111-8111-1111111111${String(index).padStart(2, '0')}`,
      quantity: 1,
    }));

    expect(() => checkoutSchema.parse({ lines })).toThrow();
  });

  it('rejects a cart with an invalid line', () => {
    expect(() =>
      checkoutSchema.parse({ lines: [{ productId: 'not-a-uuid', quantity: 1 }] }),
    ).toThrow();
  });
});
