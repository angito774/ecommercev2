import { describe, expect, it, vi } from 'vitest';

// `checkout.service.ts` importa `stripe` de `@/lib/stripe` de forma incondicional
// para `startCheckout` (no ejercitada aquí), y ese módulo trae `server-only`, que
// revienta fuera del bundler de Next (no reconoce la condición `react-server` de
// Vitest/Node). Ninguna de las tres funciones bajo prueba toca el cliente de
// Stripe, así que se sustituye por un doble vacío en vez de cargar la clave real.
vi.mock('@/lib/stripe', () => ({ stripe: {} }));

import { ConflictError } from '@/lib/errors';
import {
  PRODUCT_NOT_FOUND_MESSAGE,
  productOutOfStockMessage,
  productUnavailableMessage,
} from '@/modules/orders/constants';
import type { CheckoutInput } from '@/modules/orders/schemas/checkout.schema';
import { products } from '@/server/db/schema';

import { buildOrderItems, toLineItems, toShippingOptions, type PreparedOrder } from './checkout.service';

type Product = typeof products.$inferSelect;

// El catálogo recién leído: mismos campos que devuelve `findManyByIds`, sin
// pasar por Drizzle. Solo se sobreescriben los que cada caso necesita.
function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    sku: 'SKU-LAP-001',
    name: 'Laptop Lenovo',
    slug: 'laptop-lenovo',
    description: null,
    imageUrl: 'https://cdn.example.com/laptop.jpg',
    priceCents: 129990,
    compareAtPriceCents: null,
    stock: 10,
    // Columna nueva del spec 021: la fila desnuda que devuelve `findManyByIds` la trae,
    // aunque el checkout no la mire.
    averageCostCents: null,
    specs: null,
    categoryId: '22222222-2222-2222-2222-222222222222',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

// El comprador es obligatorio desde el spec 022 (D-3): no existe la rama «boleta sin
// documento». Ninguna de las tres funciones bajo prueba lo mira —`buildOrderItems` releía
// y sigue releyendo solo el catálogo—, así que el fixture usa el caso mínimo válido.
function buildCheckoutInput(lines: CheckoutInput['lines']): CheckoutInput {
  return { lines, buyer: { documentType: 'dni', documentNumber: '41281230' } };
}

function buildPreparedOrder(overrides: Partial<PreparedOrder> = {}): PreparedOrder {
  return {
    orderId: '33333333-3333-3333-3333-333333333333',
    currency: 'pen',
    shippingCents: 0,
    items: [
      {
        nameSnapshot: 'Laptop Lenovo',
        imageUrlSnapshot: 'https://cdn.example.com/laptop.jpg',
        priceCentsSnapshot: 129990,
        quantity: 1,
      },
    ],
    ...overrides,
  };
}

describe('buildOrderItems', () => {
  it('throws ConflictError when the product no longer exists in the catalog', () => {
    const input = buildCheckoutInput([{ productId: '11111111-1111-1111-1111-111111111111', quantity: 1 }]);

    expect(() => buildOrderItems(input, [])).toThrow(ConflictError);
    expect(() => buildOrderItems(input, [])).toThrow(PRODUCT_NOT_FOUND_MESSAGE);
  });

  it('throws ConflictError with the unavailable message when the product is inactive', () => {
    const product = buildProduct({ isActive: false });
    const input = buildCheckoutInput([{ productId: product.id, quantity: 1 }]);

    expect(() => buildOrderItems(input, [product])).toThrow(ConflictError);
    expect(() => buildOrderItems(input, [product])).toThrow(productUnavailableMessage(product.name));
  });

  it('throws ConflictError with the out-of-stock message when quantity exceeds stock', () => {
    const product = buildProduct({ stock: 2 });
    const input = buildCheckoutInput([{ productId: product.id, quantity: 3 }]);

    expect(() => buildOrderItems(input, [product])).toThrow(ConflictError);
    expect(() => buildOrderItems(input, [product])).toThrow(productOutOfStockMessage(product.name, 2));
  });

  it('accepts a line whose quantity exactly matches available stock', () => {
    const product = buildProduct({ stock: 3 });
    const input = buildCheckoutInput([{ productId: product.id, quantity: 3 }]);

    const items = buildOrderItems(input, [product]);

    expect(items).toEqual([
      {
        productId: product.id,
        nameSnapshot: product.name,
        imageUrlSnapshot: product.imageUrl,
        priceCentsSnapshot: product.priceCents,
        quantity: 3,
      },
    ]);
  });

  it('accepts a line whose quantity is below available stock', () => {
    const product = buildProduct({ stock: 10 });
    const input = buildCheckoutInput([{ productId: product.id, quantity: 1 }]);

    const items = buildOrderItems(input, [product]);

    expect(items[0]?.quantity).toBe(1);
  });

  it('maps multiple lines against multiple catalog products preserving cart order', () => {
    const laptop = buildProduct({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Laptop Lenovo',
      priceCents: 129990,
      stock: 5,
    });
    const mouse = buildProduct({
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Mouse Logitech',
      priceCents: 5990,
      stock: 20,
    });
    const input = buildCheckoutInput([
      { productId: mouse.id, quantity: 2 },
      { productId: laptop.id, quantity: 1 },
    ]);

    const items = buildOrderItems(input, [laptop, mouse]);

    expect(items).toEqual([
      {
        productId: mouse.id,
        nameSnapshot: 'Mouse Logitech',
        imageUrlSnapshot: mouse.imageUrl,
        priceCentsSnapshot: 5990,
        quantity: 2,
      },
      {
        productId: laptop.id,
        nameSnapshot: 'Laptop Lenovo',
        imageUrlSnapshot: laptop.imageUrl,
        priceCentsSnapshot: 129990,
        quantity: 1,
      },
    ]);
  });
});

