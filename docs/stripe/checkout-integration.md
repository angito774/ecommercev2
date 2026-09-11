# Integración con Stripe Checkout

> Documento de preparación técnica, no un spec. Cubre la decisión de arquitectura
> (¿sincronizar el catálogo con Stripe?) y la guía paso a paso para integrar
> **Stripe Checkout** (modo `payment`, hosted page) sobre el e-commerce actual.
> Antes de escribir código, esta feature entra igual que cualquier otra por la
> regla de entrada de [CLAUDE.md](../../CLAUDE.md) §1: `orchestrator` → `spec`
> (con aprobación humana del `docs/specs/NNN-....md` resultante) → `developer` ⇄
> `reviewer`. Lo que sigue es el material de referencia que ese `spec` debe
> consumir, no un sustituto suyo.

Fuentes: skill `stripe-best-practices` (best practices y routing de API) y
`stripe-docs` (referencia de API vigente, versión `2026-07-29.dahlia`) del
plugin de Stripe instalado en este proyecto.

---

## 1. Decisión: ¿sincronizar el catálogo de productos con Stripe?

**No.** Para arrancar con Checkout no hace falta espejar `products` como
`Product`/`Price` de Stripe. Se usan **precios inline** (`price_data`) en cada
`Checkout Session`, calculados en el momento a partir de `products.price_cents`.

### Por qué no sincronizar

1. **Los precios de Stripe son inmutables.** Un objeto `Price` no se edita:
   cambiar el precio de un producto en el admin (`PATCH /api/admin/products/:id`)
   obligaría a archivar el `Price` viejo y crear uno nuevo en Stripe, y a guardar
   ese `price_id` vigente en algún lado de nuestra tabla. Es un segundo sistema
   de verdad para un dato que ya vive en Postgres.
2. **Nuestra base de datos ya es la fuente de verdad del catálogo.** `stock`,
   `is_active`, `compare_at_price_cents`, `specs` no tienen equivalente 1:1 en
   Stripe. Sincronizar solo el precio y el nombre deja el resto divergiendo, y
   sincronizar todo es mantener un catálogo duplicado sin necesidad real.
3. **La API lo soporta de forma nativa y vigente.** `checkout.sessions.create`
   acepta `line_items[].price_data` con `product_data.name`,
   `product_data.description`, `product_data.images` y `unit_amount` definidos
   en el momento de crear la sesión — no es un modo legado, es la ruta
   documentada hoy para ítems que no tienen un catálogo pre-creado en Stripe
   (ver `stripe docs /payments/checkout/migrating-prices`).
4. **El precio congelado ya vive donde debe vivir.** `docs/SETUP.md` §5.3 ya
   planea `order_items` con "detalle con precio congelado" — ese snapshot es
   nuestro, no el de Stripe. La sesión de Checkout se calcula con el precio de
   Postgres en el instante de la compra y ese mismo valor es el que se guarda en
   `order_items`.
5. **No estamos usando suscripciones.** El caso donde sí conviene un catálogo de
   `Product`/`Price` real en Stripe es Billing recurrente, donde el objeto
   `Price` define el ciclo de facturación y Stripe necesita referenciarlo en
   cada renovación automática. No es nuestro caso hoy.

### Cuándo reconsiderar esto

- Si se agregan **suscripciones** (planes de servicio técnico, por ejemplo):
  ahí sí se necesita un `Price` real por plan, sincronizado explícitamente
  (creación editorial, no por cada producto del catálogo).
- Si se necesita mostrar el catálogo dentro del propio Dashboard de Stripe
  (reportes de producto más vendido a nivel de Stripe, Stripe Tax por código de
  producto) — hoy Recharts en `/admin` ya cubre esa necesidad desde nuestra BD.
- Si se integra Stripe Tax con `automatic_tax`, cada producto puede necesitar un
  `tax_code` — eso se puede pasar también inline en `price_data.tax_behavior` /
  `product_data.tax_code` sin crear un `Product` de Stripe permanente.

**Consecuencia práctica:** no se agregan columnas `stripe_product_id` /
`stripe_price_id` a `products`. Sí se agregan referencias a Stripe en `orders`
(`stripe_checkout_session_id`, `stripe_payment_intent_id`), porque eso identifica
la *transacción*, no el catálogo.

---

## 2. Alcance de esta primera integración

- **API:** Checkout Sessions, modo `payment` (pago único). Nada de
  `PaymentIntents` a mano ni Payment Element todavía — ver
  `references/payments.md` del skill: Checkout es la opción recomendada para la
  mayoría de integraciones web y resuelve descuentos, envío e impuestos sin
  UI propia.
