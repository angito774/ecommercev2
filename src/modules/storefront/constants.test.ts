import { Laptop, Package, Smartphone } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { getBrandImage, getCategoryIcon } from './constants';

describe('getCategoryIcon', () => {
  it('resolves the icon of a mapped category slug', () => {
    expect(getCategoryIcon('laptops')).toBe(Laptop);
  });

  it('resolves the icon of another mapped category slug', () => {
    expect(getCategoryIcon('smartphones')).toBe(Smartphone);
  });

  it('falls back to the default Package icon for an unmapped slug', () => {
    expect(getCategoryIcon('unknown-category')).toBe(Package);
  });
});

describe('getBrandImage', () => {
  it('resolves the brand image path for a slug that has one', () => {
    expect(getBrandImage('laptops')).toBe('/brands/laptops.webp');
  });

  it('resolves the brand image path for another slug that has one', () => {
    expect(getBrandImage('tablets')).toBe('/brands/tablets.webp');
  });

  it('returns null for a slug without a brand image asset', () => {
    expect(getBrandImage('unknown-category')).toBeNull();
  });
});
