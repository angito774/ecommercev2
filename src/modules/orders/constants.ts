import type { OrderHistoryRange, OrderStatus } from './types/order.types';

// Una sola moneda en toda la app, igual que en `cart/constants.ts`. La columna
// `orders.currency` existe para que un pedido histórico conserve la suya, no para
// soportar multi-moneda: dos monedas vivas a la vez son un error de datos
// esperando ocurrir (spec 007, D-20).
export const ORDER_CURRENCY = 'pen';

// Stripe admite 100 `line_items` por sesión y el envío ocupa uno de los huecos de
// `shipping_options`, no de `line_items`; el tope se queda en la mitad porque un
// carrito de 50 SKU distintos ya es señal de otra cosa.
export const MAX_CHECKOUT_LINES = 50;

// Etiqueta del flujo en el Dashboard de Stripe, con el sufijo de 8 letras
// aleatorias que pide la guía. Permite comparar este checkout con los que vengan
// después (D-18).
export const CHECKOUT_INTEGRATION_IDENTIFIER = 'storefront-checkout-vqbtmxrd';

// Mensajes de los 409 de `POST /api/checkout`. Son funciones porque nombran el
// producto: el interceptor de `src/lib/axios.ts` colapsa la respuesta a su
// `message`, así que ese texto es todo lo que la UI recibe y tiene que bastar para
// que el cliente sepa qué línea quitar (AC4).
export const productUnavailableMessage = (name: string) =>
  `«${name}» ya no está disponible. Quítalo del carrito para continuar.`;

export const productOutOfStockMessage = (name: string, available: number) =>
  available > 0
    ? `Solo quedan ${available} unidades de «${name}». Ajusta la cantidad para continuar.`
    : `«${name}» se ha agotado. Quítalo del carrito para continuar.`;

// El producto desapareció de `products` entre que entró al carrito y el checkout.
// Sin nombre que mostrar: el snapshot del carrito no es fuente de verdad.
export const PRODUCT_NOT_FOUND_MESSAGE =
  'Alguno de los productos de tu carrito ya no existe. Vacíalo y vuelve a intentarlo.';

export const STRIPE_UNAVAILABLE_MESSAGE =
  'No se pudo iniciar el pago. Vuelve a intentarlo en unos segundos.';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Confirmando tu pago',
  paid: 'Pago confirmado',
  payment_failed: 'El pago no se completó',
  canceled: 'Pedido cancelado',
};

// Tope duro de pedidos por consulta del historial. El rango de fechas es lo que
// acota de verdad; esto solo evita que un rango de años arrastre la tabla entera
// por el pool serverless. Se detecta pidiendo una fila de más: `rows.length > 60`
// significa que el rango tenía más y el aviso de `meta.truncated` lo dice (D-5).
export const MAX_ORDER_HISTORY = 60;

export const orderKeys = {
  all: ['orders'] as const,
  // El rango entero entra en la clave: cambiar de mes es otra consulta, no una
  // invalidación de la anterior, y `keepPreviousData` necesita distinguirlas.
  history: (range: OrderHistoryRange) => [...orderKeys.all, 'history', range] as const,
  receipt: (orderId: string) => [...orderKeys.all, 'receipt', orderId] as const,
};

// El historial es un listado que solo cambia cuando el cliente compra o cuando el
// webhook confirma un cobro: refetchear en cada foco de la pestaña no compra nada.
export const ORDER_HISTORY_STALE_TIME_MS = 30_000;

// Corto a propósito: Stripe invalida los enlaces de boleta a los 30 días y el
// diálogo puede quedar abierto mucho rato en una pestaña olvidada (D-3).
export const ORDER_RECEIPT_STALE_TIME_MS = 5 * 60_000;

// 404 uniforme: el mismo texto para «no existe» y «no es tuyo», que es lo que
// impide enumerar pedidos ajenos desde la respuesta (D-13).
export const ORDER_NOT_FOUND_MESSAGE = 'No encontramos ese pedido en tu historial.';

// 409: el pedido existe y es suyo, pero Stripe todavía no tiene qué enseñar.
export const RECEIPT_NOT_READY_MESSAGE =
  'Stripe emite la boleta cuando el cobro queda confirmado, y este pedido aún no lo está.';

export const RECEIPT_UPSTREAM_MESSAGE =
  'No se pudo obtener la boleta desde Stripe. Vuelve a intentarlo en unos segundos.';

// Copy de la UI para los estados que nunca tendrán boleta. Distinto del 409: aquí
// no hay error que reintentar, solo una explicación (AC11).
export const RECEIPT_UNAVAILABLE_HINT =
  'Stripe solo emite la boleta con el cobro confirmado, así que este pedido no tiene ninguna.';
