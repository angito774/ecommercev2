import { describe, expect, it } from 'vitest';

import { slugify } from './utils';

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
