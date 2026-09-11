---
id: 008
title: Mis compras — historial agrupado por fecha, filtro y boleta de Stripe
status: done
module: orders
scope: client
created: 2026-09-09
---

# 008 — Mis compras: historial agrupado por fecha, filtro y boleta de Stripe

## 1. Contexto

El spec 007 dejó pedidos reales en la base: `POST /api/checkout` crea la orden y
sus líneas, y el webhook de Stripe la pasa a `paid`, descuenta stock y audita.
Pero **el cliente no tiene dónde verlos**. La única vista que existe es
`/checkout/success?session_id=…`, alcanzable solo con el `session_id` de la
compra recién hecha: al cerrar esa pestaña, el pedido desaparece de la
aplicación.

`/account` (spec 006) ya reserva el hueco. `src/modules/account/constants.ts`
define la sección `{ id: 'compras', label: 'Mis compras' }`, el rail lateral
enlaza a `#compras` y `src/app/(storefront)/account/page.tsx:71-83` renderiza ahí
un `<AccountEmpty>` con el copy «Aún no tienes ninguna compra». Este spec
sustituye ese placeholder por el historial real.

Lo que ya está construido y **no se reinventa**: `orders` y `order_items`
(migración `0004`), `src/server/repositories/order.repository.ts`,
`src/lib/stripe.ts`, `src/modules/orders/types/order.types.ts` con `OrderSummary`
y `src/modules/orders/components/order-confirmation.tsx`.

## 2. Objetivo

Un cliente con sesión puede abrir `/account#compras`, ver sus pedidos agrupados
por día —por defecto los del mes en curso, o los de un rango de fechas que él
elige—, abrir el detalle de cualquiera en un diálogo y, si el pedido está pagado,
saltar desde ahí a la boleta que emitió Stripe.

## 3. Alcance

### Incluye

- Lectura del historial propio: cabecera de `orders` + líneas de `order_items`,
  filtrado por rango de fechas y ordenado de más reciente a más antiguo.
- Agrupación por **día**, con un encabezado por grupo que lee la fecha completa
  (día, mes y año) y el número de pedidos de ese día.
- Filtro con dos modos: **mes actual** (por defecto, sin tocar nada) y **rango de
  fechas** con dos campos de fecha nativos.
- `GET /api/orders` — historial del usuario de la sesión, validado con Zod.
- `GET /api/orders/[id]/receipt` — resuelve contra Stripe la URL de la boleta del
  pedido, verificando propiedad.
- Diálogo de detalle (shadcn `Dialog`): número de pedido, fecha y hora, estado,
  líneas con su precio congelado, subtotal, envío, total y acceso a la boleta.
- Extracción del listado de líneas de `OrderConfirmation` a un componente
  presentacional compartido con el diálogo (D-11).
- Estados de carga, vacío y error en la sección, con reintento.

### No incluye (explícito)

- **Rutas `/orders` y `/orders/[id]`.** Siguen reservadas en `docs/SETUP.md` §3 y
  diferidas desde el spec 007. El pedido es explícito: la sección vive dentro de
  `/account`. Sin enlace permanente y sin URL compartible por pedido.
- **`/admin/orders`.** El panel de pedidos y los permisos `orders.read` /
  `orders.update_status` siguen pendientes; este spec no crea ningún endpoint
  bajo `/api/admin/`.
- **Cambios de esquema.** Ni tabla nueva, ni columna nueva, ni migración. §5.
- **Cambios en el checkout.** `src/server/services/checkout.service.ts`,
  `order-fulfillment.service.ts` y ambos Route Handlers de pago se quedan como
  están. En concreto, **no** se activa `invoice_creation` en la Checkout Session
  (D-8).
- **Descarga directa del PDF desde nuestra UI.** Se abre la boleta alojada de
  Stripe, que es donde el cliente descarga el PDF (D-8).
- **Paginación e infinite scroll.** El rango de fechas es el que acota; hay un
  tope duro con aviso (D-5).
- **Filtro por estado, buscador por producto y exportación a CSV.**
- **Reembolso, cancelación, repetir compra y seguimiento de envío.**
- **Favoritos.** La otra sección vacía de `/account` no se toca.
- **Cambios en `src/proxy.ts`, `src/lib/permissions.ts` y `next.config.ts`.**
- **Notificaciones por correo.**

## 4. Criterios de aceptación

- [x] **AC1** — Dado un visitante sin sesión, cuando llama a `GET /api/orders`,
      entonces recibe `401` con `{ message }` (nunca un `307` a HTML) y, cuando
      abre `/account`, sigue recibiendo el `307` a `/sign-in` que ya da la página.
