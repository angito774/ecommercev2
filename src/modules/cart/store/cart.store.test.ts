import { beforeEach, describe, expect, it } from 'vitest';

import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { MAX_LINE_QUANTITY } from '../constants';
import {
  type CartLine,
  selectItemCount,
  selectQuantityForProduct,
  selectSubtotalCents,
  useCartStore,
} from './cart.store';

// `CartState` no se exporta (solo lo consumen los selectores y el propio store),
// así que se deriva del parámetro de un selector real en vez de duplicar la forma
// a mano — si el store le añade un campo, este tipo lo sigue automáticamente.
type CartState = Parameters<typeof selectItemCount>[0];

function buildLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: 'prod-1',
    name: 'Mouse inalámbrico',
    slug: 'mouse-inalambrico',
    priceCents: 5_000,
    imageUrl: null,
    categoryName: 'Periféricos',
    categorySlug: 'perifericos',
    quantity: 1,
    ...overrides,
  };
}

function buildState(lines: CartLine[]): CartState {
  return {
    lines,
    add: () => {},
    setQuantity: () => {},
    remove: () => {},
    clear: () => {},
  };
}

function buildProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 'prod-1',
    name: 'Mouse inalámbrico',
    slug: 'mouse-inalambrico',
    description: 'Mouse ergonómico',
    imageUrl: null,
    priceCents: 5_000,
    compareAtPriceCents: null,
    discountPercent: null,
    stockLevel: 'in',
    categoryName: 'Periféricos',
    categorySlug: 'perifericos',
    ...overrides,
  };
}

describe('selectItemCount', () => {
  it('returns 0 for an empty cart', () => {
    expect(selectItemCount(buildState([]))).toBe(0);
  });

  it('returns the quantity of a single line', () => {
    expect(selectItemCount(buildState([buildLine({ quantity: 3 })]))).toBe(3);
  });

  it('sums the quantities of several lines', () => {
    const state = buildState([
      buildLine({ productId: 'a', quantity: 2 }),
      buildLine({ productId: 'b', quantity: 5 }),
      buildLine({ productId: 'c', quantity: 1 }),
    ]);

    expect(selectItemCount(state)).toBe(8);
  });
});

describe('selectSubtotalCents', () => {
  it('returns 0 for an empty cart', () => {
    expect(selectSubtotalCents(buildState([]))).toBe(0);
  });

  it('multiplies price by quantity for a single line', () => {
    const state = buildState([buildLine({ priceCents: 2_500, quantity: 4 })]);

    expect(selectSubtotalCents(state)).toBe(10_000);
  });

  it('sums price times quantity across several lines', () => {
    const state = buildState([
      buildLine({ productId: 'a', priceCents: 1_000, quantity: 2 }),
      buildLine({ productId: 'b', priceCents: 3_000, quantity: 1 }),
    ]);

    expect(selectSubtotalCents(state)).toBe(5_000);
  });
});

describe('selectQuantityForProduct', () => {
  it('returns the quantity of the matching line', () => {
    const state = buildState([
      buildLine({ productId: 'a', quantity: 2 }),
      buildLine({ productId: 'b', quantity: 7 }),
    ]);

    expect(selectQuantityForProduct('b')(state)).toBe(7);
  });

  it('returns 0 when the product is not in the cart', () => {
    const state = buildState([buildLine({ productId: 'a', quantity: 2 })]);

    expect(selectQuantityForProduct('missing')(state)).toBe(0);
  });

  it('returns 0 for an empty cart', () => {
    expect(selectQuantityForProduct('a')(buildState([]))).toBe(0);
  });
});

// `clampQuantity` es privada: se ejercita a través de las acciones `add` y
// `setQuantity`, que son sus únicas dos llamadoras. El store es el real de
// Zustand (no un mock) para no fingir el comportamiento que se quiere probar.
describe('cart store quantity clamping (via add/setQuantity)', () => {
  beforeEach(() => {
    useCartStore.setState({ lines: [] });
  });

  describe('add', () => {
    it('defaults to quantity 1 when not specified', () => {
      useCartStore.getState().add(buildProduct());

      expect(useCartStore.getState().lines[0]?.quantity).toBe(1);
    });

    it('clamps a negative quantity up to 1 for a new line', () => {
      useCartStore.getState().add(buildProduct(), -5);

      expect(useCartStore.getState().lines[0]?.quantity).toBe(1);
    });

    it('clamps a zero quantity up to 1 for a new line', () => {
      useCartStore.getState().add(buildProduct(), 0);

      expect(useCartStore.getState().lines[0]?.quantity).toBe(1);
    });

    it('truncates a decimal quantity for a new line', () => {
      useCartStore.getState().add(buildProduct(), 3.9);

      expect(useCartStore.getState().lines[0]?.quantity).toBe(3);
    });

    it('clamps a quantity above MAX_LINE_QUANTITY down to the max for a new line', () => {
      useCartStore.getState().add(buildProduct(), MAX_LINE_QUANTITY + 50);

      expect(useCartStore.getState().lines[0]?.quantity).toBe(MAX_LINE_QUANTITY);
    });

    it('keeps a quantity within range unchanged for a new line', () => {
      useCartStore.getState().add(buildProduct(), 4);

      expect(useCartStore.getState().lines[0]?.quantity).toBe(4);
    });

    it('clamps the summed quantity down to MAX_LINE_QUANTITY when adding to an existing line', () => {
      const product = buildProduct();

      useCartStore.getState().add(product, MAX_LINE_QUANTITY - 2);
      useCartStore.getState().add(product, 10);

      const lines = useCartStore.getState().lines;
      expect(lines).toHaveLength(1);
      expect(lines[0]?.quantity).toBe(MAX_LINE_QUANTITY);
    });

    it('truncates the summed quantity when adding a decimal to an existing line', () => {
      const product = buildProduct();

      useCartStore.getState().add(product, 2);
      useCartStore.getState().add(product, 1.7);

      expect(useCartStore.getState().lines[0]?.quantity).toBe(3);
    });
  });

  describe('setQuantity', () => {
    function seedLine(quantity: number) {
      useCartStore.getState().add(buildProduct(), quantity);
    }

    it('removes the line when the quantity is set to a negative number', () => {
      seedLine(2);

      useCartStore.getState().setQuantity('prod-1', -1);

      expect(useCartStore.getState().lines).toHaveLength(0);
    });

    it('removes the line when the quantity is set to 0', () => {
      seedLine(2);

      useCartStore.getState().setQuantity('prod-1', 0);

      expect(useCartStore.getState().lines).toHaveLength(0);
    });

    it('truncates a decimal quantity when updating an existing line', () => {
      seedLine(1);

      useCartStore.getState().setQuantity('prod-1', 6.4);

      expect(useCartStore.getState().lines[0]?.quantity).toBe(6);
    });

    it('clamps a quantity above MAX_LINE_QUANTITY down to the max when updating an existing line', () => {
      seedLine(1);

      useCartStore.getState().setQuantity('prod-1', MAX_LINE_QUANTITY + 20);

      expect(useCartStore.getState().lines[0]?.quantity).toBe(MAX_LINE_QUANTITY);
    });

    it('keeps a quantity within range unchanged when updating an existing line', () => {
      seedLine(1);

      useCartStore.getState().setQuantity('prod-1', 9);

      expect(useCartStore.getState().lines[0]?.quantity).toBe(9);
    });
  });
});
