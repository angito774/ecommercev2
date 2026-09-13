import { describe, expect, it } from 'vitest';

import { productOutOfStockMessage, productUnavailableMessage } from './constants';

describe('productUnavailableMessage', () => {
  it('wraps the product name in guillemets and asks to remove it', () => {
    expect(productUnavailableMessage('Laptop Lenovo')).toBe(
      '«Laptop Lenovo» ya no está disponible. Quítalo del carrito para continuar.',
    );
  });

  it('keeps special characters in the name as-is', () => {
    expect(productUnavailableMessage('Mouse "Pro" & Teclado <RGB>')).toBe(
      '«Mouse "Pro" & Teclado <RGB>» ya no está disponible. Quítalo del carrito para continuar.',
    );
  });
});

describe('productOutOfStockMessage', () => {
  it('reports the exact available quantity when stock is insufficient but positive', () => {
    expect(productOutOfStockMessage('Laptop Lenovo', 3)).toBe(
      'Solo quedan 3 unidades de «Laptop Lenovo». Ajusta la cantidad para continuar.',
    );
  });

  it('uses the singular-agnostic wording even when only 1 unit remains', () => {
    expect(productOutOfStockMessage('Laptop Lenovo', 1)).toBe(
      'Solo quedan 1 unidades de «Laptop Lenovo». Ajusta la cantidad para continuar.',
    );
  });

  it('switches to the sold-out message when available is exactly 0', () => {
    expect(productOutOfStockMessage('Laptop Lenovo', 0)).toBe(
      '«Laptop Lenovo» se ha agotado. Quítalo del carrito para continuar.',
    );
  });

  it('falls back to the sold-out message for a negative available count', () => {
    expect(productOutOfStockMessage('Laptop Lenovo', -1)).toBe(
      '«Laptop Lenovo» se ha agotado. Quítalo del carrito para continuar.',
    );
  });

  it('keeps special characters in the name as-is', () => {
    expect(productOutOfStockMessage('Mouse "Pro" & Teclado <RGB>', 2)).toBe(
      'Solo quedan 2 unidades de «Mouse "Pro" & Teclado <RGB>». Ajusta la cantidad para continuar.',
    );
  });
});