- [x] **AC2** — Dado un cliente con sesión y sin ningún pedido en el rango,
      cuando abre `/account#compras`, entonces ve el estado vacío con su CTA al
      catálogo y **no** una lista vacía ni un esqueleto perpetuo.
- [x] **AC3** — Dado un cliente con pedidos, cuando abre `/account#compras` sin
      tocar el filtro, entonces la lista contiene exactamente los pedidos cuya
      `created_at` cae dentro del mes calendario en curso.
- [x] **AC4** — Dados dos pedidos del mismo día, cuando se pinta la lista,
      entonces aparecen bajo un **único** encabezado con la fecha completa (día,
      mes y año); los grupos van de más reciente a más antiguo y los pedidos
      dentro de cada grupo también.
- [x] **AC5** — Dado el modo «Rango de fechas» con `desde` y `hasta` elegidos,
      cuando se aplica, entonces la lista solo contiene pedidos dentro del rango,
      **ambos días incluidos** (un pedido de las 23:50 del día `hasta` aparece).
- [x] **AC6** — Dado un rango con `desde` posterior a `hasta`, cuando se aplica,
      entonces la UI lo señala en línea y no dispara la consulta; y si aun así
      llega a la API, `GET /api/orders` responde `400` con `{ message, issues }`.
- [x] **AC7** — Dado el pedido de otro usuario, cuando se llama a
      `GET /api/orders`, entonces no aparece en la respuesta; y cuando se llama a
      `GET /api/orders/{id}/receipt` con ese id, entonces responde `404` (no
      `403`: no se confirma que el pedido exista).
- [x] **AC8** — Dada la respuesta de `GET /api/orders`, cuando se inspecciona,
      entonces **no** contiene `userId`, `stripeCheckoutSessionId`,
      `stripePaymentIntentId`, `shippingAddress` ni `updatedAt`.
- [x] **AC9** — Dado un pedido de la lista, cuando se pulsa «Ver detalle»,
      entonces el diálogo muestra sus líneas, cantidades, precios congelados,
      subtotal, envío y total **sin lanzar ninguna petición adicional** para
      obtenerlos.
- [x] **AC10** — Dado un pedido `paid`, cuando se abre su diálogo, entonces se
      resuelve la boleta y el acceso a ella es un `<a href>` real con
      `target="_blank"` y `rel="noopener noreferrer"`; en todo el diff no existe
      ninguna llamada a `window.open()` dentro de un callback asíncrono.
- [x] **AC11** — Dado un pedido `pending`, `payment_failed` o `canceled`, cuando
      se abre su diálogo, entonces no hay acceso a boleta y en su lugar se
      explica por qué (Stripe solo la emite con el cobro confirmado).
- [x] **AC12** — Dado Stripe respondiendo con error, cuando se abre el diálogo de
      un pedido pagado, entonces la API devuelve `502` con `{ message }`, el
      diálogo muestra ese mensaje con un botón de reintento y **la lista sigue
      pintada** detrás.
- [x] **AC13** — Dado un usuario con `is_active = false` y sesión de Clerk viva,
      cuando llama a cualquiera de los dos endpoints, entonces recibe `403` con
      `{ message }`.
- [x] **AC14** — Dada una orden sin `stripe_checkout_session_id` (el intento que
      nunca llegó a Stripe, spec 007 §10), cuando se lee el historial, entonces
      esa orden **no** aparece.
- [x] **AC15** — Dada la sección, cuando la consulta está en vuelo por primera
      vez muestra esqueleto, cuando falla muestra el mensaje del error con
      «Reintentar», y cuando se cambia el filtro la lista anterior no se vacía de
      golpe (`keepPreviousData`).
- [ ] **AC16** — Dada `/account#compras` a 390 px de ancho, cuando se navega,
      entonces no hay scroll horizontal en el `body`, el diálogo scrollea dentro
      de sí mismo y todo objetivo táctil mide ≥ 44 px de alto.
- [x] **AC17** — Dado el proyecto completo, cuando se ejecuta
      `npm run typecheck && npm run lint && npm run build`, entonces los tres
      pasan y `/api/orders` y `/api/orders/[id]/receipt` figuran como rutas
      dinámicas `ƒ` en la salida del build.
- [x] **AC18** — Dado el diff completo, cuando se revisa, entonces
      `src/proxy.ts`, `src/lib/permissions.ts`, `next.config.ts`,
      `src/server/db/schema/**` y `drizzle/**` están sin tocar.

## 5. Modelo de datos

**Sin cambios de esquema.** No hay tabla nueva, columna nueva ni migración. Todo
lo que esta feature necesita lo dejó puesto el spec 007 (migración `0004`).

