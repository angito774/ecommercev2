import { describe, expect, it } from 'vitest';

import {
  categoryIdSchema,
  categoryQuerySchema,
  categorySlugSchema,
  createCategorySchema,
  updateCategorySchema,
} from './category.schema';

describe('categorySlugSchema', () => {
  it('accepts a simple lowercase slug', () => {
    expect(categorySlugSchema.parse('laptops')).toBe('laptops');
  });

  it('accepts a slug with numbers and hyphens', () => {
    expect(categorySlugSchema.parse('laptops-2024')).toBe('laptops-2024');
  });

  it('trims surrounding whitespace before validating', () => {
    expect(categorySlugSchema.parse('  laptops  ')).toBe('laptops');
  });

  it('accepts a value at the 2-character minimum', () => {
    expect(categorySlugSchema.parse('ab')).toBe('ab');
  });

  it('rejects a value shorter than 2 characters', () => {
    expect(() => categorySlugSchema.parse('a')).toThrow();
  });

  it('accepts a value at the 140-character maximum', () => {
    const value = 'a'.repeat(140);
    expect(categorySlugSchema.parse(value)).toBe(value);
  });

  it('rejects a value longer than 140 characters', () => {
    const value = 'a'.repeat(141);
    expect(() => categorySlugSchema.parse(value)).toThrow();
  });

  it('rejects uppercase letters', () => {
    expect(() => categorySlugSchema.parse('Laptops')).toThrow();
  });

  it('rejects internal spaces', () => {
    expect(() => categorySlugSchema.parse('lap tops')).toThrow();
  });

  it('rejects a leading hyphen', () => {
    expect(() => categorySlugSchema.parse('-laptops')).toThrow();
  });

  it('rejects a trailing hyphen', () => {
    expect(() => categorySlugSchema.parse('laptops-')).toThrow();
  });

  it('rejects consecutive hyphens', () => {
    expect(() => categorySlugSchema.parse('lap--tops')).toThrow();
  });

  it('rejects special characters', () => {
    expect(() => categorySlugSchema.parse('laptops_2024')).toThrow();
  });
});

