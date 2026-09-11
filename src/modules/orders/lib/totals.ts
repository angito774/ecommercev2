import { FREE_SHIPPING_THRESHOLD_CENTS, SHIPPING_COST_CENTS } from '@/modules/cart/constants';

// Única definición de cómo se compone el total de un pedido. El drawer del carrito
// ya pintaba estas mismas cifras con la aritmética escrita a mano; el resumen del
// checkout y el Route Handler la comparten desde aquí para que el importe que ve el
// cliente y el que cobra Stripe no puedan divergir (D-8).
//
// Puro y sin `'use client'`: lo importan por igual un componente cliente y el
// servicio de servidor.

export type CheckoutLineTotal = {
  priceCents: number;
  quantity: number;
};

export type OrderTotals = {
  subtotalCents: number;
  shippingCents: number;
  amountTotalCents: number;
};

export function calculateSubtotalCents(lines: readonly CheckoutLineTotal[]): number {
  return lines.reduce((total, line) => total + line.priceCents * line.quantity, 0);
}

export function calculateShippingCents(subtotalCents: number): number {
  return subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_COST_CENTS;
}

export function calculateOrderTotals(lines: readonly CheckoutLineTotal[]): OrderTotals {
  const subtotalCents = calculateSubtotalCents(lines);
  const shippingCents = calculateShippingCents(subtotalCents);

  return { subtotalCents, shippingCents, amountTotalCents: subtotalCents + shippingCents };
}