### Lo que se lee de `orders`

| Columna | Uso |
|---|---|
| `id` | clave del grupo, número de pedido (`formatOrderNumber`), parámetro del endpoint de boleta |
| `user_id` | **filtro de propiedad**, no viaja al cliente |
| `status` | badge y decisión de si hay boleta |
| `subtotal_cents`, `shipping_cents`, `amount_total_cents` | importes del diálogo |
| `created_at` | orden, filtro por rango y clave de agrupación por día |
| `stripe_checkout_session_id` | solo en el `WHERE`: `IS NOT NULL` descarta los intentos que nunca llegaron a Stripe (AC14). No viaja al cliente |
| `stripe_payment_intent_id` | solo en servidor: es la entrada a Stripe para resolver la boleta. **No viaja al cliente**; se colapsa en el booleano `receiptAvailable` (D-4) |

`currency`, `shipping_address` y `updated_at` no se leen.

### Lo que se lee de `order_items`

`id`, `order_id`, `name_snapshot`, `image_url_snapshot`, `price_cents_snapshot`,
`quantity`. Es la proyección `SUMMARY_ITEM_COLUMNS` que ya existe en el
repositorio, menos `product_id`, que aquí no hace falta y no se publica.

### Índices: ya existen y cubren exactamente esta consulta

- `orders_user_id_created_at_idx` sobre `(user_id, created_at DESC)` —
  `order.ts:58`. Es el índice de la consulta del historial: filtra por usuario,
  acota por rango y devuelve ya ordenado.
- `order_items_order_id_idx` sobre `(order_id)` — `order-item.ts:28`. Cubre la
  carga de líneas en lote.

**No se añade ningún índice.** Añadir uno por `status` o por `created_at` a solas
sería adivinar una consulta que este spec no hace.

### Agrupación por fecha

**No se agrupa en SQL.** No hay `date_trunc`, ni `GROUP BY`, ni una columna
derivada. El repositorio devuelve filas planas ordenadas por `created_at DESC` y
la agrupación por día la hace una función pura en el cliente (D-6).

```ts
// src/modules/orders/lib/group-orders-by-day.ts — firma propuesta
export type OrderDayGroup = {
  /** `YYYY-MM-DD` en la zona local del navegador. Clave de React, no texto visible. */
  key: string;
  /** Etiqueta con día, mes y año: «martes, 9 de septiembre de 2026». */
  label: string;
  orders: OrderHistoryEntry[];
};

export function groupOrdersByDay(entries: OrderHistoryEntry[]): OrderDayGroup[];
```

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/orders` | cliente con cuenta activa | `?from&to` (ISO-8601, opcionales) | `OrderHistoryResponse` | 400, 401, 403, 500 |
| GET | `/api/orders/[id]/receipt` | cliente con cuenta activa **y dueño del pedido** | — | `OrderReceiptResponse` | 400, 401, 403, 404, 409, 502, 500 |

Ninguno lleva código de permiso RBAC, por la misma razón que `POST /api/checkout`
(spec 007, D-12): ver las compras propias no es una capacidad administrativa, y
exigir un permiso obligaría a concedérselo al rol `customer`, vacío a propósito.
La autorización real es la propiedad de la fila. Ambos usan
`requireActiveUser()` y **nunca** `auth.protect()` (`docs/SETUP.md` §6).

### Entrada de `GET /api/orders`

```ts
// src/modules/orders/schemas/order-history.schema.ts
export const orderHistoryQuerySchema = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .refine((v) => !v.from || !v.to || new Date(v.from) <= new Date(v.to), {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['from'],
  });

export type OrderHistoryQueryParams = z.output<typeof orderHistoryQuerySchema>;
```

Sin `from` ni `to` la consulta devuelve todo el historial (acotado por el tope de
D-5). El cliente siempre manda ambos: el modo por defecto los calcula a partir
del mes en curso.

El `id` de la ruta de boleta se valida con `z.uuid()` antes de tocar la base: un
id malformado es `400`, no un `500` de Postgres.

### Salida

```ts
// src/modules/orders/types/order.types.ts — añadidos
// `createdAt` es string y no Date a propósito: JSON no transporta Date, y heredar
// el `Date` de `OrderSummary` haría que el tipo mintiera en el cliente.
export type OrderHistoryEntry = Omit<OrderSummary, 'createdAt'> & {
  createdAt: string;
  /** `status === 'paid'` y con payment intent. Evita publicar el id de Stripe (D-4). */
  receiptAvailable: boolean;
};

export type OrderHistoryResponse = {
  data: OrderHistoryEntry[];
  /** `truncated` avisa de que el tope de D-5 recortó el rango. */
  meta: { truncated: boolean };
};

