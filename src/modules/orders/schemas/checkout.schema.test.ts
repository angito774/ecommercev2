import { describe, expect, it } from 'vitest';

import { MAX_LINE_QUANTITY } from '@/modules/cart/constants';

import { MAX_CHECKOUT_LINES } from '../constants';
import {
  buyerFormSchema,
  buyerSchema,
  checkoutLineSchema,
  checkoutSchema,
  toBuyerPayload,
} from './checkout.schema';

const VALID_PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

const VALID_DNI = '41281230';
const VALID_RUC = '20131312955';

// El comprador mínimo válido: boleta con DNI y sin razón social.
const VALID_BUYER = { documentType: 'dni', documentNumber: VALID_DNI } as const;

/** El primer mensaje que cuelga de un campo concreto, que es lo que pinta el formulario. */
function issueFor(result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }, field: string) {
  return result.error?.issues.find((issue) => issue.path[0] === field)?.message;
}

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
      buyer: VALID_BUYER,
    });

    expect(result).toEqual({
      lines: [{ productId: VALID_PRODUCT_ID, quantity: 2 }],
      buyer: { documentType: 'dni', documentNumber: VALID_DNI },
    });
  });

  it('accepts a valid cart with multiple distinct products', () => {
    const result = checkoutSchema.parse({
      lines: [
        { productId: VALID_PRODUCT_ID, quantity: 1 },
        { productId: OTHER_PRODUCT_ID, quantity: 3 },
      ],
      buyer: VALID_BUYER,
    });

    expect(result.lines).toHaveLength(2);
  });

  it('rejects an empty cart', () => {
    expect(() => checkoutSchema.parse({ lines: [], buyer: VALID_BUYER })).toThrow();
  });

  it('rejects duplicated products in the cart', () => {
    expect(() =>
      checkoutSchema.parse({
        lines: [
          { productId: VALID_PRODUCT_ID, quantity: 1 },
          { productId: VALID_PRODUCT_ID, quantity: 2 },
        ],
        buyer: VALID_BUYER,
      }),
    ).toThrow('Hay productos repetidos en el carrito.');
  });

  it(`accepts a cart at the ${MAX_CHECKOUT_LINES}-line maximum`, () => {
    const lines = Array.from({ length: MAX_CHECKOUT_LINES }, (_, index) => ({
      productId: `11111111-1111-4111-8111-1111111111${String(index).padStart(2, '0')}`,
      quantity: 1,
    }));

    const result = checkoutSchema.parse({ lines, buyer: VALID_BUYER });
    expect(result.lines).toHaveLength(MAX_CHECKOUT_LINES);
  });

  it(`rejects a cart with more than ${MAX_CHECKOUT_LINES} lines`, () => {
    const lines = Array.from({ length: MAX_CHECKOUT_LINES + 1 }, (_, index) => ({
      productId: `11111111-1111-4111-8111-1111111111${String(index).padStart(2, '0')}`,
      quantity: 1,
    }));

    expect(() => checkoutSchema.parse({ lines, buyer: VALID_BUYER })).toThrow();
  });

  it('rejects a cart with an invalid line', () => {
    expect(() =>
      checkoutSchema.parse({
        lines: [{ productId: 'not-a-uuid', quantity: 1 }],
        buyer: VALID_BUYER,
      }),
    ).toThrow();
  });

  it('rejects a body with no buyer at all: there is no anonymous boleta branch (AC1, D-3)', () => {
    expect(() =>
      checkoutSchema.parse({ lines: [{ productId: VALID_PRODUCT_ID, quantity: 1 }] }),
    ).toThrow();
  });

  it('rejects an invalid buyer even when the cart is impeccable (AC1)', () => {
    const result = checkoutSchema.safeParse({
      lines: [{ productId: VALID_PRODUCT_ID, quantity: 1 }],
      buyer: { documentType: 'dni', documentNumber: '123' },
    });

    expect(result.success).toBe(false);
  });
});

