import { describe, expect, it } from 'vitest';

import { toCents } from '../lib/price';
import {
  COMPARE_AT_PRICE_MESSAGE,
  createProductSchema,
  isValidComparePrice,
  POSITIVE_PRICE_MESSAGE,
  productFormSchema,
  productIdSchema,
  productQuerySchema,
  productSlugSchema,
  skuSchema,
  updateProductSchema,
} from './product.schema';

const validCategoryId = '11111111-1111-4111-8111-111111111111';

const validProductPayload = {
  sku: 'SKU-001',
  name: 'Laptop Gamer',
  slug: 'laptop-gamer',
  description: 'Equipo potente',
  imageUrl: 'https://example.com/laptop.png',
  priceCents: 129990,
  compareAtPriceCents: 149900,
  stock: 5,
  specs: { RAM: '16GB' },
  categoryId: validCategoryId,
  isActive: true,
};

// Los tests de "campo omitido" necesitan el payload válido sin una clave puntual;
// desestructurar in situ deja la variable extraída sin usar y el lint se queja.
function withoutField<T extends object, K extends keyof T>(payload: T, field: K): Omit<T, K> {
  const clone: Partial<T> = { ...payload };
  delete clone[field];
  return clone as Omit<T, K>;
}

describe('isValidComparePrice', () => {
  it('accepts a compare price greater than the current price', () => {
    expect(isValidComparePrice(1000, 1500)).toBe(true);
  });

  it('rejects a compare price equal to the current price', () => {
    expect(isValidComparePrice(1000, 1000)).toBe(false);
  });

  it('rejects a compare price lower than the current price', () => {
    expect(isValidComparePrice(1000, 900)).toBe(false);
  });

  it('accepts a null compare price', () => {
    expect(isValidComparePrice(1000, null)).toBe(true);
  });

  it('accepts an undefined compare price', () => {
    expect(isValidComparePrice(1000, undefined)).toBe(true);
  });

  it('accepts a compare price of zero over a negative-free current price only when greater', () => {
    expect(isValidComparePrice(0, 1)).toBe(true);
  });
});

describe('productSlugSchema', () => {
  it('accepts a simple lowercase slug', () => {
    expect(productSlugSchema.parse('laptop-gamer')).toBe('laptop-gamer');
  });

  it('trims surrounding whitespace before validating', () => {
    expect(productSlugSchema.parse('  laptop-gamer  ')).toBe('laptop-gamer');
  });

  it('accepts a value at the 2-character minimum', () => {
    expect(productSlugSchema.parse('ab')).toBe('ab');
  });

  it('rejects a value shorter than 2 characters', () => {
    expect(() => productSlugSchema.parse('a')).toThrow();
  });

  it('accepts a value at the 180-character maximum', () => {
    const value = 'a'.repeat(180);
    expect(productSlugSchema.parse(value)).toBe(value);
  });

  it('rejects a value longer than 180 characters', () => {
    const value = 'a'.repeat(181);
    expect(() => productSlugSchema.parse(value)).toThrow();
  });

  it('rejects uppercase letters', () => {
    expect(() => productSlugSchema.parse('Laptop-Gamer')).toThrow();
  });

  it('rejects a leading hyphen', () => {
    expect(() => productSlugSchema.parse('-laptop')).toThrow();
  });

  it('rejects a trailing hyphen', () => {
    expect(() => productSlugSchema.parse('laptop-')).toThrow();
  });

  it('rejects consecutive hyphens', () => {
    expect(() => productSlugSchema.parse('laptop--gamer')).toThrow();
  });

  it('rejects special characters', () => {
    expect(() => productSlugSchema.parse('laptop_gamer')).toThrow();
  });
});

describe('skuSchema', () => {
  it('accepts uppercase letters and digits', () => {
    expect(skuSchema.parse('SKU001')).toBe('SKU001');
  });

  it('accepts an internal hyphen', () => {
    expect(skuSchema.parse('SKU-001')).toBe('SKU-001');
  });

  it('trims surrounding whitespace before validating', () => {
    expect(skuSchema.parse('  SKU-001  ')).toBe('SKU-001');
  });

  it('accepts a value at the 2-character minimum', () => {
    expect(skuSchema.parse('AB')).toBe('AB');
  });

  it('rejects a value shorter than 2 characters', () => {
    expect(() => skuSchema.parse('A')).toThrow();
  });

  it('accepts a value at the 60-character maximum', () => {
    const value = `A${'1'.repeat(59)}`;
    expect(skuSchema.parse(value)).toBe(value);
  });

  it('rejects a value longer than 60 characters', () => {
    const value = `A${'1'.repeat(60)}`;
    expect(() => skuSchema.parse(value)).toThrow();
  });

  it('rejects lowercase letters', () => {
    expect(() => skuSchema.parse('sku-001')).toThrow();
  });

  it('rejects a value starting with a hyphen', () => {
    expect(() => skuSchema.parse('-SKU001')).toThrow();
  });

  it('rejects internal spaces', () => {
    expect(() => skuSchema.parse('SKU 001')).toThrow();
  });

  it('rejects underscores', () => {
    expect(() => skuSchema.parse('SKU_001')).toThrow();
  });
});