export type OrderReceiptResponse = { url: string };
```

`OrderHistoryEntry.items` reutiliza `OrderLineSummary`, ya definido, **menos**
`productId`, que no se publica en este contrato.

### Mapa de errores de `GET /api/orders/[id]/receipt`

| Status | Cuándo | Origen |
|---|---|---|
| 400 | el `id` de la ruta no es un uuid | `badRequest()` |
| 401 | sin sesión o sin fila espejo | `UnauthorizedError` |
| 403 | cuenta desactivada | `requireActiveUser()` → `ForbiddenError` |
| 404 | el pedido no existe **o no es del usuario** | `NotFoundError` |
| 409 | el pedido no está `paid`, o Stripe aún no expone `receipt_url` | `ConflictError` |
| 502 | la API de Stripe falla o no responde | `UpstreamError` |
| 500 | cualquier otro fallo | fallback de `toErrorResponse()` |

Los siete salen del `toErrorResponse()` que ya existe, sin un solo `if` nuevo en
el handler.

### Cómo se obtiene la boleta en Stripe

Verificado con `stripe docs /receipts` y `stripe docs api charge` (2026-09-09):

- La boleta estándar de un pago es el campo **`receipt_url` del objeto `Charge`**.
  «To link to a receipt from your application, use the `receipt_url` attribute of
  the Charge object.»
- Se llega a ese `Charge` desde el PaymentIntent que ya guardamos:
  `latest_charge` es expandible («ID of the latest Charge object created by this
  PaymentIntent»).

```ts
const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId, {
  expand: ['latest_charge'],
});
const charge = intent.latest_charge;
const url = charge && typeof charge !== 'string' ? charge.receipt_url : null;
```

- `hosted_invoice_url` / `invoice_pdf` **no existen** en este flujo: pertenecen a
  un `Invoice`, y en `mode: 'payment'` solo se crea uno si la sesión se abre con
  `invoice_creation.enabled: true`, que la propia documentación marca como
  funcionalidad con precio aparte. El spec 007 no lo activó. Ver D-8.
- **Los enlaces a la boleta caducan a los 30 días** («links to receipts expire
  after 30 days»). De ahí que la URL se resuelva en cada apertura y no se
  persista nunca. Ver D-3.

## 7. Arquitectura y archivos afectados

- `src/server/db/schema/` — **sin cambios**.
- `src/server/repositories/order.repository.ts` — *(modificado)* añade
  `findManyByUser(userId, params, reader)` con el `WHERE` de propiedad, rango y
  `stripe_checkout_session_id IS NOT NULL`; un cargador de líneas **en lote**
  (`inArray`) junto al `loadItems` existente; y `findByIdForUser(orderId, userId,
  reader)` que devuelve la fila completa —incluido `stripePaymentIntentId`— para
  el servicio de boleta. No se toca ningún mutador.
- `src/server/services/order-receipt.service.ts` — *(nuevo)* `getReceiptUrl(user,
  orderId)`: propiedad → estado → llamada a Stripe. Lanza `NotFoundError`,
  `ConflictError` o `UpstreamError`. Es el único punto del módulo que habla con
  Stripe fuera del checkout.
- `src/app/api/orders/route.ts` — *(nuevo)* `GET`: `requireActiveUser()` → Zod
  sobre `searchParams` → repositorio → `OrderHistoryResponse`.
- `src/app/api/orders/[id]/receipt/route.ts` — *(nuevo)* `GET`:
  `requireActiveUser()` → `z.uuid()` sobre el param → servicio → `{ url }`.
- `src/modules/orders/types/order.types.ts` — *(modificado)* `OrderHistoryEntry`,
  `OrderHistoryResponse`, `OrderReceiptResponse`.
- `src/modules/orders/constants.ts` — *(modificado)* `MAX_ORDER_HISTORY`,
  `orderKeys`, mensajes de error de boleta y copy de estados sin boleta.
- `src/modules/orders/schemas/order-history.schema.ts` — *(nuevo)* §6.
- `src/modules/orders/lib/order-history-range.ts` — *(nuevo)* funciones puras
  `currentMonthRange()` y `dayRange(fromDay, toDay)` → `{ from, to }` en ISO.
- `src/modules/orders/lib/group-orders-by-day.ts` — *(nuevo)* §5.
- `src/modules/orders/services/order.service.ts` — *(nuevo)* `fetchOrderHistory`,
  `fetchOrderReceipt`. Único punto del módulo que llama a axios.
- `src/modules/orders/hooks/use-order-history.ts` — *(nuevo)*.
- `src/modules/orders/hooks/use-order-receipt.ts` — *(nuevo)*.
- `src/modules/orders/components/order-lines.tsx` — *(nuevo)* lista
  presentacional de `OrderLineSummary[]`, extraída de `OrderConfirmation`.
- `src/modules/orders/components/order-status-badge.tsx` — *(nuevo)*.
- `src/modules/orders/components/order-history-filter.tsx` — *(nuevo, cliente)*.
- `src/modules/orders/components/order-history-row.tsx` — *(nuevo, cliente)*.
- `src/modules/orders/components/order-detail-dialog.tsx` — *(nuevo, cliente)*.
- `src/modules/orders/components/order-receipt-link.tsx` — *(nuevo, cliente)*.
- `src/modules/orders/components/order-history.tsx` — *(nuevo, cliente)*
  orquestador: estado del filtro, hook, agrupación, estados de carga/error/vacío.
- `src/modules/orders/components/order-confirmation.tsx` — *(modificado)* pasa a
  componer `<OrderLines>`.
- `src/app/(storefront)/account/page.tsx` — *(modificado)* la sección `#compras`
  cambia su `<AccountEmpty>` por `<OrderHistory />`. Sigue siendo Server
  Component y conserva `auth.protect()`; `"use client"` entra un nivel más abajo
  (`docs/SETUP.md` §4, regla 7).