describe('buyerSchema', () => {
  it('accepts a DNI without a legal name: that is a boleta', () => {
    const result = buyerSchema.parse({ documentType: 'dni', documentNumber: VALID_DNI });

    expect(result).toEqual({ documentType: 'dni', documentNumber: VALID_DNI });
  });

  it('accepts a RUC with a legal name: that is a factura', () => {
    const result = buyerSchema.parse({
      documentType: 'ruc',
      documentNumber: VALID_RUC,
      legalName: 'Empresa Ejemplo SAC',
    });

    expect(result.legalName).toBe('Empresa Ejemplo SAC');
  });

  it('rejects a document type outside the two the catalogue declares', () => {
    expect(
      buyerSchema.safeParse({ documentType: 'ce', documentNumber: VALID_DNI }).success,
    ).toBe(false);
  });

  it('names the length when the DNI is short, and hangs the error on documentNumber (AC2)', () => {
    const result = buyerSchema.safeParse({ documentType: 'dni', documentNumber: '4128' });

    expect(result.success).toBe(false);
    expect(issueFor(result, 'documentNumber')).toBe('El DNI son 8 dígitos.');
  });

  it('names the length when the RUC is short (AC2)', () => {
    const result = buyerSchema.safeParse({
      documentType: 'ruc',
      documentNumber: '2013131',
      legalName: 'Empresa Ejemplo SAC',
    });

    expect(issueFor(result, 'documentNumber')).toBe('El RUC son 11 dígitos.');
  });

  it('distinguishes a wrong check digit from a wrong length (AC2)', () => {
    const result = buyerSchema.safeParse({
      documentType: 'ruc',
      documentNumber: '20131312956',
      legalName: 'Empresa Ejemplo SAC',
    });

    expect(result.success).toBe(false);
    expect(issueFor(result, 'documentNumber')).toContain('no es válido');
    expect(issueFor(result, 'documentNumber')).not.toContain('11 dígitos');
  });

  it('rejects a document with separators instead of trying to clean it up', () => {
    const result = buyerSchema.safeParse({
      documentType: 'dni',
      documentNumber: '4128-1230',
    });

    expect(issueFor(result, 'documentNumber')).toBe('El documento solo admite dígitos.');
  });

  it('rejects a RUC with no legal name, on the legalName field (AC3)', () => {
    const result = buyerSchema.safeParse({
      documentType: 'ruc',
      documentNumber: VALID_RUC,
    });

    expect(result.success).toBe(false);
    expect(issueFor(result, 'legalName')).toBe('La factura necesita la razón social.');
  });

  it('rejects a DNI that carries a legal name: only a factura has one (AC3)', () => {
    const result = buyerSchema.safeParse({
      documentType: 'dni',
      documentNumber: VALID_DNI,
      legalName: 'Empresa Ejemplo SAC',
    });

    expect(result.success).toBe(false);
    expect(issueFor(result, 'legalName')).toBe(
      'La razón social solo se registra en una factura.',
    );
  });

  it('trims the document before validating, so a pasted value with spaces works', () => {
    const result = buyerSchema.parse({ documentType: 'dni', documentNumber: `  ${VALID_DNI} ` });

    expect(result.documentNumber).toBe(VALID_DNI);
  });
});

describe('buyerFormSchema', () => {
  it('treats an empty legal name as absent, which is what an unfilled input sends', () => {
    const result = buyerFormSchema.parse({
      documentType: 'dni',
      documentNumber: VALID_DNI,
      legalName: '',
    });

    expect(result.legalName).toBe('');
  });

  it('applies the same rule as the API: a RUC with an empty legal name is invalid (AC3)', () => {
    const result = buyerFormSchema.safeParse({
      documentType: 'ruc',
      documentNumber: VALID_RUC,
      legalName: '   ',
    });

    expect(result.success).toBe(false);
    expect(issueFor(result, 'legalName')).toBe('La factura necesita la razón social.');
  });

  it('applies the same check digit rule as the API', () => {
    const result = buyerFormSchema.safeParse({
      documentType: 'ruc',
      documentNumber: '20131312956',
      legalName: 'Empresa Ejemplo SAC',
    });

    expect(result.success).toBe(false);
  });
});

describe('toBuyerPayload', () => {
  it('drops the empty legal name instead of sending an empty string', () => {
    // `''` es exactamente lo que el CHECK `orders_buyer_legal_name_requires_ruc` no admite
    // en una boleta, y lo que `buyerSchema` rechazaría por `.min(2)`.
    expect(
      toBuyerPayload({ documentType: 'dni', documentNumber: VALID_DNI, legalName: '' }),
    ).toEqual({ documentType: 'dni', documentNumber: VALID_DNI, legalName: undefined });
  });

  it('produces a body that the API schema accepts, for both types', () => {
    const boleta = toBuyerPayload({
      documentType: 'dni',
      documentNumber: VALID_DNI,
      legalName: '',
    });
    const factura = toBuyerPayload({
      documentType: 'ruc',
      documentNumber: VALID_RUC,
      legalName: 'Empresa Ejemplo SAC',
    });

    expect(buyerSchema.safeParse(boleta).success).toBe(true);
    expect(buyerSchema.safeParse(factura).success).toBe(true);
  });
});