describe('createProductSchema', () => {
  it('accepts a fully populated valid payload', () => {
    const result = createProductSchema.parse(validProductPayload);
    expect(result).toEqual(validProductPayload);
  });

  it('applies defaults when optional fields are omitted', () => {
    const result = createProductSchema.parse({
      sku: 'SKU-001',
      name: 'Laptop Gamer',
      slug: 'laptop-gamer',
      priceCents: 129990,
      categoryId: validCategoryId,
    });

    expect(result).toEqual({
      sku: 'SKU-001',
      name: 'Laptop Gamer',
      slug: 'laptop-gamer',
      description: null,
      imageUrl: null,
      priceCents: 129990,
      compareAtPriceCents: null,
      stock: 0,
      specs: null,
      categoryId: validCategoryId,
      isActive: true,
    });
  });

  describe('name', () => {
    it('rejects a missing name', () => {
      expect(() => createProductSchema.parse(withoutField(validProductPayload, 'name'))).toThrow();
    });

    it('rejects a name shorter than 2 characters', () => {
      expect(() => createProductSchema.parse({ ...validProductPayload, name: 'A' })).toThrow();
    });

    it('accepts a name at the 160-character limit', () => {
      const name = 'a'.repeat(160);
      const result = createProductSchema.parse({ ...validProductPayload, name });
      expect(result.name).toBe(name);
    });

    it('rejects a name longer than 160 characters', () => {
      const name = 'a'.repeat(161);
      expect(() => createProductSchema.parse({ ...validProductPayload, name })).toThrow();
    });
  });

  describe('description', () => {
    it('accepts a null description', () => {
      const result = createProductSchema.parse({ ...validProductPayload, description: null });
      expect(result.description).toBeNull();
    });

    it('rejects a description longer than 2000 characters', () => {
      const description = 'a'.repeat(2001);
      expect(() =>
        createProductSchema.parse({ ...validProductPayload, description }),
      ).toThrow();
    });

    it('defaults to null when omitted', () => {
      const result = createProductSchema.parse(withoutField(validProductPayload, 'description'));
      expect(result.description).toBeNull();
    });
  });

  describe('imageUrl', () => {
    it('rejects a value that is not a valid URL', () => {
      expect(() =>
        createProductSchema.parse({ ...validProductPayload, imageUrl: 'not-a-url' }),
      ).toThrow();
    });

    it('accepts a null imageUrl', () => {
      const result = createProductSchema.parse({ ...validProductPayload, imageUrl: null });
      expect(result.imageUrl).toBeNull();
    });

    it('defaults to null when omitted', () => {
      const result = createProductSchema.parse(withoutField(validProductPayload, 'imageUrl'));
      expect(result.imageUrl).toBeNull();
    });
  });

  describe('priceCents', () => {
    it('rejects a non-integer value', () => {
      expect(() =>
        createProductSchema.parse({ ...validProductPayload, priceCents: 100.5 }),
      ).toThrow();
    });

    it('rejects a negative value', () => {
      expect(() =>
        createProductSchema.parse({ ...validProductPayload, priceCents: -1 }),
      ).toThrow();
    });

    // Un producto gratis produciría una línea de comprobante gravada al 18 % con valor de
    // venta 0, que ante SUNAT es otra cosa —una transferencia a título gratuito— con su
    // propio código de operación. El catálogo no lo admite (spec 022, D-22).
    it('rejects zero', () => {
      expect(() =>
        createProductSchema.parse({
          ...validProductPayload,
          priceCents: 0,
          compareAtPriceCents: 1,
        }),
      ).toThrow(POSITIVE_PRICE_MESSAGE);
    });

    it('rejects zero on the PATCH schema too', () => {
      expect(() => updateProductSchema.parse({ priceCents: 0 })).toThrow(POSITIVE_PRICE_MESSAGE);
    });

    it('accepts the maximum admitted value', () => {
      const result = createProductSchema.parse({
        ...validProductPayload,
        priceCents: 99_999_999,
        compareAtPriceCents: null,
      });
      expect(result.priceCents).toBe(99_999_999);
    });

    it('rejects a value above the maximum admitted', () => {
      expect(() =>
        createProductSchema.parse({ ...validProductPayload, priceCents: 100_000_000 }),
      ).toThrow();
    });
  });

  describe('compareAtPriceCents refine', () => {
    it('accepts a compare price greater than the current price', () => {
      const result = createProductSchema.parse({
        ...validProductPayload,
        priceCents: 1000,
        compareAtPriceCents: 1500,
      });
      expect(result.compareAtPriceCents).toBe(1500);
    });

    it('accepts a null compare price', () => {
      const result = createProductSchema.parse({
        ...validProductPayload,
        compareAtPriceCents: null,
      });
      expect(result.compareAtPriceCents).toBeNull();
    });

    it('rejects a compare price equal to the current price', () => {
      expect(() =>
        createProductSchema.parse({
          ...validProductPayload,
          priceCents: 1000,
          compareAtPriceCents: 1000,
        }),
      ).toThrow(COMPARE_AT_PRICE_MESSAGE);
    });

    it('rejects a compare price lower than the current price', () => {
      expect(() =>
        createProductSchema.parse({
          ...validProductPayload,
          priceCents: 1000,
          compareAtPriceCents: 500,
        }),
      ).toThrow(COMPARE_AT_PRICE_MESSAGE);
    });
  });

  describe('stock', () => {
    it('defaults to 0 when omitted', () => {
      const result = createProductSchema.parse(withoutField(validProductPayload, 'stock'));
      expect(result.stock).toBe(0);
    });

    it('rejects a negative value', () => {
      expect(() => createProductSchema.parse({ ...validProductPayload, stock: -1 })).toThrow();
    });

    it('rejects a non-integer value', () => {
      expect(() => createProductSchema.parse({ ...validProductPayload, stock: 1.5 })).toThrow();
    });

    it('accepts the maximum admitted value', () => {
      const result = createProductSchema.parse({ ...validProductPayload, stock: 1_000_000 });
      expect(result.stock).toBe(1_000_000);
    });

    it('rejects a value above the maximum admitted', () => {
      expect(() =>
        createProductSchema.parse({ ...validProductPayload, stock: 1_000_001 }),
      ).toThrow();
    });
  });

  describe('specs', () => {
    it('accepts a null specs value', () => {
      expect(createProductSchema.parse({ ...validProductPayload, specs: null }).specs).toBeNull();
    });

    it('defaults to null when omitted', () => {
      const result = createProductSchema.parse(withoutField(validProductPayload, 'specs'));
      expect(result.specs).toBeNull();
    });

    it('accepts an empty record', () => {
      expect(createProductSchema.parse({ ...validProductPayload, specs: {} }).specs).toEqual({});
    });

    it('rejects a key longer than 60 characters', () => {
      const specs = { [`k${'a'.repeat(60)}`]: 'value' };
      expect(() => createProductSchema.parse({ ...validProductPayload, specs })).toThrow();
    });

    it('rejects a value longer than 200 characters', () => {
      const specs = { RAM: 'a'.repeat(201) };
      expect(() => createProductSchema.parse({ ...validProductPayload, specs })).toThrow();
    });
  });

  describe('categoryId', () => {
    it('rejects a value that is not a UUID', () => {
      expect(() =>
        createProductSchema.parse({ ...validProductPayload, categoryId: 'not-a-uuid' }),
      ).toThrow();
    });
  });

  describe('isActive', () => {
    it('defaults to true when omitted', () => {
      const result = createProductSchema.parse(withoutField(validProductPayload, 'isActive'));
      expect(result.isActive).toBe(true);
    });

    it('accepts an explicit false', () => {
      expect(createProductSchema.parse({ ...validProductPayload, isActive: false }).isActive).toBe(
        false,
      );
    });

    it('rejects a non-boolean value', () => {
      expect(() =>
        createProductSchema.parse({ ...validProductPayload, isActive: 'true' }),
      ).toThrow();
    });
  });
});