- **Superficie:** Checkout **alojado por Stripe** (`ui_mode: 'hosted_page'`, el
  default). El usuario sale del sitio a `checkout.stripe.com` y vuelve a
  `success_url` / `cancel_url`. No se carga Stripe.js en el navegador todavía.
- **Fuera de alcance ahora:** suscripciones, Payment Element embebido, Stripe
  Tax, Stripe Connect, guardar tarjetas (Setup Intents). Se listan al final como
  siguientes pasos.
- **Métodos de pago:** nunca se fija `payment_method_types` en el request (regla
  dura del skill `stripe-best-practices`). Se omite el parámetro para que Stripe
  aplique *dynamic payment methods* y lo que se acepta se administra desde el
  Dashboard, no desde el código.

---

## 3. Prerrequisitos

1. **Cuenta de Stripe** en modo test. Si no existe: `stripe login` con el CLI ya
   instalado por el plugin, o `stripe sandbox create` para generar claves de
   prueba sin registro.
2. **Clave de API restringida (RAK)**, no la secret key completa. Crear en
   *Developers → API keys → Create restricted key* con permisos mínimos:
   `Checkout Sessions` (write), `Webhook Endpoints` (read), y nada más para
   arrancar. Prefijo `rk_test_...`. La skill de seguridad de Stripe marca esto
   como default, no como opcional.
3. **SDK oficial:**
   ```bash
   npm i stripe
   ```
4. **Stripe CLI** para probar webhooks en local (ya viene con el plugin
   instalado en este proyecto; si hace falta en otra máquina: `npm i -g
   @stripe/cli` o el instalador nativo).

---

## 4. Variables de entorno

Añadir a `.env.example` (vacías) y a `.env.local` (con valores reales, nunca
commiteado — regla ya vigente en este repo):

```bash
# Stripe
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SIGNING_SECRET=""
```

Notas:

- `STRIPE_SECRET_KEY` es la RAK (`rk_test_...` en desarrollo, `rk_live_...` en
  producción). Se guarda como variable de entorno de servidor — nunca
  `NEXT_PUBLIC_*`, porque en modo Checkout alojado el navegador jamás la
  necesita.
- `STRIPE_WEBHOOK_SIGNING_SECRET` sigue el mismo patrón que
  `CLERK_WEBHOOK_SIGNING_SECRET`, ya presente en este proyecto: en local sale de
  `stripe listen`, en producción del endpoint registrado en el Dashboard.
- No se necesita `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` para Checkout alojado
  (no se instancia Stripe.js en cliente). Se añadiría solo si más adelante se
  pasa a `ui_mode: 'embedded_page'` o a Payment Element.
- En Vercel, marcar `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SIGNING_SECRET` como
  *sensitive environment variable* (write-only, no se expone en logs ni UI).

---

## 5. Modelo de datos: `orders` y `order_items`

`docs/SETUP.md` §5.3 ya reserva estas tablas; hoy `src/modules/orders/` solo
tiene los `.gitkeep`. Esto es lo que el `spec` de la feature debe formalizar
(nombres y tipos exactos a confirmar en ese documento, esto es la propuesta de
partida):

### `orders`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | fk `users.id` | quién compra |
| `status` | enum | `pending` \| `paid` \| `payment_failed` \| `canceled` |
| `amount_total_cents` | integer | snapshot del total cobrado, céntimos |
| `currency` | varchar(3) | `pen` / `usd` según se decida |
| `stripe_checkout_session_id` | varchar, **unique** | idempotencia del webhook |
| `stripe_payment_intent_id` | varchar nullable | se llena al completarse el pago |
| `shipping_address` | jsonb nullable | si se activa `shipping_address_collection` |
| `created_at` / `updated_at` | timestamptz | |

Índice único en `stripe_checkout_session_id`: es la clave con la que el webhook
encuentra la orden y detecta reintentos sin volver a fulfillar.

### `order_items`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | fk `orders.id` | |
| `product_id` | fk `products.id` | `restrict`, igual que `products.category_id` |
| `name_snapshot` | varchar | copia de `products.name` al momento de comprar |
| `price_cents_snapshot` | integer | copia de `products.price_cents`, **el precio congelado** |
| `quantity` | integer | |

El "precio congelado" de docs/SETUP.md §5.3 es exactamente
`price_cents_snapshot`: nunca se relee `products.price_cents` para mostrar un
pedido pasado, porque el producto pudo cambiar de precio después.

Migraciones: `npm run db:generate` tras escribir
`src/server/db/schema/order.ts` y `order-item.ts` (un archivo por tabla, barrel
en `schema/index.ts`, igual que el resto), luego `npm run db:migrate`.

