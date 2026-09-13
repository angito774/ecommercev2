import type Stripe from 'stripe';

import { APP_URL } from '@/lib/constants';
import { ConflictError, UpstreamError } from '@/lib/errors';
import { stripe } from '@/lib/stripe';
import {
  CHECKOUT_INTEGRATION_IDENTIFIER,
  ORDER_CURRENCY,
  PRODUCT_NOT_FOUND_MESSAGE,
  productOutOfStockMessage,
  productUnavailableMessage,
  STRIPE_UNAVAILABLE_MESSAGE,
} from '@/modules/orders/constants';
import { calculateOrderTotals } from '@/modules/orders/lib/totals';
import type { CheckoutInput } from '@/modules/orders/schemas/checkout.schema';
import { db } from '@/server/db';
import { orderItems, users } from '@/server/db/schema';
import * as orderRepository from '@/server/repositories/order.repository';
import * as productRepository from '@/server/repositories/product.repository';

type User = typeof users.$inferSelect;
type NewOrderItem = typeof orderItems.$inferInsert;

const SHIPPING_DISPLAY_NAME = 'Envío estándar';

// Perú es el único país al que la tienda despacha hoy. Sin dirección no hay pedido
// despachable, así que Stripe la recoge y se guarda tal cual llega (D-19).
const ALLOWED_SHIPPING_COUNTRIES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] =
  ['PE'];

export type PreparedOrder = {
  orderId: string;
  currency: string;
  shippingCents: number;
  items: Array<Pick<NewOrderItem, 'nameSnapshot' | 'imageUrlSnapshot' | 'priceCentsSnapshot' | 'quantity'>>;
};

// Relee precio, nombre, imagen y stock de `products` y construye las líneas
// congeladas. El carrito del cliente solo aporta `productId` y `quantity`: es el
// único momento del flujo en que todavía se puede decir que no sin haber cobrado
// (D-9, AC3, AC4).
export function buildOrderItems(
  input: CheckoutInput,
  catalog: Awaited<ReturnType<typeof productRepository.findManyByIds>>,
): Array<Pick<NewOrderItem, 'productId' | 'nameSnapshot' | 'imageUrlSnapshot' | 'priceCentsSnapshot' | 'quantity'>> {
  const byId = new Map(catalog.map((product) => [product.id, product]));

  return input.lines.map((line) => {
    const product = byId.get(line.productId);
    if (!product) throw new ConflictError(PRODUCT_NOT_FOUND_MESSAGE);
    if (!product.isActive) throw new ConflictError(productUnavailableMessage(product.name));
    if (product.stock < line.quantity) {
      throw new ConflictError(productOutOfStockMessage(product.name, product.stock));
    }

    return {
      productId: product.id,
      nameSnapshot: product.name,
      imageUrlSnapshot: product.imageUrl,
      priceCentsSnapshot: product.priceCents,
      quantity: line.quantity,
    };
  });
}

async function prepareOrder(user: User, input: CheckoutInput): Promise<PreparedOrder> {
  return db.transaction(async (tx) => {
    const catalog = await productRepository.findManyByIds(
      input.lines.map((line) => line.productId),
      tx,
    );

    const items = buildOrderItems(input, catalog);

    const totals = calculateOrderTotals(
      items.map((item) => ({ priceCents: item.priceCentsSnapshot, quantity: item.quantity })),
    );

    const order = await orderRepository.create(tx, {
      userId: user.id,
      status: 'pending',
      currency: ORDER_CURRENCY,
      ...totals,
    });

    await orderRepository.createItems(
      tx,
      items.map((item) => ({ ...item, orderId: order.id })),
    );

    return {
      orderId: order.id,
      currency: order.currency,
      shippingCents: totals.shippingCents,
      items,
    };
  });
}

export function toLineItems(order: PreparedOrder): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return order.items.map((item) => ({
    quantity: item.quantity,
    price_data: {
      currency: order.currency,
      // Siempre el snapshot recién leído de `products`, nunca un importe del
      // request: el contrato de entrada ni siquiera transporta uno (AC3).
      unit_amount: item.priceCentsSnapshot,
      product_data: {
        name: item.nameSnapshot,
        // Stripe rechaza una URL relativa o vacía; solo se envía si el admin
        // guardó una absoluta.
        images: item.imageUrlSnapshot?.startsWith('http') ? [item.imageUrlSnapshot] : undefined,
      },
    },
  }));
}

// El envío viaja como `shipping_options`, no como una línea más: así Stripe lo
// presenta como envío y no como un producto llamado «Envío» (D-8).
export function toShippingOptions(
  order: PreparedOrder,
): Stripe.Checkout.SessionCreateParams.ShippingOption[] {
  return [
    {
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: order.shippingCents === 0 ? 'Envío gratis' : SHIPPING_DISPLAY_NAME,
        fixed_amount: { amount: order.shippingCents, currency: order.currency },
      },
    },
  ];
}

export async function startCheckout(user: User, input: CheckoutInput): Promise<string> {
  const order = await prepareOrder(user, input);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Sin `payment_method_types`: omitirlo activa dynamic payment methods y deja
      // la configuración en el Dashboard, no en el código (D-3).
      line_items: toLineItems(order),
      shipping_options: toShippingOptions(order),
      shipping_address_collection: { allowed_countries: ALLOWED_SHIPPING_COUNTRIES },
      customer_email: user.email,
      // La orden se resuelve por aquí en el webhook: el `orderId` viaja dentro del
      // propio evento y existe desde que Stripe crea la sesión, mientras que
      // `stripe_checkout_session_id` se escribe en un UPDATE posterior (D-6).
      metadata: { orderId: order.orderId },
      integration_identifier: CHECKOUT_INTEGRATION_IDENTIFIER,
      // `APP_URL`, no la variable de entorno en crudo: sin su fallback, un entorno
      // sin `NEXT_PUBLIC_APP_URL` mandaría a Stripe un `undefined/checkout/...` que
      // la API rechaza, y el checkout devolvería un 502 permanente culpando a Stripe
      // de un fallo de configuración nuestro.
      success_url: `${APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/checkout`,
    });
  } catch (error) {
    // La orden `pending` queda huérfana, sin `session_id`: no aparece en ninguna
    // vista y `expired` nunca llegará porque no hay sesión. Son filas muertas, no
    // dinero perdido (§10, AC13).
    throw new UpstreamError(STRIPE_UNAVAILABLE_MESSAGE, { cause: error });
  }

  await orderRepository.attachStripeSession(order.orderId, session.id);

  if (!session.url) {
    throw new UpstreamError(STRIPE_UNAVAILABLE_MESSAGE);
  }

  return session.url;
}