- `src/components/ui/` — **sin cambios**: `dialog`, `select`, `badge`, `button`,
  `skeleton` y `separator` ya están instalados. No hay `npx shadcn add`.
- `src/modules/orders/store/` — **no se crea**. El filtro es estado local de un
  componente, no estado global (D-9).

## 8. Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| D-1 | La sección vive dentro de `/account#compras`, en el hueco de la spec 006 | Rutas `/orders` y `/orders/[id]` | El requerimiento es explícito («en la vista profile, la sección mis compras»). Las rutas siguen reservadas en `docs/SETUP.md` §3 y se retoman cuando haga falta un enlace compartible por pedido |
| D-2 | `GET /api/orders` devuelve cada pedido **con sus líneas** | Lista de cabeceras + `GET /api/orders/[id]` al abrir el diálogo | El diálogo abre sin latencia ni estado de carga y desaparece un endpoint. Cuesta **una** consulta extra por página (no una por pedido), porque las líneas se cargan en lote con `inArray` |
| D-3 | La URL de la boleta se resuelve contra Stripe **en cada apertura** | Persistirla en una columna `receipt_url` al fulfillar | Stripe documenta que los enlaces a boleta caducan a los 30 días. Una columna guardaría un enlace que se pudre, y además exigiría migración —este spec no toca el esquema— |
| D-4 | El pedido viaja al cliente con `receiptAvailable: boolean`, no con `stripePaymentIntentId` | Publicar el id del PaymentIntent y decidir en el componente | El spec 007 ya fijó que los ids de Stripe no viajan al cliente. Un booleano derivado en servidor da la misma decisión de UI sin publicar nada |
| D-5 | Tope duro de `MAX_ORDER_HISTORY = 60` pedidos por consulta, con `meta.truncated` | Paginación con `page`/`pageSize`, o sin tope | El rango de fechas ya acota; la paginación sobre datos agrupados por día parte los grupos y complica la UI. El tope evita que un rango de años traiga la tabla entera. Se detecta pidiendo 61 filas: `truncated = rows.length > 60`. Sin él, recortar en silencio sería un bug de corrección |
| D-6 | La agrupación por día es una función pura en el cliente | `date_trunc('day', created_at AT TIME ZONE …)` y `GROUP BY` en SQL | Agrupar en SQL obliga a fijar una zona horaria en el servidor (UTC en Vercel), y un pedido de las 21:00 en Lima caería en el día siguiente. Agrupar en el navegador usa la zona del cliente, la misma con la que se pintan las horas. Además la regla dura es que las *consultas* vivan en el repositorio: agrupar para pintar es presentación |
| D-7 | El rango se calcula en el navegador y viaja como dos instantes ISO absolutos | Enviar `range=current-month` y resolverlo en el servidor | Mismo motivo que D-6, y deja el contrato de la API con una sola forma: dos fechas. El servidor no necesita saber qué es «el mes actual» |
| D-8 | Se enlaza la boleta alojada (`Charge.receipt_url`), abierta en pestaña nueva | Activar `invoice_creation.enabled` en la Checkout Session para obtener `invoice_pdf` | Tres razones: cambia el checkout ya cerrado (spec 007), Stripe lo factura aparte, y solo afectaría a compras **futuras** — los pedidos que ya existen se quedarían sin documento. Desde la boleta alojada el cliente descarga el PDF |
| D-9 | El estado del filtro es `useState` local en `OrderHistory` | Store de Zustand en `orders/store/` | `docs/SETUP.md` §4 regla 6 reserva Zustand para estado de UI **global**. Este filtro tiene un solo consumidor y muere al desmontar la sección; un store sería una abstracción sin segundo lector |
| D-10 | El acceso a la boleta es un `<a href>` que solo aparece con la URL ya resuelta; el `useQuery` se activa al abrir el diálogo | Un botón que hace `fetch` y luego `window.open(url)` | `window.open()` dentro de un callback asíncrono lo bloquea el navegador porque ya no hay gesto de usuario. Resolver antes y renderizar un enlace real evita el problema y además es navegable por teclado |
| D-11 | Se extrae `<OrderLines>` de `OrderConfirmation` y lo comparten los dos | Duplicar el marcado en el diálogo | Es exactamente la misma lista con la misma proyección. Dos vistas del mismo pedido divergiendo en silencio es peor que una abstracción con dos consumidores. Solo se extrae la lista: los totales del diálogo son compactos y distintos |
| D-12 | Campos de fecha nativos `<input type="date">` | `npx shadcn add calendar popover` (react-day-picker) | Dos fechas no justifican una dependencia nueva de calendario. El control nativo ya es accesible, localizado y táctil |
| D-13 | El pedido ajeno responde `404`, no `403` | `403` cuando la fila existe pero es de otro | Un `403` confirma que ese id existe. El filtro por `user_id` va **dentro del `WHERE`**, igual que en `findBySessionIdForUser`, así que ni siquiera se llega a leer la fila ajena |
| D-14 | El historial excluye órdenes con `stripe_checkout_session_id IS NULL` | Mostrarlas como «pendiente» | Son los intentos en los que la creación de la sesión de Stripe falló (spec 007 §10): el cliente nunca vio esa pantalla de pago. Mostrárselas sería inventarle un pedido que no hizo |
| D-15 | `createdAt` viaja como `string` ISO en un tipo propio, no como el `Date` de `OrderSummary` | Reutilizar `OrderSummary` tal cual sobre la API | JSON no transporta `Date`. Heredar el tipo haría que `order.createdAt.getTime()` compilara y explotara en ejecución. El repositorio serializa con `toISOString()` en la proyección |

