import { describe, expect, it } from 'vitest';

import { cardBrandLabel, formatCardExpiry, isCardExpired } from './card-display';

describe('cardBrandLabel', () => {
  it('returns the mapped label for a known brand', () => {
    expect(cardBrandLabel('visa')).toBe('Visa');
  });

  it('capitalizes each underscore-separated word for an unknown brand', () => {
    expect(cardBrandLabel('some_new_brand')).toBe('Some New Brand');
  });

  it('capitalizes a single-word unknown brand', () => {
    expect(cardBrandLabel('foo')).toBe('Foo');
  });
});

describe('formatCardExpiry', () => {
  it('pads a single-digit month with a leading zero', () => {
    expect(formatCardExpiry(3, 2027)).toBe('03/2027');
  });

  it('keeps a two-digit month unchanged', () => {
    expect(formatCardExpiry(12, 2027)).toBe('12/2027');
  });
});

describe('isCardExpired', () => {
  it('is not expired at the very last instant of the expiry month', () => {
    const now = new Date(2027, 2, 31, 23, 59, 59, 999);

    expect(isCardExpired(3, 2027, now)).toBe(false);
  });

  it('is expired the day after the expiry month ends', () => {
    const now = new Date(2027, 3, 1, 0, 0, 0, 0);

    expect(isCardExpired(3, 2027, now)).toBe(true);
  });

  it('is not expired when now is well before the expiry month', () => {
    const now = new Date(2025, 0, 1);

    expect(isCardExpired(3, 2027, now)).toBe(false);
  });

  it('is expired when now is in a later year than the expiry year', () => {
    const now = new Date(2028, 0, 1);

    expect(isCardExpired(3, 2027, now)).toBe(true);
  });
});