describe('updateProductSchema', () => {
  it('rejects an empty object (refine requires at least one field)', () => {
    expect(() => updateProductSchema.parse({})).toThrow();
  });

  it('accepts a single valid field', () => {
    expect(updateProductSchema.parse({ name: 'Laptop nueva' })).toEqual({
      name: 'Laptop nueva',
    });
  });

  it('accepts multiple valid fields without requiring the rest', () => {
    const result = updateProductSchema.parse({ stock: 3, isActive: false });
    expect(result).toEqual({ stock: 3, isActive: false });
  });

  it('does not inject defaults for fields that were not sent', () => {
    const result = updateProductSchema.parse({ name: 'Laptop nueva' });
    expect(result.stock).toBeUndefined();
    expect(result.specs).toBeUndefined();
    expect(result.isActive).toBeUndefined();
  });

  it('rejects an invalid value even when only one field is sent', () => {
    expect(() => updateProductSchema.parse({ slug: 'Not Valid!' })).toThrow();
  });

  it('accepts an explicit null compareAtPriceCents without cross-checking priceCents', () => {
    const result = updateProductSchema.parse({ compareAtPriceCents: null });
    expect(result.compareAtPriceCents).toBeNull();
  });

  it('does not run the compare-price refine (a PATCH lacks the full row)', () => {
    const result = updateProductSchema.parse({ compareAtPriceCents: 1 });
    expect(result.compareAtPriceCents).toBe(1);
  });
});

