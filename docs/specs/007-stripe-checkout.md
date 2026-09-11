---
id: 007
title: Stripe Checkout — pago único con página alojada
status: done
module: orders
scope: client
created: 2026-09-07
---

# 007 — Stripe Checkout: pago único con página alojada

> Material de investigación previo: [docs/stripe/checkout-integration.md](../stripe/checkout-integration.md).
> Este spec lo consume y lo cierra: donde aquel deja un `TODO` o una alternativa
> abierta, aquí hay una decisión (§8).

## 1. Contexto

La tienda ya tiene catálogo público (spec 004), ficha de producto (spec 005) y un
carrito local en Zustand (`src/modules/cart/store/cart.store.ts`), pero el botón
«Finalizar compra» del `CartDrawer` está literalmente `disabled` con el texto «El
pago estará disponible próximamente». No existe `orders`, no existe `order_items`
y `src/modules/orders/` solo contiene `.gitkeep`. Sin pago no hay negocio: el
embudo se corta en el último paso.

Se integra **Stripe Checkout en modo `payment` con página alojada**: el cliente
sale a `checkout.stripe.com`, paga, y Stripe nos avisa por webhook. Es la ruta
recomendada por la skill `stripe:stripe-best-practices` para la mayoría de apps
web, y evita cargar Stripe.js, gestionar PCI en nuestro formulario y construir
UI de pago propia.

## 2. Objetivo

Un cliente autenticado puede pagar el contenido de su carrito con tarjeta y su
pedido queda registrado como `paid` en Postgres aunque nunca vuelva a la tienda
después de pagar.

## 3. Alcance

### Incluye

- Tablas `orders` y `order_items` con precio congelado, más su migración.
- `src/lib/stripe.ts`: cliente Stripe único, solo servidor.
- `POST /api/checkout`: relee precios y stock reales, crea la orden `pending` y
  devuelve la URL de la Checkout Session.
- `POST /api/webhooks/stripe`: verifica la firma, marca la orden `paid`,
  descuenta stock y audita — todo en una transacción, idempotente.
- Módulo cliente `src/modules/orders/` (schemas, services, hooks, types,
  components) para el flujo de checkout.
- `(storefront)/checkout/page.tsx`: resumen del carrito y botón de pago.
- `(storefront)/checkout/success/page.tsx`: confirmación de solo lectura.
- Activar el CTA «Finalizar compra» del `CartDrawer`.

### No incluye (explícito)

- Panel admin de pedidos (`/admin/orders`, permisos `orders.read` /
  `orders.update_status`). Spec propio.
- Historial y detalle de pedidos del cliente (`/orders`, `/orders/[id]`). Spec propio.
- Reembolsos, cancelaciones desde la app, cambio manual de estado.
- Suscripciones, Stripe Tax (`automatic_tax`), Stripe Connect, guardar tarjeta
  (Setup Intents), Payment Element embebido.
- Carrito persistido en servidor (`carts` / `cart_items` de docs/SETUP.md §5.3).
  El carrito sigue siendo local; el servidor solo recibe `(productId, quantity)`.
- Correo de confirmación al cliente.
- Reserva de stock antes del pago.
- Cupones, descuentos y `promotion_codes` de Stripe.

## 4. Criterios de aceptación

- [ ] **AC1** — Dado un carrito con líneas y una sesión iniciada, cuando el
      cliente pulsa «Pagar» en `/checkout`, entonces el navegador termina en
      `checkout.stripe.com` con las líneas, los precios y el envío del resumen.
- [x] **AC2** — Dado un visitante sin sesión, cuando entra a `/checkout`,
      entonces recibe un `307` a `/sign-in?redirect_url=/checkout` y al
      autenticarse vuelve al checkout con su carrito intacto.
- [x] **AC3** — Dado un cliente que manipula el `body` de `POST /api/checkout`
      para enviar un precio distinto, cuando se crea la sesión, entonces el
      importe cobrado es el de `products.price_cents` en servidor: el request
      no tiene ningún campo de precio que el servidor lea.
- [x] **AC4** — Dado un producto con `is_active = false` o con
      `stock < quantity`, cuando se pide el checkout, entonces la respuesta es
      `409` con un mensaje que nombra el producto y **no** se crea ninguna fila
      en `orders`.
- [x] **AC5** — Dado un pago completado con la tarjeta `4242 4242 4242 4242`,
      cuando Stripe entrega `checkout.session.completed`, entonces la orden pasa
      de `pending` a `paid`, se guarda `stripe_payment_intent_id`, se descuenta
      el stock de cada línea y se escribe una fila `order.paid` en `audit_logs`.
- [x] **AC6** — Dado el mismo evento de Stripe entregado dos veces (reintento),
      cuando el webhook lo procesa, entonces la segunda entrega no descuenta
      stock otra vez ni escribe un segundo `order.paid`, y responde `200`.
- [x] **AC7** — Dado un `POST /api/webhooks/stripe` con una firma inválida o
      ausente, cuando llega, entonces la respuesta es `400` y ninguna orden
      cambia de estado.
- [x] **AC8** — Dado un cliente que paga y cierra el navegador sin volver,
      cuando se consulta la base, entonces su orden está `paid`: el fulfillment
      no depende de que cargue `/checkout/success`.
- [ ] **AC9** — Dado el retorno a `/checkout/success?session_id=…`, cuando la
      orden ya está `paid`, entonces se muestra la confirmación con el número de
      pedido, las líneas y el total, y el carrito local queda vacío.
- [ ] **AC10** — Dado el retorno a `/checkout/success` antes de que llegue el
      webhook, cuando se renderiza, entonces se muestra «confirmando tu pago» y
      la vista se actualiza sola cuando la orden pasa a `paid`.