---

## 6. Dónde vive cada pieza (arquitectura de este repo)

Seguir `docs/SETUP.md` §3 y §4 al pie de la letra — nada de lógica de Stripe en
un componente ni un `fetch` directo desde el cliente:

```
src/
├── lib/
│   └── stripe.ts                 cliente Stripe único, solo servidor
├── server/
│   ├── db/schema/order.ts
│   ├── db/schema/order-item.ts
│   └── repositories/order.repository.ts
├── modules/
│   ├── cart/                     ya existe: Zustand + localStorage (carrito local)
│   └── orders/
│       ├── schemas/checkout.schema.ts   Zod: input de POST /api/checkout
│       ├── services/checkout.service.ts axios: POST /api/checkout
│       ├── hooks/useCreateCheckout.ts   TanStack Query mutation
│       └── types/order.types.ts
└── app/
    ├── api/
    │   ├── checkout/route.ts             crea la orden + la Checkout Session
    │   ├── webhooks/stripe/route.ts       fulfillment
    │   └── admin/orders/route.ts          listado admin (fuera de alcance hoy)
    └── (storefront)/
        ├── checkout/page.tsx              botón "Pagar" → useCreateCheckout()
        └── checkout/success/page.tsx      lee ?session_id=, muestra confirmación
```

### `src/lib/stripe.ts`

```ts
import 'server-only';
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
```

`import 'server-only'` para que un import accidental desde un componente
cliente rompa el build en vez de filtrar la clave al bundle del navegador. Se
instancia el cliente una sola vez y se llama sobre esa instancia — nunca el
patrón global deprecado (`Stripe.setApiKey`, etc.), como marca la skill de
buenas prácticas.

---

## 7. Flujo end-to-end

```
Cliente (carrito Zustand)
   │  "Pagar"
   ▼
useCreateCheckout() ──► checkout.service.ts ──► POST /api/checkout
                                                     │
                                          await auth() + requireAuth()
                                          Zod: valida líneas (productId, quantity)
                                          ┌─────────────────────────────────┐
                                          │ Transacción Drizzle:            │
                                          │  1. Releer precio/stock reales  │
                                          │     desde `products` (nunca el  │
                                          │     precio que manda el cliente)│
                                          │  2. Crear `orders` (pending)     │
                                          │  3. Crear `order_items`          │
                                          │     (price_cents_snapshot)       │
                                          └─────────────────────────────────┘
                                                     │
                                    stripe.checkout.sessions.create({
                                      mode: 'payment',
                                      line_items: [ price_data inline ... ],
                                      metadata: { orderId },
                                      success_url, cancel_url,
                                    })
                                                     │
                                  guarda stripe_checkout_session_id en la orden
                                                     │
                                          responde { url: session.url }
                                                     ▼
                                  cliente hace window.location = url
                                                     │
                                        checkout.stripe.com (hosted page)
                                                     │
                       ┌─────────────────────────────┴─────────────────────────────┐
                       ▼                                                           ▼
        Stripe → POST /api/webhooks/stripe                      redirect → /checkout/success?session_id=...
        checkout.session.completed /                             (solo lectura — NO dispara fulfillment,
        checkout.session.async_payment_succeeded                  el usuario puede no volver nunca)
                       │
        verifica firma, resuelve orden por
        stripe_checkout_session_id, fulfilla
        si no está fulfillada ya (idempotente)
```

### 7.1 `POST /api/checkout` — crear la sesión

Sigue el mismo esqueleto que `src/app/api/admin/products/route.ts` (usa
`authorize`/`requireAuth`, `parseJsonBody`, `db.transaction`, `toErrorResponse`
de `@/lib/api-guard`):