describe('productQuerySchema', () => {
  it('parses an empty object applying all defaults', () => {
    expect(productQuerySchema.parse({})).toEqual({
      status: 'all',
      categoryId: 'all',
      page: 1,
      pageSize: 10,
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
  });

  it('accepts a fully populated valid filter set', () => {
    const result = productQuerySchema.parse({
      q: 'laptop',
      status: 'active',
      categoryId: validCategoryId,
      page: 2,
      pageSize: 25,
      sortBy: 'priceCents',
      sortDir: 'asc',
    });

    expect(result).toEqual({
      q: 'laptop',
      status: 'active',
      categoryId: validCategoryId,
      page: 2,
      pageSize: 25,
      sortBy: 'priceCents',
      sortDir: 'asc',
    });
  });

  describe('categoryId', () => {
    it('accepts the literal "all"', () => {
      expect(productQuerySchema.parse({ categoryId: 'all' }).categoryId).toBe('all');
    });

    it('accepts a valid UUID', () => {
      expect(productQuerySchema.parse({ categoryId: validCategoryId }).categoryId).toBe(
        validCategoryId,
      );
    });

    it('defaults to "all" when omitted', () => {
      expect(productQuerySchema.parse({}).categoryId).toBe('all');
    });

    it('rejects a value that is neither "all" nor a UUID', () => {
      expect(() => productQuerySchema.parse({ categoryId: 'laptops' })).toThrow();
    });
  });

  describe('status', () => {
    it.each(['all', 'active', 'inactive'])('accepts "%s"', (status) => {
      expect(productQuerySchema.parse({ status }).status).toBe(status);
    });

    it('rejects a value outside the enum', () => {
      expect(() => productQuerySchema.parse({ status: 'archived' })).toThrow();
    });
  });

  describe('page', () => {
    it('coerces a numeric string', () => {
      expect(productQuerySchema.parse({ page: '3' }).page).toBe(3);
    });

    it('rejects a value below 1', () => {
      expect(() => productQuerySchema.parse({ page: 0 })).toThrow();
    });
  });

  describe('pageSize', () => {
    it('accepts the maximum value of 100', () => {
      expect(productQuerySchema.parse({ pageSize: 100 }).pageSize).toBe(100);
    });

    it('rejects a value above 100', () => {
      expect(() => productQuerySchema.parse({ pageSize: 101 })).toThrow();
    });
  });

  describe('sortBy', () => {
    it.each(['name', 'priceCents', 'stock', 'createdAt'])('accepts "%s"', (sortBy) => {
      expect(productQuerySchema.parse({ sortBy }).sortBy).toBe(sortBy);
    });

    it('rejects a value outside the enum', () => {
      expect(() => productQuerySchema.parse({ sortBy: 'slug' })).toThrow();
    });
  });

  describe('sortDir', () => {
    it.each(['asc', 'desc'])('accepts "%s"', (sortDir) => {
      expect(productQuerySchema.parse({ sortDir }).sortDir).toBe(sortDir);
    });

    it('rejects a value outside the enum', () => {
      expect(() => productQuerySchema.parse({ sortDir: 'ascending' })).toThrow();
    });
  });
});

describe('productIdSchema', () => {
  it('accepts a valid UUID', () => {
    expect(productIdSchema.parse(validCategoryId)).toBe(validCategoryId);
  });

  it('rejects a value that is not a UUID', () => {
    expect(() => productIdSchema.parse('not-a-uuid')).toThrow();
  });

  it('rejects a non-string value', () => {
    expect(() => productIdSchema.parse(12345)).toThrow();
  });
});

describe('productFormSchema', () => {
  const validFormPayload = {
    sku: 'SKU-001',
    name: 'Laptop Gamer',
    slug: 'laptop-gamer',
    description: 'Equipo potente',
    imageUrl: 'https://example.com/laptop.png',
    price: '1299.90',
    compareAtPrice: '1499.00',
    stock: 5,
    specs: [{ key: 'RAM', value: '16GB' }],
    categoryId: validCategoryId,
    isActive: true,
  };

  it('accepts a fully populated valid payload', () => {
    const result = productFormSchema.parse(validFormPayload);
    expect(result).toEqual(validFormPayload);
  });

  it('accepts a null compareAtPrice (no offer)', () => {
    const result = productFormSchema.parse({ ...validFormPayload, compareAtPrice: null });
    expect(result.compareAtPrice).toBeNull();
  });

  describe('price', () => {
    it('rejects a value with more than 2 decimals', () => {
      expect(() =>
        productFormSchema.parse({ ...validFormPayload, price: '1299.999' }),
      ).toThrow();
    });

    it('rejects a value with more than 6 integer digits', () => {
      expect(() =>
        productFormSchema.parse({ ...validFormPayload, price: '1234567' }),
      ).toThrow();
    });

    it('rejects a non-numeric value', () => {
      expect(() => productFormSchema.parse({ ...validFormPayload, price: 'abc' })).toThrow();
    });

    it('accepts a whole amount without decimals', () => {
      const result = productFormSchema.parse({ ...validFormPayload, price: '1300' });
      expect(result.price).toBe('1300');
    });

    // El mismo invariante que la API, para que el error salga junto al campo en vez de
    // llegar como un 400 genérico del servidor (spec 022, D-22).
    it.each(['0', '0.00'])('rejects "%s": the catalog sells nothing for free', (price) => {
      expect(() =>
        productFormSchema.parse({ ...validFormPayload, price, compareAtPrice: null }),
      ).toThrow(POSITIVE_PRICE_MESSAGE);
    });
  });

  describe('compareAtPrice refine', () => {
    it('converts both amounts through toCents and accepts a genuine discount', () => {
      const result = productFormSchema.parse({
        ...validFormPayload,
        price: '100.00',
        compareAtPrice: '150.00',
      });
      expect(toCents(result.price)).toBeLessThan(toCents(result.compareAtPrice as string));
    });

    it('rejects a compareAtPrice equal to price once converted to cents', () => {
      expect(() =>
        productFormSchema.parse({
          ...validFormPayload,
          price: '100.00',
          compareAtPrice: '100.00',
        }),
      ).toThrow(COMPARE_AT_PRICE_MESSAGE);
    });

    it('rejects a compareAtPrice lower than price once converted to cents', () => {
      expect(() =>
        productFormSchema.parse({
          ...validFormPayload,
          price: '100.00',
          compareAtPrice: '50.00',
        }),
      ).toThrow(COMPARE_AT_PRICE_MESSAGE);
    });

    it('does not evaluate the cross-field rule when price itself is malformed', () => {
      // The refine short-circuits on an invalid `price` so the compare-price message
      // never masks the more specific "price" format error already raised by Zod.
      const result = productFormSchema.safeParse({
        ...validFormPayload,
        price: 'abc',
        compareAtPrice: '50.00',
      });
      expect(result.success).toBe(false);
      const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
      expect(messages).not.toContain(COMPARE_AT_PRICE_MESSAGE);
    });
  });

  describe('specs', () => {
    it('accepts an empty list', () => {
      expect(productFormSchema.parse({ ...validFormPayload, specs: [] }).specs).toEqual([]);
    });

    it('accepts the maximum of 20 pairs', () => {
      const specs = Array.from({ length: 20 }, (_, index) => ({
        key: `k${index}`,
        value: `v${index}`,
      }));
      expect(productFormSchema.parse({ ...validFormPayload, specs }).specs).toHaveLength(20);
    });

    it('rejects more than 20 pairs', () => {
      const specs = Array.from({ length: 21 }, (_, index) => ({
        key: `k${index}`,
        value: `v${index}`,
      }));
      expect(() => productFormSchema.parse({ ...validFormPayload, specs })).toThrow();
    });
  });
});