- [x] **AC11** — Dado un `session_id` de otro usuario o inexistente en
      `/checkout/success`, cuando se renderiza, entonces sale el `not-found` de
      la tienda y no se filtra ningún dato del pedido ajeno.
- [ ] **AC12** — Dado el carrito vacío, cuando se entra a `/checkout`, entonces
      se muestra un estado vacío con enlace al catálogo y sin botón de pago.
- [x] **AC13** — Dado un fallo de la API de Stripe al crear la sesión, cuando se
      responde, entonces el status es `502` con `{ message }` y la orden
      `pending` huérfana no aparece en ninguna vista del cliente.
- [x] **AC14** — Dado `npm run typecheck && npm run lint && npm run build`,
      cuando se ejecuta al cerrar el spec, entonces los tres pasan en verde.

## 5. Modelo de datos

Dos tablas nuevas. **Requiere migración** (`npm run db:generate` +
`npm run db:migrate`). Ningún cambio en `products`: no se añaden
`stripe_product_id` ni `stripe_price_id` — la decisión de no sincronizar el
catálogo con Stripe está razonada en el documento de referencia §1 y se mantiene.

### `orders`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `uuid` PK default random | |
| `user_id` | `uuid` FK `users.id` `restrict` notNull | `syncUserDeleted` desactiva, no borra: `restrict` es seguro |
| `status` | `order_status` enum notNull default `pending` | `pending` \| `paid` \| `payment_failed` \| `canceled` |
| `subtotal_cents` | `integer` notNull | suma de `price_cents_snapshot × quantity` |
| `shipping_cents` | `integer` notNull | 0 o `SHIPPING_COST_CENTS`, calculado en servidor |
| `amount_total_cents` | `integer` notNull | `subtotal + shipping`. Snapshot del importe cobrado |
| `currency` | `varchar(3)` notNull default `pen` | |
| `stripe_checkout_session_id` | `varchar(255)` **unique**, nullable | null entre el INSERT y la creación de la sesión |
| `stripe_payment_intent_id` | `varchar(255)` nullable | se llena en el webhook |
| `shipping_address` | `jsonb` nullable | dirección que recoge Stripe, tal cual llega |
| `created_at` / `updated_at` | `timestamptz` notNull | `$onUpdate` como el resto |

Índices: `unique(stripe_checkout_session_id)` (lo genera `.unique()`),
`orders_user_id_created_at_idx` en `(user_id, created_at desc)`,
`orders_status_idx` en `(status)`.

### `order_items`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `uuid` PK default random | |
| `order_id` | `uuid` FK `orders.id` `cascade` notNull | |
| `product_id` | `uuid` FK `products.id` `restrict` notNull | igual que `products.category_id` |
| `name_snapshot` | `varchar(160)` notNull | mismo ancho que `products.name` |
| `image_url_snapshot` | `varchar(500)` nullable | mismo ancho que `products.image_url` |
| `price_cents_snapshot` | `integer` notNull | **el precio congelado** |
| `quantity` | `integer` notNull | |

Índice: `order_items_order_id_idx` en `(order_id)`.

```ts
// src/server/db/schema/order.ts — firma propuesta
export const orderStatus = pgEnum('order_status', [
  'pending',
  'paid',
  'payment_failed',
  'canceled',
]);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    status: orderStatus('status').notNull().default('pending'),
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull(),
    amountTotalCents: integer('amount_total_cents').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('pen'),
    stripeCheckoutSessionId: varchar('stripe_checkout_session_id', { length: 255 }).unique(),
    stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
    shippingAddress: jsonb('shipping_address').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('orders_user_id_created_at_idx').on(t.userId, t.createdAt.desc()),
    index('orders_status_idx').on(t.status),
  ],
);
```

```ts
// src/server/db/schema/order-item.ts — firma propuesta
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
    nameSnapshot: varchar('name_snapshot', { length: 160 }).notNull(),
    imageUrlSnapshot: varchar('image_url_snapshot', { length: 500 }),
    priceCentsSnapshot: integer('price_cents_snapshot').notNull(),
    quantity: integer('quantity').notNull(),
  },
  (t) => [index('order_items_order_id_idx').on(t.orderId)],
);
```

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| POST | `/api/checkout` | cliente autenticado y **activo** (`requireActiveUser`, sin permiso RBAC) | `CheckoutInput` | `{ url: string }` | 400, 401, 403, 409, 502, 500 |
| POST | `/api/webhooks/stripe` | firma `stripe-signature` | evento crudo de Stripe | `{ received: true }` | 400, 500 |

No hay `GET` nuevo: la página de éxito lee la orden por repositorio desde un
Server Component, no por HTTP.

### Entrada de `POST /api/checkout`

```ts
// src/modules/orders/schemas/checkout.schema.ts
export const checkoutLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.int().min(1).max(MAX_LINE_QUANTITY), // 99, de cart/constants.ts
});

export const checkoutSchema = z.object({
  lines: z
    .array(checkoutLineSchema)
    .min(1, 'El carrito está vacío.')
    .max(MAX_CHECKOUT_LINES) // 50: Stripe admite 100 line_items y el envío ocupa uno
    .refine(
      (lines) => new Set(lines.map((l) => l.productId)).size === lines.length,
      'Hay productos repetidos en el carrito.',
    ),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
```

**No existe ningún campo de precio, nombre, imagen ni total en la entrada.** Es
la garantía estructural de AC3: no hay nada que manipular porque no hay nada que
el servidor lea del cliente salvo `productId` y `quantity`.

### Salida de `POST /api/checkout`