## 9. Tareas

- [x] **T1** — Añadir `OrderHistoryEntry`, `OrderHistoryResponse` y
      `OrderReceiptResponse` de §6, con `createdAt: string` (D-15) · archivo:
      `src/modules/orders/types/order.types.ts` · verificación: `npm run typecheck`
- [x] **T2** — Añadir `MAX_ORDER_HISTORY`, `orderKeys` (`all` / `history` /
      `receipt`) y los mensajes de boleta no disponible, pedido inexistente y
      fallo de Stripe · archivo: `src/modules/orders/constants.ts` ·
      verificación: `npm run typecheck`
- [x] **T3** — Schema Zod `orderHistoryQuerySchema` con el `refine` de rango
      inválido, y `orderIdParamSchema` · archivo:
      `src/modules/orders/schemas/order-history.schema.ts` · verificación:
      `npm run typecheck`
- [x] **T4** — Cargador de líneas en lote (`inArray(orderItems.orderId, ids)` +
      agrupación en memoria) junto al `loadItems` existente · archivo:
      `src/server/repositories/order.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T5** — `findManyByUser(userId, { from, to }, reader)`: `WHERE` con
      propiedad, rango (`gte`/`lte`) y `isNotNull(stripeCheckoutSessionId)`,
      `ORDER BY created_at DESC, id DESC`, `LIMIT MAX_ORDER_HISTORY + 1`, y
      proyección a `OrderHistoryEntry` con `truncated` · archivo:
      `src/server/repositories/order.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T6** — `findByIdForUser(orderId, userId, reader)`: fila completa de
      `orders` con el filtro de propiedad en el `WHERE` (D-13) · archivo:
      `src/server/repositories/order.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T7** — Servicio `getReceiptUrl(user, orderId)`: propiedad → estado
      `paid` y payment intent presente → `paymentIntents.retrieve` con
      `expand: ['latest_charge']` → `receipt_url`. Lanza `NotFoundError`,
      `ConflictError` y `UpstreamError` según §6 · archivo:
      `src/server/services/order-receipt.service.ts` · verificación:
      `npm run typecheck`
- [x] **T8** — Route Handler `GET /api/orders`: `requireActiveUser()` → Zod sobre
      `Object.fromEntries(searchParams)` → repositorio → `OrderHistoryResponse`,
      con `toErrorResponse` · archivo: `src/app/api/orders/route.ts` ·
      verificación: `npm run typecheck`
- [x] **T9** — Route Handler `GET /api/orders/[id]/receipt`:
      `requireActiveUser()` → `z.uuid()` sobre el param → servicio → `{ url }` ·
      archivo: `src/app/api/orders/[id]/receipt/route.ts` · verificación:
      `npm run build`
- [x] **T10** — Services axios `fetchOrderHistory(params)` y
      `fetchOrderReceipt(orderId)` · archivo:
      `src/modules/orders/services/order.service.ts` · verificación:
      `npm run typecheck`
- [x] **T11** — Hook `useOrderHistory(params)` con `placeholderData:
      keepPreviousData` (AC15) · archivo:
      `src/modules/orders/hooks/use-order-history.ts` · verificación:
      `npm run lint`
- [x] **T12** — Hook `useOrderReceipt(orderId, enabled)`: `enabled` atado a la
      apertura del diálogo, `retry: false` y `staleTime` corto · archivo:
      `src/modules/orders/hooks/use-order-receipt.ts` · verificación:
      `npm run lint`
- [x] **T13** — Funciones puras `currentMonthRange()` y `dayRange(from, to)` que
      devuelven instantes ISO desde el inicio y el fin del día locales (AC5) ·
      archivo: `src/modules/orders/lib/order-history-range.ts` · verificación:
      `npm run typecheck`
- [x] **T14** — Función pura `groupOrdersByDay(entries)` con la etiqueta
      completa día/mes/año vía `Intl.DateTimeFormat('es-PE')` · archivo:
      `src/modules/orders/lib/group-orders-by-day.ts` · verificación:
      `npm run typecheck`
- [x] **T15** — Componente presentacional `<OrderLines items>` extraído del
      marcado actual de la confirmación · archivo:
      `src/modules/orders/components/order-lines.tsx` · verificación:
      `npm run lint`
- [x] **T16** — Refactor de `OrderConfirmation` para componer `<OrderLines>`, sin
      cambio visual · archivo:
      `src/modules/orders/components/order-confirmation.tsx` · verificación:
      `npm run build` y `/checkout/success` sin regresión visual
- [x] **T17** — Componente `<OrderStatusBadge status>` reutilizando
      `ORDER_STATUS_LABELS` · archivo:
      `src/modules/orders/components/order-status-badge.tsx` · verificación:
      `npm run lint`
- [x] **T18** — Componente cliente `<OrderHistoryFilter>`: modo mes actual /
      rango, dos `<input type="date">`, validación en línea de AC6 · archivo:
      `src/modules/orders/components/order-history-filter.tsx` · verificación:
      `npm run lint`
- [x] **T19** — Componente cliente `<OrderReceiptLink orderId open>`: consume
      `useOrderReceipt`, muestra carga, error con reintento y el `<a>` de D-10 ·
      archivo: `src/modules/orders/components/order-receipt-link.tsx` ·
      verificación: `npm run lint`
- [x] **T20** — Componente cliente `<OrderDetailDialog order>`: `Dialog` de
      shadcn con título, descripción, estado, `<OrderLines>`, totales y
      `<OrderReceiptLink>` solo si `receiptAvailable`; si no, el copy de AC11 ·
      archivo: `src/modules/orders/components/order-detail-dialog.tsx` ·
      verificación: `npm run lint`
- [x] **T21** — Componente cliente `<OrderHistoryRow order>`: número, hora,
      resumen de líneas, total, badge y disparador del diálogo · archivo:
      `src/modules/orders/components/order-history-row.tsx` · verificación:
      `npm run lint`
- [x] **T22** — Componente cliente `<OrderHistory>`: estado del filtro (D-9),
      hook, agrupación, encabezado por día, esqueleto, error con reintento,
      estado vacío con `<AccountEmpty>` y aviso de `meta.truncated` · archivo:
      `src/modules/orders/components/order-history.tsx` · verificación:
      `npm run lint`
- [x] **T23** — Sustituir el `<AccountEmpty>` de la sección `#compras` por
      `<OrderHistory />`, sin tocar el resto de la página · archivo:
      `src/app/(storefront)/account/page.tsx` · verificación: `npm run build`