describe('toLineItems', () => {
  it('maps each order item to a Stripe line item with the snapshot price in cents', () => {
    const order = buildPreparedOrder({
      currency: 'pen',
      items: [
        {
          nameSnapshot: 'Laptop Lenovo',
          imageUrlSnapshot: 'https://cdn.example.com/laptop.jpg',
          priceCentsSnapshot: 129990,
          quantity: 2,
        },
      ],
    });

    const lineItems = toLineItems(order);

    expect(lineItems).toEqual([
      {
        quantity: 2,
        price_data: {
          currency: 'pen',
          unit_amount: 129990,
          product_data: {
            name: 'Laptop Lenovo',
            images: ['https://cdn.example.com/laptop.jpg'],
          },
        },
      },
    ]);
  });

  it('omits images when the snapshot URL is not absolute', () => {
    const order = buildPreparedOrder({
      items: [
        {
          nameSnapshot: 'Laptop Lenovo',
          imageUrlSnapshot: '/relative/path.jpg',
          priceCentsSnapshot: 129990,
          quantity: 1,
        },
      ],
    });

    const [lineItem] = toLineItems(order);

    expect(lineItem?.price_data?.product_data?.images).toBeUndefined();
  });

  it('omits images when the snapshot has no image at all', () => {
    const order = buildPreparedOrder({
      items: [
        {
          nameSnapshot: 'Laptop Lenovo',
          imageUrlSnapshot: null,
          priceCentsSnapshot: 129990,
          quantity: 1,
        },
      ],
    });

    const [lineItem] = toLineItems(order);

    expect(lineItem?.price_data?.product_data?.images).toBeUndefined();
  });

  it('maps multiple order items to the same number of line items', () => {
    const order = buildPreparedOrder({
      items: [
        {
          nameSnapshot: 'Laptop Lenovo',
          imageUrlSnapshot: null,
          priceCentsSnapshot: 129990,
          quantity: 1,
        },
        {
          nameSnapshot: 'Mouse Logitech',
          imageUrlSnapshot: null,
          priceCentsSnapshot: 5990,
          quantity: 3,
        },
      ],
    });

    const lineItems = toLineItems(order);

    expect(lineItems).toHaveLength(2);
    expect(lineItems[1]).toMatchObject({ quantity: 3, price_data: { unit_amount: 5990 } });
  });
});

describe('toShippingOptions', () => {
  it('labels shipping as free and charges 0 when shippingCents is 0', () => {
    const order = buildPreparedOrder({ currency: 'pen', shippingCents: 0 });

    const [option] = toShippingOptions(order);

    expect(option).toEqual({
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: 'Envío gratis',
        fixed_amount: { amount: 0, currency: 'pen' },
      },
    });
  });

  it('labels shipping as standard and charges the exact amount when shippingCents is positive', () => {
    const order = buildPreparedOrder({ currency: 'pen', shippingCents: 1500 });

    const [option] = toShippingOptions(order);

    expect(option).toEqual({
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: 'Envío estándar',
        fixed_amount: { amount: 1500, currency: 'pen' },
      },
    });
  });

  it('returns exactly one shipping option regardless of the number of order items', () => {
    const order = buildPreparedOrder({
      items: [
        { nameSnapshot: 'A', imageUrlSnapshot: null, priceCentsSnapshot: 100, quantity: 1 },
        { nameSnapshot: 'B', imageUrlSnapshot: null, priceCentsSnapshot: 200, quantity: 1 },
      ],
    });

    expect(toShippingOptions(order)).toHaveLength(1);
  });
});