```ts
export const checkoutResponseSchema = z.object({ url: z.url() });
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
```

### Mapa de errores de `POST /api/checkout`

| Situación | Error de dominio | Status |
|---|---|---|
| Body no-JSON o Zod falla | — (`parseJsonBody`) | 400 |
| Sin sesión o sin fila espejo | `UnauthorizedError` | 401 |
| Cuenta desactivada (`is_active = false`) | `ForbiddenError` (sin permiso asociado) | 403 |
| Producto inexistente o inactivo | `ConflictError` | 409 |
| Stock insuficiente | `ConflictError` | 409 |
| La API de Stripe falla | `UpstreamError` | 502 |
| Cualquier otra cosa | — | 500 |

Todo lo traduce `toErrorResponse()` de `src/lib/api-guard.ts`, sin `if` nuevos.

### Eventos de webhook manejados

| Evento | Efecto |
|---|---|
| `checkout.session.completed` | fulfill si `payment_status !== 'unpaid'` |
| `checkout.session.async_payment_succeeded` | fulfill |
| `checkout.session.async_payment_failed` | `status = 'payment_failed'` |
| `checkout.session.expired` | `status = 'canceled'` si sigue `pending` |
| cualquier otro | `200` sin efecto, para que Stripe no reintente |

## 7. Arquitectura y archivos afectados

```
src/
├── lib/
│   └── stripe.ts                                    NUEVO  cliente Stripe, server-only
├── server/
│   ├── db/schema/order.ts                           NUEVO
│   ├── db/schema/order-item.ts                      NUEVO
│   ├── db/schema/index.ts                           EDITA  barrel
│   ├── repositories/order.repository.ts             NUEVO
│   ├── repositories/product.repository.ts           EDITA  findManyByIds, decrementStock
│   ├── services/checkout.service.ts                 NUEVO  startCheckout()
│   └── services/order-fulfillment.service.ts        NUEVO  fulfillCheckoutSession()
├── modules/
│   ├── cart/components/cart-drawer.tsx              EDITA  CTA → /checkout
│   └── orders/
│       ├── constants.ts                             NUEVO
│       ├── types/order.types.ts                     NUEVO
│       ├── schemas/checkout.schema.ts               NUEVO
│       ├── services/checkout.service.ts             NUEVO  axios
│       ├── hooks/use-create-checkout.ts             NUEVO  TanStack mutation
│       ├── lib/totals.ts                            NUEVO  subtotal/envío/total
│       └── components/
│           ├── checkout-summary.tsx                 NUEVO  client, lee el carrito
│           ├── order-confirmation.tsx               NUEVO  presentacional
│           ├── clear-cart-on-success.tsx            NUEVO  client, efecto
│           └── order-status-poller.tsx              NUEVO  client, router.refresh()
├── app/
│   ├── api/checkout/route.ts                        NUEVO
│   ├── api/webhooks/stripe/route.ts                 NUEVO
│   └── (storefront)/checkout/
│       ├── page.tsx                                 NUEVO
│       └── success/page.tsx                         NUEVO
└── drizzle/000X_*.sql                               GENERADO
```

Flujo, capa por capa:

```
CheckoutSummary (client, Zustand)
  └─ useCreateCheckout()            TanStack Query mutation
      └─ createCheckout()           axios → POST /api/checkout
          └─ route.ts               requireAuth · Zod · toErrorResponse
              └─ checkout.service   tx: relee precios, crea orden + items
                  ├─ product.repository.findManyByIds()
                  └─ order.repository.create() / createItems()
              └─ stripe.checkout.sessions.create()
              └─ order.repository.attachStripeSession()

Stripe ──► POST /api/webhooks/stripe
             └─ constructEvent (firma)
             └─ order-fulfillment.service
                 └─ tx: markPaid condicional · decrementStock · logAudit
```