```ts
import { NextResponse } from 'next/server';

import { stripe } from '@/lib/stripe';
import { requireAuth } from '@/lib/auth';
import { parseJsonBody, toErrorResponse, badRequest } from '@/lib/api-guard';
import { checkoutSchema } from '@/modules/orders/schemas/checkout.schema';
import { db } from '@/server/db';
import * as productRepository from '@/server/repositories/product.repository';
import * as orderRepository from '@/server/repositories/order.repository';

export async function POST(request: Request) {
  try {
    // Checkout requiere sesión: `orders.user_id` no es nullable (§5.3).
    const user = await requireAuth();

    const body = await parseJsonBody(request, checkoutSchema, 'Carrito inválido');
    if (!body.ok) return body.response;

    const { order, lineItems } = await db.transaction(async (tx) => {
      // El precio SIEMPRE se relee de `products`. El carrito en localStorage es
      // una instantánea que envejece (comentario ya existente en cart.store.ts);
      // confiar en el precio que manda el cliente es un vector de manipulación.
      const products = await productRepository.findManyByIds(
        body.data.lines.map((l) => l.productId),
        tx,
      );

      // TODO: validar stock suficiente y producto activo, 400 nombrando el ítem
      // si falla — mismo patrón que categoryExists() en product.repository.ts.

      const order = await orderRepository.create(tx, {
        userId: user.id,
        status: 'pending',
        amountTotalCents: /* suma de priceCents * quantity */ 0,
        currency: 'pen',
      });

      const items = await orderRepository.createItems(tx, order.id, /* ... */ []);

      return { order, lineItems: items };
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: order.currency,
          unit_amount: item.priceCentsSnapshot,
          product_data: {
            name: item.nameSnapshot,
            images: item.imageUrl ? [item.imageUrl] : undefined,
          },
        },
      })),
      metadata: { orderId: order.id },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout`,
    });

    await orderRepository.attachStripeSession(db, order.id, session.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/checkout',
      fallback: 'No se pudo iniciar el pago',
    });
  }
}
```

Puntos que la revisión (`reviewer`) deberá exigir cuando esto se implemente de
verdad:

- El precio nunca sale del `body` del request, solo `productId` y `quantity`.
- `unit_amount` es siempre `price_cents_snapshot` recién calculado, no el que
  vino del cliente.
- Nunca se pasa `payment_method_types`.
- No hay `sk_...`/`rk_...` en el código: solo `process.env.STRIPE_SECRET_KEY`.

### 7.2 `POST /api/webhooks/stripe` — fulfillment

Este endpoint es el único lugar donde una orden pasa de `pending` a `paid`.
**Nunca** se fulfilla desde `/checkout/success` — Stripe y la skill de buenas
prácticas son explícitos: el cliente puede pagar con éxito y perder la conexión
antes de que la página de éxito cargue, así que cualquier lógica que dependa de
esa página pierde pedidos silenciosamente.

```ts
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { stripe } from '@/lib/stripe';
import { logAudit } from '@/lib/audit';
import { db } from '@/server/db';
import * as orderRepository from '@/server/repositories/order.repository';