describe('createCategorySchema', () => {
  it('accepts a fully populated valid payload', () => {
    const result = createCategorySchema.parse({
      name: 'Laptops',
      slug: 'laptops',
      description: 'Equipos portátiles',
      imageUrl: 'https://example.com/laptops.png',
      isActive: false,
    });

    expect(result).toEqual({
      name: 'Laptops',
      slug: 'laptops',
      description: 'Equipos portátiles',
      imageUrl: 'https://example.com/laptops.png',
      isActive: false,
    });
  });

  it('applies defaults when optional fields are omitted', () => {
    const result = createCategorySchema.parse({
      name: 'Laptops',
      slug: 'laptops',
    });

    expect(result).toEqual({
      name: 'Laptops',
      slug: 'laptops',
      description: null,
      imageUrl: null,
      isActive: true,
    });
  });

  describe('name', () => {
    it('rejects a missing name', () => {
      expect(() => createCategorySchema.parse({ slug: 'laptops' })).toThrow();
    });

    it('rejects a name shorter than 2 characters', () => {
      expect(() =>
        createCategorySchema.parse({ name: 'A', slug: 'laptops' }),
      ).toThrow();
    });

    it('accepts a name at the 120-character limit', () => {
      const name = 'a'.repeat(120);
      const result = createCategorySchema.parse({ name, slug: 'laptops' });
      expect(result.name).toBe(name);
    });

    it('rejects a name longer than 120 characters', () => {
      const name = 'a'.repeat(121);
      expect(() => createCategorySchema.parse({ name, slug: 'laptops' })).toThrow();
    });

    it('trims surrounding whitespace', () => {
      const result = createCategorySchema.parse({ name: '  Laptops  ', slug: 'laptops' });
      expect(result.name).toBe('Laptops');
    });
  });

  describe('slug', () => {
    it('rejects an invalid slug format', () => {
      expect(() => createCategorySchema.parse({ name: 'Laptops', slug: 'Laptops!' })).toThrow();
    });
  });

  describe('description', () => {
    it('accepts a null description', () => {
      const result = createCategorySchema.parse({
        name: 'Laptops',
        slug: 'laptops',
        description: null,
      });
      expect(result.description).toBeNull();
    });

    it('accepts a description at the 1000-character limit', () => {
      const description = 'a'.repeat(1000);
      const result = createCategorySchema.parse({
        name: 'Laptops',
        slug: 'laptops',
        description,
      });
      expect(result.description).toBe(description);
    });

    it('rejects a description longer than 1000 characters', () => {
      const description = 'a'.repeat(1001);
      expect(() =>
        createCategorySchema.parse({ name: 'Laptops', slug: 'laptops', description }),
      ).toThrow();
    });

    it('defaults to null when omitted', () => {
      const result = createCategorySchema.parse({ name: 'Laptops', slug: 'laptops' });
      expect(result.description).toBeNull();
    });
  });

  describe('imageUrl', () => {
    it('rejects a value that is not a valid URL', () => {
      expect(() =>
        createCategorySchema.parse({
          name: 'Laptops',
          slug: 'laptops',
          imageUrl: 'not-a-url',
        }),
      ).toThrow();
    });

    it('accepts a null imageUrl', () => {
      const result = createCategorySchema.parse({
        name: 'Laptops',
        slug: 'laptops',
        imageUrl: null,
      });
      expect(result.imageUrl).toBeNull();
    });

    it('rejects a URL longer than 500 characters', () => {
      const imageUrl = `https://example.com/${'a'.repeat(500)}`;
      expect(() =>
        createCategorySchema.parse({ name: 'Laptops', slug: 'laptops', imageUrl }),
      ).toThrow();
    });

    it('defaults to null when omitted', () => {
      const result = createCategorySchema.parse({ name: 'Laptops', slug: 'laptops' });
      expect(result.imageUrl).toBeNull();
    });
  });

  describe('isActive', () => {
    it('rejects a non-boolean value', () => {
      expect(() =>
        createCategorySchema.parse({ name: 'Laptops', slug: 'laptops', isActive: 'true' }),
      ).toThrow();
    });

    it('accepts an explicit false', () => {
      const result = createCategorySchema.parse({
        name: 'Laptops',
        slug: 'laptops',
        isActive: false,
      });
      expect(result.isActive).toBe(false);
    });

    it('defaults to true when omitted', () => {
      const result = createCategorySchema.parse({ name: 'Laptops', slug: 'laptops' });
      expect(result.isActive).toBe(true);
    });
  });
});

describe('updateCategorySchema', () => {
  it('rejects an empty object (refine requires at least one field)', () => {
    expect(() => updateCategorySchema.parse({})).toThrow();
  });

  it('accepts a single valid field', () => {
    const result = updateCategorySchema.parse({ name: 'Laptops nuevos' });
    expect(result).toEqual({ name: 'Laptops nuevos' });
  });

  it('accepts multiple valid fields without requiring the rest', () => {
    const result = updateCategorySchema.parse({ name: 'Laptops', isActive: false });
    expect(result).toEqual({ name: 'Laptops', isActive: false });
  });

  it('does not inject defaults for fields that were not sent', () => {
    const result = updateCategorySchema.parse({ name: 'Laptops' });
    expect(result.isActive).toBeUndefined();
    expect(result.description).toBeUndefined();
    expect(result.imageUrl).toBeUndefined();
  });

  it('rejects an invalid value even when only one field is sent', () => {
    expect(() => updateCategorySchema.parse({ slug: 'Not Valid!' })).toThrow();
  });

  it('rejects a name shorter than 2 characters', () => {
    expect(() => updateCategorySchema.parse({ name: 'A' })).toThrow();
  });

  it('accepts an explicit null description', () => {
    const result = updateCategorySchema.parse({ description: null });
    expect(result.description).toBeNull();
  });
});

