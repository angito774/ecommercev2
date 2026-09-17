import { describe, expect, it } from 'vitest';

import { cn, escapeLikePattern, isUniqueViolation, slugify, uniqueViolationTarget } from './utils';

describe('escapeLikePattern', () => {
  it('returns the input unchanged when it has no LIKE wildcards', () => {
    expect(escapeLikePattern('laptop')).toBe('laptop');
  });

  it('returns an empty string unchanged', () => {
    expect(escapeLikePattern('')).toBe('');
  });

  it('escapes a lone percent sign', () => {
    expect(escapeLikePattern('%')).toBe('\\%');
  });

  it('escapes a lone underscore', () => {
    expect(escapeLikePattern('_')).toBe('\\_');
  });

  it('escapes a lone backslash', () => {
    expect(escapeLikePattern('\\')).toBe('\\\\');
  });

  it('escapes a mix of percent, underscore and backslash preserving order', () => {
    expect(escapeLikePattern('50%_off\\deal')).toBe('50\\%\\_off\\\\deal');
  });

  it('escapes the backslash before the character it introduces, never double-escaping', () => {
    // Si el backslash no se escapara primero, `\%` literal en el input se leería
    // como el escape de `%` en vez de como dos caracteres a escapar por separado.
    expect(escapeLikePattern('\\%')).toBe('\\\\\\%');
  });
});

// Prueba de ejemplo para validar el setup de Vitest (config, alias @/, tsconfig).
// Sirve de plantilla de convención para el resto del inventario en
// docs/testing/funciones-testeables.md.
describe('slugify', () => {
  it('lowercases and hyphenates a normal phrase', () => {
    expect(slugify('Monitores Gamer')).toBe('monitores-gamer');
  });

  it('strips diacritics before filtering characters', () => {
    expect(slugify('Periféricos')).toBe('perifericos');
  });

  it('collapses consecutive invalid characters into a single hyphen', () => {
    expect(slugify('SSD  &  HDD')).toBe('ssd-hdd');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  -Laptop-  ')).toBe('laptop');
  });

  it('returns an empty string when there are no valid characters', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('cn', () => {
  it('joins plain class names with a space', () => {
    expect(cn('flex', 'items-center')).toBe('flex items-center');
  });

  it('lets a later conflicting Tailwind class win over an earlier one', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('drops falsy values from conditional class expressions', () => {
    expect(cn('flex', false && 'hidden', undefined, null, '')).toBe('flex');
  });

  it('returns an empty string when given no classes', () => {
    expect(cn()).toBe('');
  });

  it('flattens arrays and objects of class names', () => {
    expect(cn(['text-sm', 'gap-2'], { hidden: false, italic: true })).toBe(
      'text-sm gap-2 italic',
    );
  });

  it('lets a later conflicting class from an object win over an array class', () => {
    // `flex` y `block` comparten el mismo grupo de Tailwind (display): gana el que
    // llega después sin importar si viene de un array o de un objeto.
    expect(cn(['flex', 'gap-2'], { block: true })).toBe('gap-2 block');
  });
});

describe('isUniqueViolation', () => {
  it('returns true for a Postgres unique violation (code 23505)', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('returns false for a different Postgres error code', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
  });

  it('finds the violation nested inside a chain of `cause`', () => {
    const pgError = { code: '23505' };
    const drizzleError = { cause: { cause: pgError } };
    expect(isUniqueViolation(drizzleError)).toBe(true);
  });

  it('returns false when the cause chain exceeds the max depth (5 levels)', () => {
    const pgError = { code: '23505' };
    const deeplyWrapped = { cause: { cause: { cause: { cause: { cause: pgError } } } } };
    expect(isUniqueViolation(deeplyWrapped)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isUniqueViolation(null)).toBe(false);
  });

  it('returns false for a non-object error such as a string', () => {
    expect(isUniqueViolation('boom')).toBe(false);
  });

  it('returns false for a plain Error without a Postgres code', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
  });
});

describe('uniqueViolationTarget', () => {
  it('returns the constraint name when the violation exposes one', () => {
    expect(uniqueViolationTarget({ code: '23505', constraint: 'products_sku_unique' })).toBe(
      'products_sku_unique',
    );
  });

  it('finds the constraint nested inside a chain of `cause`', () => {
    const pgError = { code: '23505', constraint: 'categories_slug_unique' };
    expect(uniqueViolationTarget({ cause: pgError })).toBe('categories_slug_unique');
  });

  it('returns null when there is no unique violation at all', () => {
    expect(uniqueViolationTarget({ code: '23503' })).toBeNull();
  });

  it('returns null when the violation does not expose a constraint name', () => {
    expect(uniqueViolationTarget({ code: '23505' })).toBeNull();
  });

  it('returns null when the constraint is not a string', () => {
    expect(uniqueViolationTarget({ code: '23505', constraint: 42 })).toBeNull();
  });
});