export async function POST(request: Request) {
  const payload = await request.text(); // raw body: obligatorio para verificar la firma
  const signature = (await headers()).get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature!,
      process.env.STRIPE_WEBHOOK_SIGNING_SECRET!,
    );
  } catch {
    return NextResponse.json({ message: 'Firma inválida' }, { status: 400 });
  }

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object;
    if (session.payment_status !== 'unpaid') {
      await db.transaction(async (tx) => {
        const order = await orderRepository.findByStripeSessionId(session.id, tx);
        // Idempotencia: Stripe reintenta y puede llamar dos veces con el mismo
        // evento (o dos eventos distintos para la misma sesión). Si ya está
        // `paid`, no se vuelve a descontar stock ni a loguear otra vez.
        if (!order || order.status === 'paid') return;

        await orderRepository.markPaid(tx, order.id, session.payment_intent as string);
        // TODO: descontar stock de cada order_item (dentro de la misma tx).

        await logAudit(tx, {
          actorId: null, // acción del sistema — el actor es el webhook, no una persona
          action: 'order.paid',
          entityType: 'order',
          entityId: order.id,
          changes: { before: { status: 'pending' }, after: { status: 'paid' } },
          metadata: { source: 'stripe.webhook', stripeEventId: event.id },
        });
      });
    }
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    // TODO: marcar la orden como payment_failed y opcionalmente notificar.
  }

  return NextResponse.json({ received: true });
}
```

Notas obligatorias:

- `stripe.webhooks.constructEvent` verifica la firma **antes** de tocar
  cualquier dato — regla dura de la skill de seguridad de Stripe. Sin esto,
  cualquiera que adivine la URL puede marcar pedidos como pagados.
- El body se lee con `request.text()`, no `request.json()`: la verificación de
  firma necesita el string crudo, no el objeto ya parseado.
- Este Route Handler **no** lleva `authorize()` ni `requireAuth()` — quien
  llama es Stripe, no un usuario de Clerk. La autenticación aquí es la firma
  del webhook, no una sesión.
- Encaja con la regla dura de `audit_logs` (CLAUDE.md §4.11): el log se escribe
  en la misma transacción que la mutación de `orders`, y un fallo al escribirlo
  si la operación no es de seguridad no debe romper el fulfillment — para
  `order.paid` (no es un cambio de rol/permiso) el log puede degradarse a
  best-effort, a decidir en el `spec`.

### 7.3 Registrar el endpoint

- **Local:**
  ```bash
  stripe listen --forward-to localhost:3000/api/webhooks/stripe
  ```
  copiar el `whsec_...` que imprime a `STRIPE_WEBHOOK_SIGNING_SECRET` en
  `.env.local`.
- **Producción:** Dashboard → *Developers → Webhooks → Add endpoint*, URL
  `https://<dominio>/api/webhooks/stripe`, eventos:
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`. El *signing secret* que genera ahí
  es el que va en `.env` de producción (Vercel, como *sensitive env var*).

### 7.4 Página de éxito

`/checkout/success` **lee** el estado, no lo cambia:

```ts
const session = await stripe.checkout.sessions.retrieve(sessionId, {
  expand: ['line_items'],
});
if (session.status === 'open') redirect('/checkout');
// status === 'complete' → mostrar confirmación
```

Alternativa más alineada con la arquitectura de este repo: en vez de llamar a
Stripe desde la página, leer la orden ya actualizada por el webhook vía
`GET /api/orders/[id]` (repositorio propio). Evita una segunda dependencia de
red a Stripe desde una Server Component y es coherente con "un componente
nunca llama a Stripe/axios directo" — la page consulta el repositorio, el
repositorio consulta Postgres, que el webhook ya actualizó.

---

## 8. Permisos y superficie admin (para cuando se construya `/admin/orders`)

`docs/SETUP.md` ya lista `orders` como módulo admin pendiente. Seguir el mismo
patrón `<recurso>.<acción>` de `src/lib/permissions.ts`:

```ts
{ code: 'orders.read', resource: 'orders', action: 'read', ... }
{ code: 'orders.update_status', resource: 'orders', action: 'update_status', ... }
```

(`orders.update_status` ya aparece como ejemplo en CLAUDE.md §4.11.) El listado
admin de pedidos usa `requirePagePermission('orders.read')` en la page y
`authorize('orders.read')` en el Route Handler, igual que categorías y
productos hoy — nunca comparar `role === 'admin'`.

---

## 9. Probar en local

1. `npm run dev`
2. En otra terminal: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
3. Ir al carrito → checkout → se redirige a `checkout.stripe.com`.
4. Tarjeta de prueba: `4242 4242 4242 4242`, cualquier fecha futura, cualquier
   CVC, cualquier código postal.
5. Verificar en la terminal de `stripe listen` que llega
   `checkout.session.completed`, y en la BD que la orden pasó a `paid`.
6. Otras tarjetas de prueba (fallos, 3D Secure, etc.) están en la skill
   `stripe:test-cards` de este mismo plugin.

---

## 10. Checklist antes de dar por lista esta integración

- [ ] `orders` / `order_items` migradas (`npm run db:generate` + `db:migrate`)
- [ ] `STRIPE_SECRET_KEY` es una RAK (`rk_test_...`), no una secret key completa
- [ ] `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SIGNING_SECRET` en `.env.local`, y
      claves vacías reflejadas en `.env.example`
- [ ] `POST /api/checkout` relee precio y stock de `products`, nunca confía en
      el `body` del cliente
- [ ] Ningún request a Stripe incluye `payment_method_types`
- [ ] `POST /api/webhooks/stripe` verifica la firma antes de leer el evento
- [ ] El fulfillment es idempotente (`stripe_checkout_session_id` único +
      chequeo de `status` antes de mutar)
- [ ] Fulfillment vive solo en el webhook — `/checkout/success` únicamente lee
- [ ] `npm run typecheck && npm run lint && npm run build` en verde
- [ ] Webhook probado con `stripe listen` + tarjeta `4242...` de punta a punta

---

## 11. Siguientes pasos (fuera de esta primera entrega)

| Necesidad futura | Qué cambia |
|---|---|
| Suscripciones / planes recurrentes | Ahí sí crear `Product`/`Price` reales en Stripe por plan (no por SKU de catálogo), `mode: 'subscription'`, manejar además `invoice.paid`, `customer.subscription.updated/deleted` |
| Impuestos automáticos (IGV/IVA) | `automatic_tax: { enabled: true }` **solo** si hay una *tax registration* activa en Stripe para la jurisdicción — sin eso Stripe no cobra impuesto y el checkout aparenta tenerlo activado |
| Checkout embebido en el propio sitio | `ui_mode: 'embedded_page'`, requiere `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` y cargar Stripe.js — añadir CSP con `https://*.stripe.com` en `script-src`/`frame-src`/`connect-src` |
| Guardar tarjeta para compras futuras | Setup Intents, nunca la Sources API (deprecada) |
| Marketplace / pagos a proveedores | Stripe Connect — fuera de alcance de un e-commerce de tienda única |