- [ ] **T24** — Prueba manual end-to-end: comprar con `4242 4242 4242 4242`,
      comprobar que el pedido aparece en `/account#compras` bajo el día de hoy,
      abrir el diálogo y llegar a la boleta de Stripe · verificación: manual, con
      la URL de `pay.stripe.com/receipts/…` registrada en este spec
- [ ] **T25** — Prueba manual de propiedad: con dos cuentas, pedir
      `/api/orders/{id de la otra}/receipt` y comprobar el `404` (AC7) ·
      verificación: manual
- [x] **T26** — Registrar «Mis compras» como módulo entregado y `/orders`,
      `/orders/[id]` como lo único que sigue pendiente del historial de cliente ·
      archivo: `docs/SETUP.md` (§6) · verificación: lectura
- [x] **T27** — Cierre: `npm run typecheck && npm run lint && npm run build` en
      verde y todos los AC marcados · verificación: los tres comandos

## 10. Riesgos y consideraciones

- **N+1 en las líneas.** Es el riesgo principal de D-2: un `loadItems` por pedido
  serían 60 consultas. Se ataca con un único `inArray(orderItems.orderId, ids)` y
  agrupación en memoria (T4). Un `leftJoin` con la cabecera repetida por línea es
  la otra opción, pero obliga a deduplicar la cabecera y multiplica los bytes que
  cruzan el pool serverless.
