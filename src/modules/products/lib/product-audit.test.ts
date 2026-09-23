import { describe, expect, it } from 'vitest';

import type { Product } from '../types/product.types';

import { toAuditableProduct } from './product-audit';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sku: 'LEN-IP3-15',
    name: 'Laptop Lenovo IdeaPad 3',
    slug: 'laptop-lenovo-ideapad-3',
    description: 'Ryzen 5, 16 GB, 512 GB SSD',
    imageUrl: 'https://cdn.example.com/ideapad.jpg',
    priceCents: 249_900,
    compareAtPriceCents: 279_900,
    stock: 12,
    averageCostCents: 180_000,
    specs: { ram: '16 GB' },
    categoryId: '22222222-2222-4222-8222-222222222222',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('toAuditableProduct', () => {
  it('drops averageCostCents, which is what keeps the cost out of the audit log (D-9)', () => {
    const auditable = toAuditableProduct(buildProduct());

    expect('averageCostCents' in auditable).toBe(false);
  });

  it('drops it as an own key, not as an undefined value: JSON.stringify would keep neither', () => {
    const auditable = toAuditableProduct(buildProduct());

    expect(Object.keys(auditable)).not.toContain('averageCostCents');
    expect(JSON.stringify(auditable)).not.toContain('averageCostCents');
  });

  it('does not leak the amount by any other key either', () => {
    const auditable = toAuditableProduct(buildProduct({ averageCostCents: 180_000 }));

    expect(JSON.stringify(auditable)).not.toContain('180000');
  });

  it('keeps every other field identical, so the bitácora still shows what changed', () => {
    const product = buildProduct();

    const { averageCostCents, ...rest } = product;

    expect(toAuditableProduct(product)).toEqual(rest);
    // La desestructuración de arriba es la aserción; esto solo deja escrito el valor que
    // se retiró para que el caso no se lea como una tautología.
    expect(averageCostCents).toBe(180_000);
  });

  it('projects positively: a new sensitive column would not slip in on its own', () => {
    const product = { ...buildProduct(), unitMarginCents: 69_900 } as Product;

    expect(JSON.stringify(toAuditableProduct(product))).not.toContain('unitMarginCents');
  });

  it('works the same on a product that still has no cost registered', () => {
    const auditable = toAuditableProduct(buildProduct({ averageCostCents: null }));

    expect('averageCostCents' in auditable).toBe(false);
    expect(auditable.sku).toBe('LEN-IP3-15');
  });

  it('keeps the nullable fields as null instead of turning them into undefined', () => {
    const auditable = toAuditableProduct(
      buildProduct({ description: null, imageUrl: null, compareAtPriceCents: null, specs: null }),
    );

    expect(auditable.description).toBeNull();
    expect(auditable.imageUrl).toBeNull();
    expect(auditable.compareAtPriceCents).toBeNull();
    expect(auditable.specs).toBeNull();
  });
});