## 8. Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| D-1 | Precios inline (`price_data`) calculados en el momento | Espejar `products` como `Product`/`Price` de Stripe | Los `Price` de Stripe son inmutables: cada cambio de precio en el admin obligaría a archivar y recrear, y a mantener un segundo sistema de verdad para un dato que ya vive en Postgres (referencia §1) |
| D-2 | Checkout alojado (`ui_mode` por defecto) | Payment Element embebido | No requiere Stripe.js, ni clave publicable, ni CSP con `*.stripe.com`. La skill `stripe:stripe-best-practices` lo lista como la opción preferente para apps web |
| D-3 | Nunca se pasa `payment_method_types` | Fijar `['card']` | Regla dura de la skill: omitirlo activa *dynamic payment methods* y deja la configuración en el Dashboard, no en el código |
| D-4 | El fulfillment vive **solo** en el webhook | Fulfillar en `/checkout/success` | Un cliente puede pagar y perder la conexión antes de que cargue la página; esa lógica pierde pedidos en silencio (skill, sección *Webhooks and fulfillment*) — AC8 |
| D-5 | Idempotencia por `UPDATE … WHERE id = $1 AND status = 'pending' RETURNING *` | Leer la orden, comprobar `status`, y luego actualizar | Un read-then-write dentro de dos entregas concurrentes del mismo evento puede pasar la comprobación dos veces. El UPDATE condicional resuelve la carrera en el motor: 0 filas devueltas = ya fulfillada, se sale sin tocar stock ni bitácora — AC6 |
| D-6 | La orden se resuelve por `session.metadata.orderId` | Resolver por `stripe_checkout_session_id` | El `orderId` viaja dentro del propio evento y existe desde que Stripe crea la sesión; el `session_id` de nuestra fila se escribe en un `UPDATE` posterior. La columna sigue existiendo, `unique`, como red de seguridad y como clave de lectura de la página de éxito |
| D-7 | Se manejan los cuatro eventos (`completed`, `async_payment_succeeded`, `async_payment_failed`, `expired`) y se exige `payment_status !== 'unpaid'` | Solo `checkout.session.completed` | Con métodos de notificación diferida el `completed` llega con la sesión aún impagada: fulfillar ahí concede el pedido a pagos que después fallan (skill, misma sección). `expired` evita que las órdenes `pending` se acumulen para siempre |
| D-8 | El envío se calcula en servidor reutilizando `FREE_SHIPPING_THRESHOLD_CENTS` y `SHIPPING_COST_CENTS` de `src/modules/cart/constants.ts`, y viaja como `shipping_options[].shipping_rate_data` | Sumarlo como un `line_item` más, o duplicar las constantes en el servidor | El drawer ya pinta esas dos cifras; una segunda copia sería la que se desincroniza. `shipping_options` hace que Stripe lo muestre como envío y no como un producto llamado «Envío». El archivo es puro (sin `'use client'`), así que un Route Handler puede importarlo |
| D-9 | Se valida stock y `is_active` **antes** de crear la sesión, con `409` que nombra el producto | Dejar que falle en el webhook | Es el único momento en que todavía se puede decir que no sin haber cobrado — AC4 |
| D-10 | El stock se descuenta en el webhook con `SET stock = stock - qty` **sin clamp**, y si el `RETURNING` deja algún valor negativo se escribe un `audit_logs` `order.oversold` con `severity: 'warning'` | Clamp con `GREATEST(stock - qty, 0)` | El clamp borra la evidencia de la sobreventa. `STOCK_LEVEL` del repositorio ya mapea `<= 0` a `'out'`, así que un negativo no rompe la tienda y sí deja la traza que un administrador necesita para resolverlo |
| D-11 | Sin reserva de stock entre la creación de la sesión y el pago | Reservar y liberar por expiración | Requiere una columna de reservas, un job de liberación y decidir el TTL. Con el volumen actual la ventana es de minutos; el coste no se justifica todavía (§11) |
| D-12 | `requireActiveUser()` sin código de permiso en `/api/checkout` | `authorize('orders.create')` | Comprar no es una capacidad administrativa: exigir un permiso RBAC obligaría a concedérselo al rol `customer`, que hoy está vacío a propósito (docs/SETUP.md §5.1). La autorización real es que `orders.user_id` sea el usuario de la sesión. Pero sin `requirePermission()` detrás nadie mira `is_active` —`requireAuth()` no lo hace a propósito—, así que hace falta la variante que sí lo comprueba (corrección de la revisión, M-2) |
| D-13 | El webhook **no** lleva `requireAuth()` ni `authorize()` | Protegerlo como el resto de `/api` | Quien llama es Stripe, no un usuario de Clerk. La autenticación aquí es `stripe.webhooks.constructEvent`, exactamente igual que `verifyWebhook` en `/api/webhooks/clerk` |
| D-14 | El body del webhook se lee con `request.text()` | `request.json()` | La verificación de firma necesita el string crudo; con el objeto ya parseado la firma nunca cuadra |
| D-15 | El log `order.paid` va **dentro** de la transacción del fulfillment | Best-effort fuera de la tx (opción que la referencia dejaba abierta) | Cuesta lo mismo, y `db.transaction` ya envuelve el `markPaid` y el descuento de stock. Cumple docs/SETUP.md §5.2 regla 2 sin excepciones que después haya que recordar |
| D-16 | `/checkout/success` lee la orden por `order.repository`, filtrando por `user_id` | `stripe.checkout.sessions.retrieve()` desde la página | Evita una segunda dependencia de red a Stripe en el render y respeta el flujo del repo (Server Component → repositorio → Drizzle). El filtro por `user_id` es lo que impide leer el pedido ajeno con un `session_id` robado — AC11 |
| D-17 | Si la orden aún está `pending`, un componente cliente llama a `router.refresh()` cada 2 s, hasta 10 veces | Un endpoint `GET /api/orders/by-session/:id` con polling de TanStack Query | La ventana es de uno o dos segundos. Un endpoint público más, con su schema y su hook, para cubrirla no se sostiene — AC10 |
| D-18 | Se pasa `integration_identifier: 'storefront-checkout-vqbtmxrd'` | Omitirlo | La skill lo indica para API `2026-03-25.dahlia` o posterior (el SDK v22 la fija): permite comparar flujos de checkout en el Dashboard. El sufijo son las 8 letras aleatorias que pide la guía |
| D-19 | `shipping_address_collection: { allowed_countries: ['PE'] }` y la dirección se guarda tal cual en `orders.shipping_address` | No recoger dirección, o modelarla en columnas | Sin dirección no hay pedido despachable. Guardarla como `jsonb` sin normalizar evita inventar un esquema de direcciones antes de saber quién lo consume; el spec de `/admin/orders` decidirá si merece columnas |
| D-20 | Moneda `pen` en una constante única (`ORDER_CURRENCY`) | Leerla de una variable de entorno | Dos monedas en la misma app son un error de datos esperando ocurrir (ya razonado en `cart/constants.ts`). La columna `currency` existe para que un pedido histórico conserve la suya, no para soportar multi-moneda hoy |
| D-21 | La lógica de negocio vive en `src/server/services/`, no en los Route Handlers | Todo en `route.ts`, como muestra el ejemplo de la referencia | Ambos handlers cruzan `product.repository` y `order.repository`; eso es exactamente lo que docs/SETUP.md §3 asigna a `server/services/`. Además el webhook queda igual de fino que `/api/webhooks/clerk`, que delega en `user-sync.service.ts` |