- **Rango sin límite superior.** Sin `from` ni `to` la consulta barre todo el
  historial del usuario. El `LIMIT` de D-5 es el freno; el índice
  `(user_id, created_at DESC)` hace que el motor pare al llegar a 61 filas.
- **Latencia de Stripe dentro del request.** `paymentIntents.retrieve` es una
  llamada de red. Solo ocurre al abrir el diálogo de un pedido pagado, nunca en
  la lista, y el `useQuery` cachea el resultado mientras la sección viva. La
  lista nunca se bloquea por Stripe (AC12).
- **Enlaces de boleta caducados.** Stripe los invalida a los 30 días. Como se
  resuelven en cada apertura, el cliente siempre recibe uno vigente. Si alguien
  copia el enlace y lo abre semanas después, Stripe le pedirá el correo de la
  compra: comportamiento del proveedor, no un fallo nuestro.
- **Zona horaria.** El rango y la agrupación se calculan en el navegador (D-6,
  D-7). Un cliente que consulte desde otro huso verá el mismo pedido bajo otro
  día. Es el comportamiento correcto para «mis compras» y el mismo criterio con
  el que se pinta la hora.
- **Hidratación.** Toda la sección es cliente y se pinta tras el primer fetch, así
  que no hay HTML de servidor con fechas que pueda desalinearse con el cliente
  (el problema que ya arregló el commit `6f20f2a` para `reduced-motion`).
- **Fuga de datos.** La proyección del repositorio es explícita y positiva: se
  enumera lo que sale, no lo que se oculta. Un `select()` sin argumentos
  publicaría `user_id`, los ids de Stripe y `shipping_address` (AC8).
- **Enumeración de pedidos ajenos.** `findByIdForUser` filtra por `user_id` en el
  `WHERE`, no después de leer. Un `404` uniforme (D-13) impide distinguir «no
  existe» de «no es tuyo».
- **Moneda.** `formatPrice` fija `PEN` y `orders.currency` no se lee. Es
  coherente con `ORDER_CURRENCY` (una sola moneda viva, spec 007 D-20), pero si
  algún día hay pedidos históricos en otra moneda, esta vista los pintaría mal.
- **Regresión en `/checkout/success`.** T16 toca un archivo del spec 007. Es una
  extracción sin cambio de marcado, cubierta por `npm run build` y por una
  comprobación visual explícita en la tarea.
- **`meta.truncated` sin lector es deuda muerta.** Si T22 no pinta el aviso, el
  campo sobra: o se muestra o se quita del contrato.

## 11. Fuera de alcance / deuda aceptada

| Diferido | Cuándo retomarlo |
|---|---|
| Rutas `/orders` y `/orders/[id]` con enlace permanente por pedido | Cuando haga falta compartir o marcar un pedido, o cuando el historial no quepa en una sección de `/account` |
| Paginación real del historial | Cuando `meta.truncated` aparezca de verdad para algún cliente |
| Descarga directa del PDF vía `invoice_creation.enabled` | Cuando el negocio necesite comprobante fiscal y acepte el coste por factura de Stripe. Solo aplicaría a compras posteriores al cambio |
| Filtro por estado y buscador por producto dentro del historial | Cuando el filtro por fecha se quede corto |
| Exportar el historial a CSV | A petición |
| Reembolso, cancelación, repetir compra y seguimiento de envío | Con el panel `/admin/orders`; hoy los reembolsos se hacen desde el Dashboard de Stripe |
| `/admin/orders` con `orders.read` y `orders.update_status` | Sigue siendo lo más urgente pendiente del spec 007: un administrador aún no puede ver ningún pedido |
| Correo con la boleta adjunta | Cuando exista proveedor de correo. Stripe ya puede enviarla desde el Dashboard |
| Sección «Mis favoritos» | Su propio spec; este no la toca |
