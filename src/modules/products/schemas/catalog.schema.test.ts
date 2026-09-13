import { describe, expect, it } from 'vitest';

import { catalogQuerySchema, catalogSlugParamSchema } from './catalog.schema';

describe('catalogQuerySchema', () => {
  it('parses an empty object applying all defaults', () => {
    expect(catalogQuerySchema.parse({})).toEqual({
      category: 'all',
      sort: 'featured',
      discounted: false,
      page: 1,
      pageSize: 12,
    });
  });

  it('accepts a fully populated valid filter set', () => {
    const result = catalogQuerySchema.parse({
      q: 'laptop',
      category: 'laptops',
      sort: 'price_asc',
      discounted: 'true',
      page: 2,
      pageSize: 24,
    });

    expect(result).toEqual({
      q: 'laptop',
      category: 'laptops',
      sort: 'price_asc',
      discounted: true,
      page: 2,
      pageSize: 24,
    });
  });

  describe('q', () => {
    it('trims surrounding whitespace', () => {
      expect(catalogQuerySchema.parse({ q: '  laptop  ' }).q).toBe('laptop');
    });

    it('is optional', () => {
      expect(catalogQuerySchema.parse({}).q).toBeUndefined();
    });

    it('accepts a value at the 160-character limit', () => {
      const value = 'a'.repeat(160);
      expect(catalogQuerySchema.parse({ q: value }).q).toBe(value);
    });

    it('rejects a value longer than 160 characters', () => {
      const value = 'a'.repeat(161);
      expect(() => catalogQuerySchema.parse({ q: value })).toThrow();
    });
  });

  describe('category', () => {
    it('accepts the literal "all"', () => {
      expect(catalogQuerySchema.parse({ category: 'all' }).category).toBe('all');
    });

    it('defaults to "all" when omitted', () => {
      expect(catalogQuerySchema.parse({}).category).toBe('all');
    });

    it('accepts a valid slug', () => {
      expect(catalogQuerySchema.parse({ category: 'laptops-gamer' }).category).toBe(
        'laptops-gamer',
      );
    });

    it('accepts a slug at the 140-character maximum', () => {
      const value = 'a'.repeat(140);
      expect(catalogQuerySchema.parse({ category: value }).category).toBe(value);
    });

    it('rejects a slug longer than 140 characters even though productSlugSchema allows up to 180', () => {
      const value = 'a'.repeat(141);
      expect(() => catalogQuerySchema.parse({ category: value })).toThrow();
    });

    it('rejects an invalid slug format', () => {
      expect(() => catalogQuerySchema.parse({ category: 'Laptops!' })).toThrow();
    });

    it('rejects a value that is neither "all" nor a valid slug', () => {
      expect(() => catalogQuerySchema.parse({ category: '' })).toThrow();
    });
  });

  describe('sort', () => {
    it.each(['featured', 'newest', 'price_asc', 'price_desc'])('accepts "%s"', (sort) => {
      expect(catalogQuerySchema.parse({ sort }).sort).toBe(sort);
    });

    it('defaults to "featured" when omitted', () => {
      expect(catalogQuerySchema.parse({}).sort).toBe('featured');
    });

    it('rejects a value outside the closed enum', () => {
      expect(() => catalogQuerySchema.parse({ sort: 'relevance' })).toThrow();
    });
  });

  describe('discounted', () => {
    it('defaults to false when omitted', () => {
      expect(catalogQuerySchema.parse({}).discounted).toBe(false);
    });

    it.each(['true', '1', 'yes', 'on'])('coerces the truthy string "%s" to true', (value) => {
      expect(catalogQuerySchema.parse({ discounted: value }).discounted).toBe(true);
    });

    it.each(['false', '0', 'no', 'off'])('coerces the falsy string "%s" to false', (value) => {
      expect(catalogQuerySchema.parse({ discounted: value }).discounted).toBe(false);
    });

    it('rejects a value outside the accepted truthy/falsy strings', () => {
      expect(() => catalogQuerySchema.parse({ discounted: 'maybe' })).toThrow();
    });
  });

  describe('page', () => {
    it('defaults to 1 when omitted', () => {
      expect(catalogQuerySchema.parse({}).page).toBe(1);
    });

    it('coerces a numeric string', () => {
      expect(catalogQuerySchema.parse({ page: '3' }).page).toBe(3);
    });

    it('rejects a value below 1', () => {
      expect(() => catalogQuerySchema.parse({ page: 0 })).toThrow();
    });

    it('rejects a non-integer value', () => {
      expect(() => catalogQuerySchema.parse({ page: 1.5 })).toThrow();
    });
  });

  describe('pageSize', () => {
    it('defaults to 12 when omitted', () => {
      expect(catalogQuerySchema.parse({}).pageSize).toBe(12);
    });

    it('coerces a numeric string', () => {
      expect(catalogQuerySchema.parse({ pageSize: '20' }).pageSize).toBe(20);
    });

    it('accepts the maximum admitted value of 48, tighter than the admin cap of 100', () => {
      expect(catalogQuerySchema.parse({ pageSize: 48 }).pageSize).toBe(48);
    });

    it('rejects a value above 48', () => {
      expect(() => catalogQuerySchema.parse({ pageSize: 49 })).toThrow();
    });

    it('rejects a value below 1', () => {
      expect(() => catalogQuerySchema.parse({ pageSize: 0 })).toThrow();
    });
  });
});

describe('catalogSlugParamSchema', () => {
  it('accepts a simple lowercase slug', () => {
    expect(catalogSlugParamSchema.parse('laptop-gamer')).toBe('laptop-gamer');
  });

  it('accepts a value at the 180-character maximum, same limit as productSlugSchema', () => {
    const value = 'a'.repeat(180);
    expect(catalogSlugParamSchema.parse(value)).toBe(value);
  });

  it('rejects a value longer than 180 characters', () => {
    const value = 'a'.repeat(181);
    expect(() => catalogSlugParamSchema.parse(value)).toThrow();
  });

  it('rejects uppercase letters', () => {
    expect(() => catalogSlugParamSchema.parse('Laptop-Gamer')).toThrow();
  });

  it('rejects a path traversal attempt', () => {
    expect(() => catalogSlugParamSchema.parse('../../etc/passwd')).toThrow();
  });

  it('rejects a value containing a wildcard search character', () => {
    expect(() => catalogSlugParamSchema.parse('laptop%gamer')).toThrow();
  });

  it('rejects internal spaces', () => {
    expect(() => catalogSlugParamSchema.parse('laptop gamer')).toThrow();
  });
});