## 9. Tareas

- [x] **T1** — Instalar el SDK: `npm i stripe` · archivo: `package.json` · verificación: `npm run typecheck`
- [x] **T2** — Crear el cliente Stripe único con `import 'server-only'` y lectura de `STRIPE_SECRET_KEY`, lanzando si falta · archivo: `src/lib/stripe.ts` · verificación: `npm run typecheck`
- [x] **T3** — Definir el enum `order_status` y la tabla `orders` de §5 · archivo: `src/server/db/schema/order.ts` · verificación: `npm run typecheck`
- [x] **T4** — Definir la tabla `order_items` de §5 · archivo: `src/server/db/schema/order-item.ts` · verificación: `npm run typecheck`
- [x] **T5** — Exportar `orders`, `orderStatus` y `orderItems` desde el barrel · archivo: `src/server/db/schema/index.ts` · verificación: `npm run typecheck`
- [x] **T6** — Generar y aplicar la migración · archivos: `drizzle/` · verificación: `npm run db:generate && npm run db:migrate`, luego `npm run db:studio` muestra ambas tablas vacías
- [x] **T7** — Constantes del módulo: `ORDER_CURRENCY`, `MAX_CHECKOUT_LINES`, `CHECKOUT_INTEGRATION_IDENTIFIER`, mensajes de conflicto y etiquetas de estado · archivo: `src/modules/orders/constants.ts` · verificación: `npm run typecheck`
- [x] **T8** — Tipos inferidos de Drizzle (`Order`, `OrderItem`, `OrderStatus`) y las proyecciones que consume la confirmación · archivo: `src/modules/orders/types/order.types.ts` · verificación: `npm run typecheck`
- [x] **T9** — Schemas Zod de §6 (entrada y respuesta del checkout) · archivo: `src/modules/orders/schemas/checkout.schema.ts` · verificación: `npm run typecheck`
- [x] **T10** — Helpers puros de totales (subtotal, envío según umbral, total) reutilizando las constantes de `cart/constants.ts` · archivo: `src/modules/orders/lib/totals.ts` · verificación: `npm run typecheck`
- [x] **T11** — Añadir `findManyByIds(ids, reader)` a los lectores del repositorio de productos · archivo: `src/server/repositories/product.repository.ts` · verificación: `npm run typecheck`
- [x] **T12** — Añadir `decrementStock(tx, lines)` con `RETURNING stock` y sin clamp (D-10) · archivo: `src/server/repositories/product.repository.ts` · verificación: `npm run typecheck`
- [x] **T13** — Repositorio de pedidos: `create`, `createItems`, `attachStripeSession`, `findByIdWithItems`, `findBySessionIdForUser`, `markPaid` (UPDATE condicional de D-5), `markPaymentFailed`, `markCanceled` · archivo: `src/server/repositories/order.repository.ts` · verificación: `npm run typecheck`
- [x] **T14** — Servicio `startCheckout(user, input)`: transacción que relee precios y stock, valida (D-9), crea orden e ítems; luego crea la Checkout Session y adjunta el `session_id`. Lanza `ConflictError` / `UpstreamError` · archivo: `src/server/services/checkout.service.ts` · verificación: `npm run typecheck`
- [x] **T15** — Servicio de fulfillment: `fulfillCheckoutSession`, `failCheckoutSession`, `expireCheckoutSession`, cada uno en su transacción con `logAudit` · archivo: `src/server/services/order-fulfillment.service.ts` · verificación: `npm run typecheck`
- [x] **T16** — Route Handler `POST /api/checkout`: `requireActiveUser` → `parseJsonBody` → servicio → `{ url }`, con `toErrorResponse` · archivo: `src/app/api/checkout/route.ts` · verificación: `npm run typecheck`
- [x] **T17** — Route Handler `POST /api/webhooks/stripe`: `request.text()`, `constructEvent`, `switch` sobre los cuatro eventos de §6, `500` ante fallo para que Stripe reintente · archivo: `src/app/api/webhooks/stripe/route.ts` · verificación: `npm run typecheck`
- [x] **T18** — Service axios `createCheckout(input)` contra `/checkout` · archivo: `src/modules/orders/services/checkout.service.ts` · verificación: `npm run typecheck`
- [x] **T19** — Hook `useCreateCheckout()`: mutation que en `onSuccess` hace `window.location.assign(url)` y en `onError` muestra el toast · archivo: `src/modules/orders/hooks/use-create-checkout.ts` · verificación: `npm run typecheck`
- [x] **T20** — Componente cliente `CheckoutSummary`: lee el carrito de Zustand con `useCartHydrated`, pinta líneas, subtotal, envío y total, y dispara el hook. Estado vacío de AC12, botón deshabilitado mientras `isPending` · archivo: `src/modules/orders/components/checkout-summary.tsx` · verificación: `npm run lint`
- [x] **T21** — Página `/checkout`: Server Component con `await auth.protect()`, `metadata.robots.index = false` y `<CheckoutSummary />` · archivo: `src/app/(storefront)/checkout/page.tsx` · verificación: `npm run build`
- [x] **T22** — Componente presentacional `OrderConfirmation` (número de pedido, líneas, totales, estado) · archivo: `src/modules/orders/components/order-confirmation.tsx` · verificación: `npm run lint`
- [x] **T23** — Componente cliente `ClearCartOnSuccess`: vacía el carrito de Zustand al montar · archivo: `src/modules/orders/components/clear-cart-on-success.tsx` · verificación: `npm run lint`
- [x] **T24** — Componente cliente `OrderStatusPoller`: `router.refresh()` cada 2 s, máximo 10 intentos (D-17) · archivo: `src/modules/orders/components/order-status-poller.tsx` · verificación: `npm run lint`
- [x] **T25** — Página `/checkout/success`: `auth.protect()` + `requireAuth()`, lee `session_id` de `searchParams`, `findBySessionIdForUser`, `notFound()` si no resuelve, y compone T22/T23/T24 · archivo: `src/app/(storefront)/checkout/success/page.tsx` · verificación: `npm run build`
- [x] **T26** — Sustituir el botón `disabled` y su leyenda por un enlace a `/checkout` que cierra el drawer · archivo: `src/modules/cart/components/cart-drawer.tsx` · verificación: `npm run lint`
- [x] **T27** — Prueba end-to-end en local: `npm run dev` + `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, compra con `4242 4242 4242 4242`, comprobar `orders.status = 'paid'`, stock descontado y la fila `order.paid` en `audit_logs` · verificación: manual, con captura del resultado de `db:studio`
- [x] **T28** — Reenviar el mismo evento con `stripe events resend <id>` y comprobar que no hay segundo descuento de stock ni segunda fila de bitácora (AC6) · verificación: manual
- [x] **T29** — Registrar `orders` y `order_items` como tablas ya construidas y el checkout como módulo entregado · archivo: `docs/SETUP.md` (§5.3 y §6) · verificación: lectura
- [x] **T30** — Cierre: `npm run typecheck && npm run lint && npm run build` en verde y todos los AC marcados · verificación: los tres comandos

### Registro de la prueba de T27 / T28 (2026-09-07)

`stripe listen` forwardeando a `localhost:3000/api/webhooks/stripe` y `npm run dev`
en marcha. Los eventos llegan con `api_version: 2026-08-26.dahlia`, la misma que
fija el SDK v22, y traen la dirección en `collected_information` — que es el campo
que lee `readShippingAddress()`, no el `shipping_details` de nivel superior de
versiones anteriores.

| Comprobación | Resultado |
|---|---|
| Moneda `pen` en la sesión real | **Aceptada.** `currency: 'pen'`, `amount_total: 108500`. `ORDER_CURRENCY` se queda en `pen`; el riesgo de §10 queda cerrado |
| Sesión creada por el servicio | `mode: payment`, `ui_mode: hosted_page`, `shipping_address_collection: { allowed_countries: ['PE'] }`, `metadata.orderId`, `customer_email`, `shipping_options` con su `shr_…`, `line_items` inline. Nunca se envió `payment_method_types` |
| Pago con `4242 4242 4242 4242` | Sesión real completada vía `stripe trigger checkout.session.completed --override "checkout_session:metadata[orderId]=…"`, que confirma la página de pago con la Visa de prueba. `PaymentIntent` `succeeded`, `brand: visa`, `last4: 4242` |
| AC5 — fulfillment | Orden `8bece14d` `pending → paid`, `stripe_payment_intent_id = pi_3UDFPmQA1QiCftQU0dlESp4d`, stock 45→43 y 30→29 (qty 2 y 1), 1 fila `order.paid` en `audit_logs` con `metadata` = `{ source, stripeEventId, stripeSessionId }` |
| AC6 — idempotencia | `stripe events resend evt_1UDFPoQA1QiCftQUbzOLaizH` + una tercera entrega firmada con el `whsec_` real: **200 `{"received":true}`**, stock intacto en 43/29 y `audit_logs` sigue con **1** sola fila |
| AC7 — firma | Sin cabecera `stripe-signature` → `400`. Con `t=1,v1=deadbeef` → `400 {"message":"Firma inválida"}`. Ninguna orden cambió |
| Pipeline real completa | `stripe.checkout.sessions.expire()` sobre una sesión nuestra disparó un `checkout.session.expired` **real** (`evt_1UDFP1QA1QiCftQUKVAa47vU`) que Stripe entregó por `stripe listen`: la orden pasó a `canceled` con su fila `order.canceled` |
| AC2 — sin sesión | `GET /checkout` → `307` a `/sign-in?redirect_url=…%2Fcheckout`. `POST /api/checkout` → `401 { message }`, nunca HTML de login |
| AC4 — conflictos | Stock insuficiente, producto inactivo y producto inexistente lanzan `ConflictError` (→ `409`) con el nombre del producto, y `orders` no crece: 2 filas antes y 2 después |
| AC13 — fallo de Stripe | Con una clave inválida, la API falla de verdad → `UpstreamError` (→ `502`) y la orden huérfana queda `pending` con `stripe_checkout_session_id = null`, así que `findBySessionIdForUser` no la encuentra nunca |
| AC11 — pedido ajeno | `findBySessionIdForUser` devuelve la orden a su dueño y `null` tanto con otro `user_id` como con un `session_id` inexistente → `notFound()` |

Sin verificar por no ser automatizable desde aquí: el recorrido con navegador real
(pulsar «Pagar» en `/checkout`, teclear la tarjeta en `checkout.stripe.com` y volver
a `/checkout/success`). Con ello quedan pendientes de comprobación visual **AC1**,
**AC9**, **AC10** y **AC12**, y que `orders.shipping_address` se rellene de verdad
—la sesión del `trigger` no recogía dirección, aunque las nuestras sí la piden—.
Toda la lógica que hay debajo sí está verificada arriba.

### Correcciones de la revisión — iteración 1 (2026-09-07)

Veredicto RECHAZADO del `reviewer`: 2 hallazgos MAYOR y 3 MENOR. Se cerraron los
cinco.

- [x] **M-1 — URL de retorno sin fallback.** `checkout.service.ts` leía
      `process.env.NEXT_PUBLIC_APP_URL` en crudo: sin esa variable, `success_url`
      salía como `undefined/checkout/success?...`, Stripe rechazaba la sesión y el
      checkout devolvía un `502` permanente culpando a Stripe de un fallo de
      configuración propio. Ahora usa `APP_URL` de `src/lib/constants.ts`, la
      constante canónica que ya consumen la ficha de producto, el JSON-LD y
      `user-access.service.ts`.
- [x] **M-2 — Usuario desactivado podía seguir pagando.** `requireAuth()` no mira
      `is_active` a propósito (esa frontera la pone `requirePermission()`), y
      `/api/checkout` era el primer endpoint sin permiso RBAC detrás: un usuario
      recién desactivado desde `/admin/users` conservaba su sesión de Clerk y podía
      completar la compra. Se añade `requireActiveUser()` en `src/lib/auth.ts`, que
      envuelve a `requireAuth()` y lanza `ForbiddenError` → `403`. `ForbiddenError`
      acepta ahora `PermissionCode | null`: `null` significa que el rechazo no cuelga
      de ningún permiso —no hay código que conceder a una cuenta desactivada—, y
      ningún consumidor lee `.permission`, así que el cambio no afecta a los
      handlers de admin (`typecheck` completo en verde).
- [x] **m-1 — Carrito vaciado con la orden aún `pending`.** Con métodos de pago
      diferidos (D-3 los deja activos) el cliente puede volver antes de que el pago
      se confirme, y `ClearCartOnSuccess` lo vaciaba igual: si después fallaba, se
      quedaba sin carrito y sin pedido. La page ahora solo monta el componente con
      `order.status === 'paid'`. La condición vive en un único sitio: el componente
      no la vuelve a comprobar.
- [x] **m-2 — Polling agotado en silencio.** Al superar los 10 intentos, el
      intervalo se limpiaba y la vista se quedaba para siempre en «Confirmando tu
      pago» con un spinner que ya no comprobaba nada. `OrderStatusPoller` ahora
      renderiza un aviso con botón «Volver a comprobar» cuando se agotan.
- [x] **m-3 — Tercera repetición del patrón de transición.** `markPaid`,
      `markPaymentFailed` y `markCanceled` repetían el mismo
      `UPDATE … WHERE status = 'pending' RETURNING`; se extrae
      `transitionFromPending()` privado en el repositorio, de modo que la invariante
      de idempotencia de D-5 existe una sola vez. En el servicio, `fail` y `expire`
      pasan por `settleFromPending()`, que recibe el mutador, el estado destino y la
      acción de bitácora. `fulfillCheckoutSession` **no** entra en esa abstracción:
      descuenta stock y audita la sobreventa, así que solo *parece* la misma
      operación y forzarla con un callback saldría más caro que las cuatro líneas
      duplicadas.

Verificación tras las correcciones: `npm run typecheck` ✓ · `npm run lint` ✓
(0 errores; los 6 warnings de `react-hooks/incompatible-library` son de las tablas
de TanStack Table y preexisten a este spec) · `npm run build` ✓.

## 10. Riesgos y consideraciones

- **Orden `pending` huérfana.** Si la llamada a Stripe falla tras el `COMMIT` de
  la transacción, queda una orden `pending` sin `session_id`. No se muestra en
  ninguna vista (la página de éxito filtra por `session_id`) y `expired` nunca
  llegará porque no hay sesión. Aceptado: son filas muertas, no dinero perdido.
  Se limpian cuando exista `/admin/orders`.
- ~~**Moneda `pen` en el sandbox.**~~ **Resuelto en T27**: el sandbox acepta PEN.
  Una sesión real salió con `currency: 'pen'` y `amount_total: 108500`, así que
  `ORDER_CURRENCY` se queda en `pen` y no hace falta el plan B de `usd`.
- **Importe mínimo.** Stripe rechaza cobros por debajo de ~0,50 USD equivalente.
  Con el catálogo actual no es alcanzable, pero un producto de céntimos daría un
  `502` poco explicativo.
- **Sobreventa.** Entre la validación de stock (creación de la sesión) y el pago
  hay una ventana en la que otro cliente puede llevarse la última unidad. D-10
  la deja registrada en `audit_logs` en vez de ocultarla; la resolución es
  manual hasta que exista el panel de pedidos.
- **N+1 en el descuento de stock.** `decrementStock` hace un `UPDATE` por línea.
  Con el tope de 50 líneas y dentro de una transacción ya abierta es aceptable;
  si creciera, se sustituye por un `UPDATE … FROM (VALUES …)`.
- **Reentrega y concurrencia del webhook.** Stripe puede entregar dos eventos
  para la misma sesión casi a la vez. La atomicidad la da el `UPDATE`
  condicional de D-5, no una comprobación en memoria: no se replica el `Set` de
  ids del webhook de Clerk, que solo cubre reintentos dentro del mismo proceso.
- **Timeout del webhook.** Stripe corta a los ~10 s. La transacción de
  fulfillment son tres consultas cortas; si Neon se ralentiza, el `500`
  provoca un reintento y la idempotencia lo absorbe.
- **`STRIPE_SECRET_KEY` es una clave restringida** (`rk_test_…`) y solo de
  servidor. `src/lib/stripe.ts` lleva `import 'server-only'` para que un import
  accidental desde un componente cliente rompa el build en vez de filtrarla al
  bundle. En Vercel, ambas variables se marcan como *sensitive*.
- **Sin secretos en la bitácora.** En `metadata` del audit solo van
  `stripeEventId`, `stripeSessionId` y `source`. Nunca el payload del evento, ni
  datos de tarjeta, ni la dirección del cliente.
- **`/checkout` y `/checkout/success` son dinámicas.** Llevan `auth.protect()`,
  así que no se prerenderizan; `success` además depende de `searchParams`. Sin
  `loading.tsx` en el segmento, para que el `307` a `/sign-in` llegue antes del
  primer flush (mismo motivo que en `/account`, spec 006).
- **Rollback.** Revertir es borrar los archivos nuevos y volver a poner el botón
  `disabled` del drawer. Las dos tablas pueden quedarse: nada más las
  referencia. Si hubiera pagos reales, la migración inversa no debe ejecutarse.
- **El endpoint de producción no está registrado.** `stripe listen` cubre el
  desarrollo; antes de desplegar hay que dar de alta la URL en el Dashboard con
  los cuatro eventos de §6 y poner su `whsec_…` en el entorno de producción.

## 11. Fuera de alcance / deuda aceptada

| Diferido | Cuándo retomarlo |
|---|---|
| `/admin/orders` con permisos `orders.read` y `orders.update_status` | Inmediatamente después de este spec: hoy un pedido pagado no se puede consultar desde la aplicación |
| `/orders` y `/orders/[id]` del cliente | Junto con lo anterior; la sección «Mis pedidos» de `/account` ya tiene su hueco vacío (spec 006) |
| Correo de confirmación | Cuando exista proveedor de correo. El punto de enganche es el servicio de fulfillment |
| Reserva de stock y liberación por expiración | Cuando la sobreventa aparezca de verdad en `audit_logs` (D-11) |
| Reembolsos y cancelación desde la app | Con el panel de pedidos; hoy se hacen desde el Dashboard de Stripe |
| Normalizar `shipping_address` en columnas | Cuando alguien consulte por dirección (etiquetas de envío, filtros por ciudad) |
| Stripe Tax / IGV | Solo con una *tax registration* activa: sin ella `automatic_tax` aparenta cobrar impuesto y no cobra nada |
| Checkout embebido y Payment Element | Si el salto a `checkout.stripe.com` se demuestra costoso en conversión. Exige clave publicable y CSP con `*.stripe.com` |
| Carrito persistido en servidor (`carts` / `cart_items`) | Cuando el carrito deba sobrevivir al cambio de dispositivo |

---

## 12. Cierre de la revisión — iteración 2 (2026-09-07)

Veredicto del `reviewer`: **APROBADO**. Re-revisión completa desde el paso 1, no
solo de los cinco hallazgos corregidos.

Verificación mecánica ejecutada por el reviewer: `npm run typecheck` ✓ (exit 0) ·
`npm run lint` ✓ (0 errores; 6 warnings `react-hooks/incompatible-library` en
`products-table.tsx:149` y `users-table.tsx:130`, preexistentes y ajenos a este
spec) · `npm run build` ✓ (exit 0; `/checkout`, `/checkout/success`,
`/api/checkout` y `/api/webhooks/stripe` figuran como dinámicas `ƒ`).

Correcciones comprobadas contra el código, no contra el informe:

| Hallazgo | Evidencia |
|---|---|
| M-1 | `checkout.service.ts:3` importa `APP_URL`; se usa en las líneas 156 y 157. Cero accesos a `process.env.NEXT_PUBLIC_APP_URL` en el archivo. `src/lib/constants.ts:3` aporta el fallback `http://localhost:3000` |
| M-2 | `api-guard.ts:114` traduce cualquier `ForbiddenError` a 403 leyendo solo `.message`: `permission: null` no lo afecta. Ningún archivo del repo lee `ForbiddenError.permission`; los tres `new ForbiddenError(<código>, …)` de `user-access.service.ts` (39, 144, 199) siguen compilando y comportándose igual. `api/checkout/route.ts:20` llama a `requireActiveUser()` y no queda ningún `requireAuth()` residual en el handler |
| m-1 | `checkout/success/page.tsx:44` monta `<ClearCartOnSuccess />` bajo `order.status === 'paid'`. Es el único punto de montaje del componente en todo el repo |
| m-2 | `order-status-poller.tsx:33-36` fija `exhausted` al agotar los 10 intentos y las líneas 46-62 renderizan el aviso con el botón «Volver a comprobar». Sin estado terminal mudo |
| m-3 | `order.repository.ts:117-129` conserva el `UPDATE … WHERE id = $1 AND status = 'pending' RETURNING` de D-5 en un solo sitio; `markPaid`, `markPaymentFailed` y `markCanceled` pasan por él. Dejar `fulfillCheckoutSession` fuera de `settleFromPending()` es correcto: hace tres cosas más (releer las líneas, descontar stock, auditar la sobreventa) y unificarlo exigiría un callback post-mutación que costaría más que las cuatro líneas compartidas |

Criterios de aceptación trazados en código: AC2, AC3, AC4, AC5, AC6, AC7, AC8,
AC11, AC13 y AC14.

**Pendientes de verificación manual del usuario** (no se marcan por no ser
comprobables sin teclear en `checkout.stripe.com` con un navegador real): **AC1**,
**AC9**, **AC10** y **AC12**. Toda la lógica de servidor que hay debajo sí está
verificada (§9, registro de T27/T28).

Anotaciones MENOR registradas, sin bloqueo y sin corrección exigida:

- `src/modules/orders/schemas/checkout.schema.ts:30` — `CheckoutLineInput` se
  exporta sin ningún consumidor.
- `src/lib/permissions.ts:236` — `ForbiddenError.permission` se escribe y nunca se
  lee en todo el repo. Precede a este spec; si sigue sin lector cuando se toque de
  nuevo la clase, el campo sobra.