describe('categoryQuerySchema', () => {
  it('parses an empty object applying all defaults', () => {
    const result = categoryQuerySchema.parse({});

    expect(result).toEqual({
      status: 'all',
      page: 1,
      pageSize: 10,
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
  });

  it('accepts a fully populated valid filter set', () => {
    const result = categoryQuerySchema.parse({
      q: 'laptop',
      status: 'active',
      page: 2,
      pageSize: 25,
      sortBy: 'name',
      sortDir: 'asc',
    });

    expect(result).toEqual({
      q: 'laptop',
      status: 'active',
      page: 2,
      pageSize: 25,
      sortBy: 'name',
      sortDir: 'asc',
    });
  });

  describe('q', () => {
    it('trims surrounding whitespace', () => {
      expect(categoryQuerySchema.parse({ q: '  laptop  ' }).q).toBe('laptop');
    });

    it('is optional', () => {
      expect(categoryQuerySchema.parse({}).q).toBeUndefined();
    });

    it('accepts a value at the 120-character limit', () => {
      const value = 'a'.repeat(120);
      expect(categoryQuerySchema.parse({ q: value }).q).toBe(value);
    });

    it('rejects a value longer than 120 characters', () => {
      const value = 'a'.repeat(121);
      expect(() => categoryQuerySchema.parse({ q: value })).toThrow();
    });
  });

  describe('status', () => {
    it.each(['all', 'active', 'inactive'])('accepts "%s"', (status) => {
      expect(categoryQuerySchema.parse({ status }).status).toBe(status);
    });

    it('defaults to "all" when omitted', () => {
      expect(categoryQuerySchema.parse({}).status).toBe('all');
    });

    it('rejects a value outside the enum', () => {
      expect(() => categoryQuerySchema.parse({ status: 'archived' })).toThrow();
    });
  });

  describe('page', () => {
    it('defaults to 1 when omitted', () => {
      expect(categoryQuerySchema.parse({}).page).toBe(1);
    });

    it('coerces a numeric string', () => {
      expect(categoryQuerySchema.parse({ page: '3' }).page).toBe(3);
    });

    it('accepts the minimum value of 1', () => {
      expect(categoryQuerySchema.parse({ page: 1 }).page).toBe(1);
    });

    it('rejects a value below 1', () => {
      expect(() => categoryQuerySchema.parse({ page: 0 })).toThrow();
    });

    it('rejects a non-integer value', () => {
      expect(() => categoryQuerySchema.parse({ page: 1.5 })).toThrow();
    });
  });

  describe('pageSize', () => {
    it('defaults to 10 when omitted', () => {
      expect(categoryQuerySchema.parse({}).pageSize).toBe(10);
    });

    it('coerces a numeric string', () => {
      expect(categoryQuerySchema.parse({ pageSize: '50' }).pageSize).toBe(50);
    });

    it('accepts the minimum value of 1', () => {
      expect(categoryQuerySchema.parse({ pageSize: 1 }).pageSize).toBe(1);
    });

    it('accepts the maximum value of 100', () => {
      expect(categoryQuerySchema.parse({ pageSize: 100 }).pageSize).toBe(100);
    });

    it('rejects a value below 1', () => {
      expect(() => categoryQuerySchema.parse({ pageSize: 0 })).toThrow();
    });

    it('rejects a value above 100', () => {
      expect(() => categoryQuerySchema.parse({ pageSize: 101 })).toThrow();
    });

    it('rejects a non-integer value', () => {
      expect(() => categoryQuerySchema.parse({ pageSize: 20.5 })).toThrow();
    });
  });

  describe('sortBy', () => {
    it.each(['name', 'createdAt', 'updatedAt'])('accepts "%s"', (sortBy) => {
      expect(categoryQuerySchema.parse({ sortBy }).sortBy).toBe(sortBy);
    });

    it('defaults to "createdAt" when omitted', () => {
      expect(categoryQuerySchema.parse({}).sortBy).toBe('createdAt');
    });

    it('rejects a value outside the enum', () => {
      expect(() => categoryQuerySchema.parse({ sortBy: 'slug' })).toThrow();
    });
  });

  describe('sortDir', () => {
    it.each(['asc', 'desc'])('accepts "%s"', (sortDir) => {
      expect(categoryQuerySchema.parse({ sortDir }).sortDir).toBe(sortDir);
    });

    it('defaults to "desc" when omitted', () => {
      expect(categoryQuerySchema.parse({}).sortDir).toBe('desc');
    });

    it('rejects a value outside the enum', () => {
      expect(() => categoryQuerySchema.parse({ sortDir: 'ascending' })).toThrow();
    });
  });
});

describe('categoryIdSchema', () => {
  it('accepts a valid UUID', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(categoryIdSchema.parse(id)).toBe(id);
  });

  it('rejects a value that is not a UUID', () => {
    expect(() => categoryIdSchema.parse('not-a-uuid')).toThrow();
  });

  it('rejects a non-string value', () => {
    expect(() => categoryIdSchema.parse(12345)).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => categoryIdSchema.parse('')).toThrow();
  });
});
