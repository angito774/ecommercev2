import { describe, expect, it } from 'vitest';

import { escapeLikePattern } from './product.repository';

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
