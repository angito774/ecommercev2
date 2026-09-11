---
id: 009
title: Tarjetas guardadas — alta con Stripe Checkout en modo setup, listado y baja
status: done
module: payments
scope: client
created: 2026-09-09
---

# 009 — Tarjetas guardadas: alta con Stripe Checkout en modo setup, listado y baja

## 1. Contexto

Hoy cada compra obliga a teclear la tarjeta entera en `checkout.stripe.com`: el
spec 007 crea la Checkout Session en `mode: 'payment'` con `customer_email`
(`src/server/services/checkout.service.ts:146`) y **no** crea ningún Stripe
Customer, así que Stripe no tiene dónde recordar el medio de pago y nuestra base
no guarda ninguna referencia a él.

`/account` (spec 006) ya es el sitio donde el cliente gestiona lo suyo: el rail
lateral y los anclas salen de `ACCOUNT_SECTIONS` (`src/modules/account/constants.ts`)
y hoy tiene tres entradas —perfil, favoritos y compras (spec 008)—. Falta la
cuarta: sus tarjetas.

El requerimiento pide guardarlas «de forma segura» con un enlace de Stripe, igual
que el pago, y persistir en Postgres la referencia de la tarjeta y los dígitos que
permitan identificarla. Este spec lo resuelve con Stripe Customer + Checkout
Session en `mode: 'setup'`: ningún dato de tarjeta pasa por nuestro backend, ni
por nuestro navegador, ni por nuestra base.

Lo que ya existe y **no se reinventa**: `src/lib/stripe.ts` (cliente único,
`server-only`), `POST /api/webhooks/stripe` con verificación de firma,
`requireActiveUser()`, `toErrorResponse()`, `logAudit()` y el patrón de módulo
cliente de `src/modules/orders/`.

## 2. Objetivo

Un cliente con sesión puede abrir `/account#tarjetas`, guardar una tarjeta a
través de una página alojada de Stripe sin que ningún dígito toque nuestro
servidor, ver las que tiene guardadas identificadas por marca y últimos cuatro
dígitos, y eliminar cualquiera de ellas.

## 3. Alcance

### Incluye

- Tabla `payment_methods` y columna `users.stripe_customer_id`, con su migración.
- Stripe Customer por usuario, creado **la primera vez** que guarda una tarjeta.
- `POST /api/payment-methods/setup` — crea la Checkout Session en `mode: 'setup'`
  y devuelve su URL.
- Persistencia de la tarjeta en el **webhook ya existente**, ramificando
  `checkout.session.completed` por `session.mode === 'setup'`. Sin registrar
  ningún evento nuevo en el Dashboard de Stripe.
- `GET /api/payment-methods` — tarjetas del usuario de la sesión.
- `DELETE /api/payment-methods/[id]` — `detach` en Stripe y borrado de la fila,
  con su entrada en `audit_logs`.
- Cuarta sección `#tarjetas` en `/account`, con el mismo patrón de ancla + rail de
  las otras tres: listado, alta, baja con confirmación, estados de carga, vacío y
  error.
- Normalización de `allow_redisplay` a `always` sobre el PaymentMethod guardado
  (D-8), para que la tarjeta sea reutilizable cuando exista el spec que la use.
- Aviso de tarjeta vencida en el listado, calculado en el navegador.

### No incluye (explícito)

- **Pagar con una tarjeta guardada.** `POST /api/checkout` y
  `src/server/services/checkout.service.ts` se quedan **exactamente** como están:
  ni `customer`, ni `payment_method`, ni `setup_future_usage`. Reutilizarlas en el
  checkout es su propio spec (D-9, §11).
- **Tarjeta predeterminada.** Sin columna `is_default` y sin UI de selección: sin
  un flujo que consuma la tarjeta, «predeterminada» no significa nada todavía.
- **Cobros off-session** (renovaciones, cargos por no presentarse, suscripciones).
- **Payment Element embebido, Stripe.js y clave publicable.** El alta es la misma
  página alojada que el pago (D-2), por las mismas razones del spec 007 D-2.
- **Portal de facturación de Stripe** (`billing_portal`) como alternativa a esta
  sección (D-10).
- **Medios de pago que no sean tarjeta.** Si Stripe devuelve otro tipo, el webhook
  lo ignora sin guardarlo (D-14).
- **Editar una tarjeta** (dirección de facturación, alias, caducidad). La única
  mutación del listado es eliminar.
- **Reconciliación periódica contra Stripe.** Sin job ni endpoint de sync (§11).
- **Actualización automática de tarjetas caducadas o reemitidas**
  (`payment_method.automatically_updated`). §11.
- **Cambios en `src/proxy.ts`, `src/lib/permissions.ts` y `next.config.ts`.** Esta
  feature no introduce ningún código de permiso RBAC (D-4).
- **Guardar los cuatro primeros dígitos de la tarjeta.** Razonado en D-3: Stripe
  no los expone en una petición estándar y la marca es lo que identifica a la
  empresa emisora.
- **Favoritos.** La otra sección vacía de `/account` sigue sin tocarse.

## 4. Criterios de aceptación

- [x] **AC1** — Dado un visitante sin sesión, cuando llama a cualquiera de los
      tres endpoints de `/api/payment-methods`, entonces recibe `401` con
      `{ message }` y nunca un `307` con el HTML del formulario de login.
- [ ] **AC2** — Dado un usuario con `is_active = false` y sesión de Clerk viva,
      cuando llama a cualquiera de los tres endpoints, entonces recibe `403` con
      `{ message }`.
- [ ] **AC3** — Dado un cliente sin tarjetas, cuando abre `/account#tarjetas`,
      entonces ve el estado vacío con el botón «Agregar tarjeta» y no una lista
      vacía ni un esqueleto perpetuo.
- [ ] **AC4** — Dado un cliente que pulsa «Agregar tarjeta», cuando responde
      `POST /api/payment-methods/setup`, entonces el navegador termina en una
      página de Stripe creada con `mode: 'setup'` y `currency: 'pen'`, y en todo
      el diff **no** existe ningún `<input>` que reciba un número de tarjeta.
- [ ] **AC5** — Dado un cliente que nunca guardó una tarjeta, cuando completa el
      alta, entonces `users.stripe_customer_id` queda con su `cus_…`; y cuando
      guarda una segunda tarjeta, entonces se reutiliza **el mismo** `cus_…` y no
      se crea un segundo Customer en Stripe.
- [ ] **AC6** — Dado el `checkout.session.completed` de una sesión `setup`, cuando
      el webhook lo procesa, entonces se inserta una fila en `payment_methods` con
      `stripe_payment_method_id`, `brand`, `last4`, `exp_month` y `exp_year`, se
      escribe `payment_method.saved` en `audit_logs`, y **ninguna** fila de
      `orders` cambia de estado.
- [ ] **AC7** — Dado el mismo evento entregado dos veces, cuando el webhook lo
      procesa, entonces `payment_methods` sigue con **una** fila para ese
      `pm_…`, `audit_logs` con **una** entrada, y la respuesta es `200`.
- [ ] **AC8** — Dada la respuesta de `GET /api/payment-methods`, cuando se
      inspecciona, entonces **no** contiene `stripePaymentMethodId`, `userId` ni
      ningún `cus_…`, y las tarjetas van de la más reciente a la más antigua.
- [ ] **AC9** — Dadas dos cuentas con tarjeta, cuando una llama a
      `GET /api/payment-methods`, entonces solo ve las suyas; y cuando llama a
      `DELETE /api/payment-methods/{id de la otra}`, entonces recibe `404` (no
      `403`: no se confirma que ese id exista) y la tarjeta ajena sigue en Stripe.
- [ ] **AC10** — Dado un `id` que no es un uuid en la ruta de baja, cuando llega,
      entonces la respuesta es `400` con `{ message, issues }` y no un `500` de
      Postgres.
- [ ] **AC11** — Dada una tarjeta propia, cuando se confirma su eliminación,
      entonces se hace `detach` en Stripe, desaparece la fila, se escribe
      `payment_method.deleted` en `audit_logs` con `actor_id` del propio usuario y
      la lista se refresca sin recargar la página.
- [ ] **AC12** — Dado un fallo de la API de Stripe durante el alta o la baja,
      cuando se responde, entonces el status es `502` con `{ message }`, la fila
      **no** se borra y la UI muestra ese mensaje con opción de reintento.
- [ ] **AC13** — Dado el retorno a `/account?card=added#tarjetas` antes de que
      llegue el webhook, cuando se renderiza la sección, entonces se muestra
      «Guardando tu tarjeta…», la lista se refresca sola cuando aparece, y al
      agotarse los intentos queda un aviso accionable en vez de un spinner mudo.
- [ ] **AC14** — Dada una tarjeta cuyo `exp_year`/`exp_month` ya pasaron, cuando
      se pinta el listado, entonces aparece marcada como vencida y sigue siendo
      eliminable.
- [ ] **AC15** — Dado un cliente con `MAX_SAVED_CARDS` tarjetas, cuando pide una
      nueva alta, entonces recibe `409` con un mensaje que explica el tope y no se
      crea ninguna Checkout Session.
- [x] **AC16** — Dado todo el diff, cuando se revisa, entonces en `audit_logs` no
      se escribe ningún dato de tarjeta (ni `brand`, ni `last4`, ni caducidad) y
      `src/lib/stripe.ts` solo se importa desde `src/server/**` y
      `src/app/api/**`.
- [x] **AC17** — Dado el diff completo, cuando se revisa, entonces
      `src/proxy.ts`, `src/lib/permissions.ts`, `next.config.ts` y
      `src/server/services/checkout.service.ts` están sin tocar.
- [x] **AC18** — Dado `npm run typecheck && npm run lint && npm run build`, cuando
      se ejecuta al cerrar el spec, entonces los tres pasan y las tres rutas de
      `/api/payment-methods` figuran como dinámicas `ƒ` en la salida del build.
- [ ] **AC19** — Dada `/account#tarjetas` a 390 px de ancho, cuando se navega,
      entonces no hay scroll horizontal en el `body` y todo objetivo táctil mide
      ≥ 44 px de alto.

## 5. Modelo de datos

**Requiere migración** (`npm run db:generate` + `npm run db:migrate`): una tabla
nueva y una columna nueva en `users`.

### `payment_methods`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `uuid` PK default random | el **único** id que viaja al cliente |
| `user_id` | `uuid` FK `users.id` `restrict` notNull | mismo criterio que `orders.user_id`: `syncUserDeleted` desactiva, no borra |
| `stripe_payment_method_id` | `varchar(255)` **unique** notNull | `pm_…`. El `unique` es la idempotencia del webhook (D-7, AC7) |
| `brand` | `varchar(32)` notNull | `display_brand ?? card.brand`, en minúscula (D-11) |
| `last4` | `varchar(4)` notNull | |
| `exp_month` | `integer` notNull | 1–12, tal cual lo da Stripe |
| `exp_year` | `integer` notNull | cuatro dígitos |
| `created_at` | `timestamptz` notNull default `now()` | orden del listado |

Índices: `unique(stripe_payment_method_id)` (lo genera `.unique()`) y
`payment_methods_user_id_created_at_idx` en `(user_id, created_at desc)`, que es
exactamente la consulta del listado.

**Sin `updated_at`.** La fila no se actualiza nunca: se inserta al guardar y se
borra al eliminar (D-12). Añadir la columna y su `$onUpdate` sería prometer una
mutación que no existe.

**Sin `stripe_customer_id`.** El requerimiento lo pedía en esta tabla, pero el
Customer es del usuario, no de la tarjeta: repetirlo en cada fila daría N copias
del mismo dato y, peor, dejaría sin sitio donde leerlo al usuario que **todavía
no tiene ninguna tarjeta** —justo el momento en que hay que decidir si crear un
Customer o reutilizarlo—. Vive en `users` (D-6).

```ts
// src/server/db/schema/payment-method.ts — firma propuesta
export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    stripePaymentMethodId: varchar('stripe_payment_method_id', { length: 255 })
      .notNull()
      .unique(),
    brand: varchar('brand', { length: 32 }).notNull(),
    last4: varchar('last4', { length: 4 }).notNull(),
    expMonth: integer('exp_month').notNull(),
    expYear: integer('exp_year').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payment_methods_user_id_created_at_idx').on(t.userId, t.createdAt.desc())],
);
```

### `users` — columna nueva

```ts
// src/server/db/schema/user.ts — añadido
stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).unique(),
```

Nullable: la inmensa mayoría de los usuarios nunca guardará una tarjeta y crear un
Customer en Stripe por cada alta de Clerk sería basura en el Dashboard. `unique`
para que dos filas no puedan apuntar al mismo `cus_…`. No entra en
`USER_TEXT_LENGTHS`: ese objeto existe porque el webhook de Clerk tiene que
recortar valores antes del INSERT, y este no viene de Clerk.

### Qué **no** se guarda

Ningún dígito de la tarjeta más allá de `last4`, ningún token de pago reutilizable
fuera del `pm_…`, ningún CVC, ninguna dirección de facturación. La marca y los
cuatro últimos dígitos son todo lo que hace falta para que el cliente reconozca la
tarjeta, y es lo que Stripe expone de forma estándar (D-3).

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| POST | `/api/payment-methods/setup` | cliente con cuenta activa | — | `{ url: string }` | 401, 403, 409, 502, 500 |
| GET | `/api/payment-methods` | cliente con cuenta activa | — | `SavedCardListResponse` | 401, 403, 500 |
| DELETE | `/api/payment-methods/[id]` | cliente con cuenta activa **y dueño de la tarjeta** | — | `{ id: string }` | 400, 401, 403, 404, 502, 500 |

Ninguno lleva código de permiso RBAC, por la misma razón que `POST /api/checkout`
(spec 007, D-12) y `GET /api/orders` (spec 008): gestionar los propios medios de
pago no es una capacidad administrativa, y exigir un permiso obligaría a
concedérselo al rol `customer`, vacío a propósito. La autorización real es la
propiedad de la fila, y el filtro por `user_id` va **dentro del `WHERE`**. Los tres
usan `requireActiveUser()` y **nunca** `auth.protect()` (`docs/SETUP.md` §6).

### Entrada

`POST /api/payment-methods/setup` **no tiene cuerpo**: todo lo que el servidor
necesita —quién es y qué Customer le corresponde— sale de la sesión. Es la misma
garantía estructural que el spec 007 AC3: no hay nada que manipular porque no hay
nada que el servidor lea del cliente.

El `id` de la ruta de baja se valida antes de tocar la base:

```ts
// src/modules/payments/schemas/payment-method.schema.ts
export const paymentMethodIdParamSchema = z.uuid();
```

Es **nuestro** uuid, nunca un `pm_…`: el cliente jamás envía un identificador de
Stripe, así que no puede pedir el `detach` de una tarjeta que no le pertenece
(D-13).

### Salida

```ts
// src/modules/payments/types/payment-method.types.ts
export type SavedCard = {
  /** Nuestro uuid. El `pm_…` no se publica (D-13). */
  id: string;
  /** `visa`, `mastercard`, `amex`, `american_express`… en minúscula (D-11). */
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  /** ISO. `Date` no viaja en JSON (spec 008, D-15). */
  createdAt: string;
};

export type SavedCardListResponse = { data: SavedCard[] };
export type CardSetupResponse = { url: string };
export type DeleteSavedCardResponse = { id: string };
```

### Mapa de errores

| Status | Cuándo | Origen |
|---|---|---|
| 400 | el `id` de la ruta no es un uuid | `badRequest()` |
| 401 | sin sesión o sin fila espejo | `UnauthorizedError` |
| 403 | cuenta desactivada | `requireActiveUser()` → `ForbiddenError` |
| 404 | la tarjeta no existe **o no es del usuario** | `NotFoundError` |
| 409 | ya tiene `MAX_SAVED_CARDS` tarjetas | `ConflictError` |
| 502 | la API de Stripe falla o no devuelve `url` | `UpstreamError` |
| 500 | cualquier otro fallo | fallback de `toErrorResponse()` |

Los seis salen del `toErrorResponse()` que ya existe, sin un solo `if` nuevo en los
handlers.

### Cómo se guarda la tarjeta en Stripe

Verificado con `stripe docs /payments/save-and-reuse?payment-ui=embedded-components`
y contra los tipos del SDK instalado (`stripe@22.6.1`) el 2026-09-09:

1. **Customer.** «To set up a payment method for future payments, you must attach
   it to an object that represents your customer.» Se crea con
   `stripe.customers.create({ email, name, metadata: { userId } })` la primera vez
   y se guarda en `users.stripe_customer_id`.
2. **Checkout Session en `mode: 'setup'`** con ese `customer`. El SDK documenta en
   `SessionCreateParams.currency`: *«Required in `setup` mode when
   `payment_method_types` is not set.»* Como el spec 007 D-3 prohíbe fijar
   `payment_method_types`, **`currency: ORDER_CURRENCY` es obligatorio** aquí.
   `customer` y `customer_email` son excluyentes: en esta sesión va `customer`.
3. **Retorno.** `success_url` = `${APP_URL}/account?card=added#tarjetas`,
   `cancel_url` = `${APP_URL}/account#tarjetas`. `APP_URL` de
   `src/lib/constants.ts`, nunca `process.env` en crudo (spec 007, M-1).
4. **Webhook.** «After a customer successfully completes their Checkout Session,
   handle the `checkout.session.completed` webhook. […] Get the value of the
   `setup_intent` key […] Use the SetupIntent ID to retrieve the SetupIntent
   object. The returned object contains a `payment_method` ID.» El PaymentMethod
   **ya queda adjunto** al Customer porque la sesión se creó con él: no hace falta
   `paymentMethods.attach()`.

```ts
const intent = await stripe.setupIntents.retrieve(setupIntentId, {
  expand: ['payment_method'],
});
const pm = intent.payment_method;
// Solo tarjeta: cualquier otro tipo se ignora sin guardar (D-14).
if (!pm || typeof pm === 'string' || !pm.card) return;
```

De `pm.card` se leen exactamente cinco campos: `brand`, `display_brand`, `last4`,
`exp_month` y `exp_year`.

### Por qué no hay evento nuevo que registrar

El endpoint de producción ya está previsto con `checkout.session.completed`
(`docs/SETUP.md` §6). La sesión de alta emite **ese mismo evento**, distinguible
por `session.mode === 'setup'`. No se añaden `setup_intent.succeeded` ni
`payment_method.attached` ni `payment_method.detached`: serían tres suscripciones
más para escribir la misma fila desde tres sitios (D-7, D-12).

## 7. Arquitectura y archivos afectados

- `src/server/db/schema/payment-method.ts` — *(nuevo)* §5.
- `src/server/db/schema/user.ts` — *(modificado)* columna `stripe_customer_id`.
- `src/server/db/schema/index.ts` — *(modificado)* barrel.
- `drizzle/0005_*.sql` — *(generado)*.
- `src/server/repositories/payment-method.repository.ts` — *(nuevo)*
  `insertIfAbsent` (idempotente por `unique`), `findManyByUser`, `countByUser`,
  `findByIdForUser`, `deleteForUser`. Toda consulta con el `user_id` dentro del
  `WHERE`.
- `src/server/repositories/user.repository.ts` — *(modificado)*
  `attachStripeCustomer(tx, userId, customerId)`: `UPDATE … WHERE id = $1 AND
  stripe_customer_id IS NULL RETURNING`, que resuelve la carrera de dos pestañas
  en el motor (D-15).
- `src/server/services/card-setup.service.ts` — *(nuevo)* `startCardSetup(user)`:
  tope de tarjetas → Customer (resolver o crear) → Checkout Session `setup` →
  `url`. Lanza `ConflictError` y `UpstreamError`.
- `src/server/services/payment-method.service.ts` — *(nuevo)*
  `saveFromSetupSession(session, eventId)` (lo llama el webhook) y
  `deleteSavedCard(user, id, context)` (lo llama el handler `DELETE`).
- `src/app/api/payment-methods/setup/route.ts` — *(nuevo)* `POST`.
- `src/app/api/payment-methods/route.ts` — *(nuevo)* `GET`.
- `src/app/api/payment-methods/[id]/route.ts` — *(nuevo)* `DELETE`.
- `src/app/api/webhooks/stripe/route.ts` — *(modificado)* una rama en
  `checkout.session.completed`: `session.mode === 'setup'` → servicio de tarjetas;
  el resto, el camino de pago que ya existe.
- `src/modules/payments/constants.ts` — *(nuevo)* `MAX_SAVED_CARDS`,
  `CARD_SETUP_INTEGRATION_IDENTIFIER`, `CARD_BRAND_LABELS`, `paymentMethodKeys`,
  tiempos de caché, copy y mensajes de error.
- `src/modules/payments/types/payment-method.types.ts` — *(nuevo)* §6.
- `src/modules/payments/schemas/payment-method.schema.ts` — *(nuevo)* §6.
- `src/modules/payments/services/payment-method.service.ts` — *(nuevo)* axios:
  `fetchSavedCards`, `createCardSetup`, `deleteSavedCard`. Único punto del módulo
  que llama a axios.
- `src/modules/payments/hooks/use-saved-cards.ts` — *(nuevo)*.
- `src/modules/payments/hooks/use-create-card-setup.ts` — *(nuevo)* mutation.
- `src/modules/payments/hooks/use-delete-saved-card.ts` — *(nuevo)* mutation con
  `invalidateQueries`.
- `src/modules/payments/lib/card-display.ts` — *(nuevo)* funciones puras
  `cardBrandLabel(brand)`, `formatCardExpiry(month, year)` y
  `isCardExpired(month, year)`.
- `src/modules/payments/components/saved-card-item.tsx` — *(nuevo, cliente)*.
- `src/modules/payments/components/add-card-button.tsx` — *(nuevo, cliente)*.
- `src/modules/payments/components/delete-card-dialog.tsx` — *(nuevo, cliente)*
  `AlertDialog` de shadcn, ya instalado.
- `src/modules/payments/components/saved-cards.tsx` — *(nuevo, cliente)*
  orquestador: hook, estados de carga/error/vacío y la ventana de espera del alta.
- `src/modules/account/constants.ts` — *(modificado)* cuarta entrada
  `{ id: 'tarjetas', label: 'Mis tarjetas' }`, al final para no mover los anclas
  existentes.
- `src/app/(storefront)/account/page.tsx` — *(modificado)* nueva
  `<AccountSection>` con `<SavedCards justAdded={…} />`. Sigue siendo Server
  Component con `auth.protect()`; lee `searchParams` como ya hace
  `/checkout/success` y `"use client"` entra un nivel más abajo
  (`docs/SETUP.md` §4, regla 7).
- `src/components/ui/` — **sin cambios**: `alert-dialog`, `button`, `card`,
  `skeleton` y `badge` ya están instalados. No hay `npx shadcn add`.
- `src/modules/payments/store/` — **no se crea**. La sección no tiene estado de UI
  global (`docs/SETUP.md` §4, regla 6).
- `.env` — **sin variables nuevas**: `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SIGNING_SECRET` y `NEXT_PUBLIC_APP_URL` ya están en
  `.env.example`.

Flujo, capa por capa:

```
AddCardButton (client)
  └─ useCreateCardSetup()              TanStack mutation
      └─ createCardSetup()             axios → POST /api/payment-methods/setup
          └─ route.ts                  requireActiveUser · toErrorResponse
              └─ card-setup.service    tope → customers.create/reuse → sessions.create(mode:'setup')
                                       └─ user.repository.attachStripeCustomer()

Stripe ──► POST /api/webhooks/stripe   (mismo endpoint, misma firma)
             └─ mode === 'setup'
                 └─ payment-method.service.saveFromSetupSession()
                     └─ setupIntents.retrieve(expand payment_method)
                     └─ tx: insertIfAbsent · logAudit('payment_method.saved')

SavedCards (client) ─► useSavedCards() ─► GET /api/payment-methods ─► repositorio
DeleteCardDialog   ─► useDeleteSavedCard() ─► DELETE /api/payment-methods/[id]
                                              └─ propiedad → paymentMethods.detach()
                                              └─ tx: delete · logAudit('payment_method.deleted')
```

## 8. Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| D-1 | La sección es la cuarta entrada de `ACCOUNT_SECTIONS`, con ancla `#tarjetas` y su hueco en el rail | Un `Tabs` de shadcn dentro de `/account`, o una ruta `/account/cards` | El requerimiento pide «un nuevo tab» y en esta página un tab **es** una sección con ancla: es el patrón que ya tienen perfil, favoritos y compras (spec 006, D-5). Meter `Tabs` haría convivir dos navegaciones distintas en la misma pantalla |
| D-2 | Alta con Checkout Session `mode: 'setup'` en página alojada | Payment Element / `SetupIntent` + Stripe.js en nuestra UI | Es lo que pide el requerimiento («un link de stripe») y lo que ya hace el pago. No exige Stripe.js, ni clave publicable, ni CSP con `*.stripe.com`, y ningún dígito entra en nuestro dominio |
| D-3 | Se guardan `brand` + `last4` + caducidad. **No** se guardan los cuatro primeros dígitos | Persistir el BIN/IIN para «identificar la empresa» | Stripe no lo expone en una petición estándar: en `stripe@22.6.1`, `PaymentMethod.Card.iin` es opcional y su propia documentación dice *«Issuer identification number of the card. (For internal use only and not typically available in standard API requests.)»*, igual que `issuer` y `description`. Y aunque llegara, el IIN son 6–8 dígitos, no 4. Lo que identifica a la empresa emisora es `brand` (`visa`, `mastercard`, `amex`), que sí es estándar; `last4` es lo que distingue dos tarjetas de la misma marca. Guardar más dígitos del PAN nos metería en el alcance de PCI sin comprar nada |
| D-4 | Ningún código de permiso RBAC: `requireActiveUser()` y propiedad de la fila | `authorize('payment_methods.read')` y un permiso nuevo por operación | Mismo razonamiento que spec 007 D-12 y spec 008: es una operación de cliente, no administrativa, y el rol `customer` está vacío a propósito. `requireActiveUser()` es lo que impide que una cuenta desactivada siga operando con su sesión de Clerk viva (AC2) |
| D-5 | El listado lo sirve **nuestra** base, no Stripe | `GET` que haga `customers.listPaymentMethods()` en cada carga | El requerimiento pide persistir la referencia. Además una llamada de red a Stripe por cada apertura de `/account` pagaría latencia en la ruta más visitada de la cuenta para pintar cuatro campos que no cambian |
| D-6 | `stripe_customer_id` vive en `users`, no en `payment_methods` | Repetirlo en cada tarjeta, como pedía el requerimiento | Un usuario tiene un Customer; una tarjeta no tiene uno propio. Con la columna en `payment_methods`, el usuario **sin tarjetas** no tendría dónde guardarlo y cada alta crearía un Customer nuevo: Customers duplicados en el Dashboard y tarjetas repartidas entre ellos |
| D-7 | El alta la escribe **solo** el webhook, ramificando el `checkout.session.completed` que ya se procesa | Un `POST /api/payment-methods/confirm?session_id=…` disparado desde el retorno, o ambos | Un segundo escritor duplica la lógica y abre la puerta a que el cliente decida cuándo se guarda una tarjeta. El webhook ya está montado, firmado y probado (spec 007, T27). El coste es una ventana de segundos que cubre D-16 |
| D-8 | Tras guardar, si `pm.allow_redisplay !== 'always'` se normaliza con `paymentMethods.update()` | Dejar el valor que traiga Stripe | La API documenta que *«Stripe products such as Checkout and Elements use this field to determine whether a payment method can be shown as a saved payment method in a checkout flow»* y que el valor por defecto es `unspecified`. Una tarjeta guardada con `unspecified` es una fila que nunca se podrá usar: el consentimiento aquí es explícito —el cliente entró a «Agregar tarjeta» y completó un flujo cuyo único propósito es la reutilización—, así que normalizarlo es registrar ese consentimiento donde Stripe lo lee. Es una llamada idempotente y solo cuando hace falta |
| D-9 | `POST /api/checkout` **no se toca** en este spec | Pasar `customer` en vez de `customer_email` para que Stripe ofrezca la tarjeta guardada | Es el cambio siguiente y obvio (§11), pero toca el único flujo que mueve dinero, ya cerrado y verificado end-to-end. `customer` y `customer_email` son excluyentes, así que el cambio obliga a un condicional en el servicio de checkout y a repetir la prueba completa de pago. Se hace con su propio spec y su propia verificación, no de propina |
| D-10 | Sección propia en `/account` | Redirigir al portal de facturación de Stripe (`billing_portal`) | El portal es una segunda interfaz, con su propio idioma, su propia marca y su propio dominio, y no deja nada en nuestra base: el requerimiento pide exactamente lo contrario |
| D-11 | `brand` guarda `display_brand ?? card.brand`, y la etiqueta visible sale de `CARD_BRAND_LABELS` con fallback | Guardar solo `card.brand`, o guardar el rótulo ya formateado | `display_brand` es el que respeta la elección del cliente en tarjetas co-branded; `card.brand` es el respaldo cuando no viene. Guardar el rótulo ya formateado congelaría el idioma en la base |
| D-12 | Eliminar es `detach` en Stripe + **borrado físico** de la fila | Soft delete con `deleted_at` | El SDK es explícito: *«Detachment is permanent and irreversible — once detached, a PaymentMethod can no longer be used for payments or re-attached to a Customer.»* Una fila marcada como borrada apuntaría a un objeto irrecuperable. Ninguna otra tabla la referencia (`orders` guarda su propio `payment_intent`), y el histórico lo conserva `audit_logs`, que es append-only |
| D-13 | El cliente solo maneja **nuestro** uuid; el `pm_…` no sale del servidor | Publicar `stripePaymentMethodId` y recibirlo en el `DELETE` | Mismo criterio que spec 008 D-4 con los ids de Stripe. Además un `pm_…` recibido del cliente obligaría a comprobar la propiedad después de leer, mientras que el uuid propio la resuelve dentro del `WHERE` |
| D-14 | Si el PaymentMethod no es `card`, el webhook no guarda nada y responde `200` | Guardar cualquier tipo con columnas nulas | La tabla modela una tarjeta: `brand` y `last4` no significan nada para otros medios. Ignorar y devolver `200` evita que Stripe reintente para siempre un evento que nunca vamos a poder procesar |
| D-15 | El `cus_…` se fija con `UPDATE … WHERE stripe_customer_id IS NULL RETURNING` | Leer, comprobar y actualizar | Dos pestañas pulsando «Agregar tarjeta» a la vez pasarían las dos la comprobación en memoria y la segunda pisaría el Customer de la primera, dejando tarjetas huérfanas en el Customer perdido. El UPDATE condicional resuelve la carrera en el motor: quien pierde, reutiliza el que ya está (mismo patrón que spec 007 D-5) |
| D-16 | Al volver con `?card=added`, la sección refresca cada 2 s, hasta 5 intentos, y se detiene antes si aparece una tarjeta creada en los últimos 2 minutos | Un `refetch` único al montar, o polling indefinido | El webhook es eventualmente consistente: con un solo `refetch` el cliente vería su lista sin la tarjeta que acaba de guardar. Es el patrón de `OrderStatusPoller` (spec 007, D-17) con su estado terminal explícito (corrección m-2 del mismo spec), no un spinner que se queda mirando |
| D-17 | La bandera del retorno llega como **prop** desde la page, leída de `searchParams` en el servidor | `useSearchParams()` en el componente cliente | La page ya es dinámica y ya lee `searchParams` en `/checkout/success`: hacerlo igual evita el bailout de CSR de `useSearchParams` y deja el componente cliente sin acoplarse a la URL |
| D-18 | Tope de `MAX_SAVED_CARDS = 5` por usuario, comprobado **antes** de crear la sesión | Sin tope | Sin límite, la tabla y el Customer de Stripe crecen sin freno con cada alta abandonada a medias. Comprobarlo antes es el único momento en que se puede decir que no sin haber creado nada en Stripe (AC15) |
| D-19 | En `audit_logs` van el uuid de la fila y los identificadores del evento; **nunca** marca, `last4` ni caducidad | Registrar los datos de la tarjeta para poder rastrear cuál se borró | `docs/SETUP.md` §5.2 regla dura 3 prohíbe datos de tarjeta en la bitácora, sin matices. El `entity_id` ya identifica la fila afectada |

## 9. Tareas

- [x] **T1** — Definir la tabla `payment_methods` de §5 · archivo:
      `src/server/db/schema/payment-method.ts` · verificación: `npm run typecheck`
- [x] **T2** — Añadir la columna `stripe_customer_id` (`varchar(255)`, unique,
      nullable) sin tocar `USER_TEXT_LENGTHS` · archivo:
      `src/server/db/schema/user.ts` · verificación: `npm run typecheck`
- [x] **T3** — Exportar `paymentMethods` desde el barrel · archivo:
      `src/server/db/schema/index.ts` · verificación: `npm run typecheck`
- [x] **T4** — Generar y aplicar la migración · archivos: `drizzle/` ·
      verificación: `npm run db:generate && npm run db:migrate`, y `npm run
      db:studio` muestra la tabla vacía y la columna nueva en `users`
      → `drizzle/0005_lowly_devos.sql` aplicada. Comprobado contra Neon vía
      `information_schema`: `payment_methods` con sus 8 columnas y 0 filas, y
      `users.stripe_customer_id` `varchar(255)` nullable.
- [x] **T5** — Constantes del módulo: `MAX_SAVED_CARDS`,
      `CARD_SETUP_INTEGRATION_IDENTIFIER`, `CARD_BRAND_LABELS`,
      `paymentMethodKeys`, `SAVED_CARDS_STALE_TIME_MS`, la ventana de espera de
      D-16 y los mensajes de 409/404/502 · archivo:
      `src/modules/payments/constants.ts` · verificación: `npm run typecheck`
- [x] **T6** — Tipos de §6 (`SavedCard`, `SavedCardListResponse`,
      `CardSetupResponse`, `DeleteSavedCardResponse`) y los inferidos de Drizzle ·
      archivo: `src/modules/payments/types/payment-method.types.ts` ·
      verificación: `npm run typecheck`
- [x] **T7** — Schema Zod `paymentMethodIdParamSchema` · archivo:
      `src/modules/payments/schemas/payment-method.schema.ts` · verificación:
      `npm run typecheck`
- [x] **T8** — Repositorio: `insertIfAbsent(tx, values)` con
      `onConflictDoNothing` sobre `stripe_payment_method_id` y `returning()`,
      `findManyByUser(userId, reader)` con proyección positiva a `SavedCard`
      (`createdAt` en ISO), `countByUser`, `findByIdForUser` y `deleteForUser(tx,
      id, userId)`, todos con el `user_id` dentro del `WHERE` · archivo:
      `src/server/repositories/payment-method.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T9** — `attachStripeCustomer(tx, userId, customerId)` con el UPDATE
      condicional de D-15, devolviendo el `cus_…` vigente · archivo:
      `src/server/repositories/user.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T10** — Servicio `startCardSetup(user)`: tope de D-18 → Customer (reusar
      `users.stripe_customer_id` o `customers.create`) → `sessions.create({ mode:
      'setup', currency: ORDER_CURRENCY, customer, metadata: { userId },
      setup_intent_data: { metadata: { userId } }, success_url, cancel_url,
      integration_identifier })` → `url`. Lanza `ConflictError` y `UpstreamError` ·
      archivo: `src/server/services/card-setup.service.ts` · verificación:
      `npm run typecheck`
- [x] **T11** — Servicio `saveFromSetupSession(session, eventId)`: `userId` de
      `session.metadata` → `setupIntents.retrieve` con `expand:
      ['payment_method']` → filtro de tipo tarjeta (D-14) → transacción con
      `insertIfAbsent` y `logAudit('payment_method.saved')`, saltando la bitácora
      si el INSERT no devolvió fila (AC7) → normalización de `allow_redisplay`
      (D-8) **después del commit**, solo si el INSERT devolvió fila y con su fallo
      registrado sin abortar el guardado (revisión 1, M-1) · archivo:
      `src/server/services/payment-method.service.ts` · verificación:
      `npm run typecheck`
- [x] **T12** — Servicio `deleteSavedCard(user, id, context)`: propiedad →
      `paymentMethods.detach()` (tratando `resource_missing` como éxito, §10) →
      transacción con `deleteForUser` y `logAudit('payment_method.deleted',
      actorId: user.id)`. Lanza `NotFoundError` y `UpstreamError` · archivo:
      `src/server/services/payment-method.service.ts` · verificación:
      `npm run typecheck`
- [x] **T13** — Route Handler `POST /api/payment-methods/setup`:
      `requireActiveUser()` → servicio → `{ url }`, con `toErrorResponse` ·
      archivo: `src/app/api/payment-methods/setup/route.ts` · verificación:
      `npm run typecheck`
- [x] **T14** — Route Handler `GET /api/payment-methods`: `requireActiveUser()` →
      repositorio → `{ data }` · archivo:
      `src/app/api/payment-methods/route.ts` · verificación: `npm run typecheck`
- [x] **T15** — Route Handler `DELETE /api/payment-methods/[id]`:
      `requireActiveUser()` → `paymentMethodIdParamSchema` sobre el param →
      `getAuditContext(request)` → servicio → `{ id }` · archivo:
      `src/app/api/payment-methods/[id]/route.ts` · verificación: `npm run build`
- [x] **T16** — Ramificar `checkout.session.completed` por `session.mode ===
      'setup'` antes de la comprobación de `payment_status`, dejando intacto el
      camino de pago · archivo: `src/app/api/webhooks/stripe/route.ts` ·
      verificación: `npm run typecheck`
- [x] **T17** — Services axios `fetchSavedCards()`, `createCardSetup()` y
      `deleteSavedCard(id)` · archivo:
      `src/modules/payments/services/payment-method.service.ts` · verificación:
      `npm run typecheck`
- [x] **T18** — Hook `useSavedCards({ poll })`: `refetchInterval` según D-16 ·
      archivo: `src/modules/payments/hooks/use-saved-cards.ts` · verificación:
      `npm run lint`
- [x] **T19** — Hook `useCreateCardSetup()`: mutation que en `onSuccess` hace
      `window.location.assign(url)` y en `onError` muestra el toast, igual que
      `useCreateCheckout` · archivo:
      `src/modules/payments/hooks/use-create-card-setup.ts` · verificación:
      `npm run lint`
- [x] **T20** — Hook `useDeleteSavedCard()`: mutation con
      `invalidateQueries(paymentMethodKeys.all)` y toast de éxito y error ·
      archivo: `src/modules/payments/hooks/use-delete-saved-card.ts` ·
      verificación: `npm run lint`
- [x] **T21** — Funciones puras `cardBrandLabel`, `formatCardExpiry` e
      `isCardExpired` (AC14) · archivo:
      `src/modules/payments/lib/card-display.ts` · verificación:
      `npm run typecheck`
- [x] **T22** — Componente `<SavedCardItem card onDelete>`: marca, `•••• last4`,
      caducidad, distintivo de vencida y disparador de la baja · archivo:
      `src/modules/payments/components/saved-card-item.tsx` · verificación:
      `npm run lint`
- [x] **T23** — Componente `<AddCardButton>`: consume `useCreateCardSetup`,
      deshabilitado mientras `isPending`, con el copy de consentimiento de §10 ·
      archivo: `src/modules/payments/components/add-card-button.tsx` ·
      verificación: `npm run lint`
- [x] **T24** — Componente `<DeleteCardDialog>`: `AlertDialog` de shadcn con la
      tarjeta nombrada por marca y `last4`, y aviso de que la baja es definitiva ·
      archivo: `src/modules/payments/components/delete-card-dialog.tsx` ·
      verificación: `npm run lint`
- [x] **T25** — Componente `<SavedCards justAdded>`: hook, esqueleto, error con
      reintento, vacío con `<AccountEmpty>`, lista, ventana de espera de D-16 y su
      estado terminal (AC13) · archivo:
      `src/modules/payments/components/saved-cards.tsx` · verificación:
      `npm run lint`
- [x] **T26** — Añadir `{ id: 'tarjetas', label: 'Mis tarjetas' }` al final de
      `ACCOUNT_SECTIONS` · archivo: `src/modules/account/constants.ts` ·
      verificación: `npm run typecheck`
- [x] **T27** — Nueva `<AccountSection id="tarjetas">` con `<SavedCards
      justAdded={…} />`, leyendo `searchParams` en el servidor (D-17), sin tocar
      las otras tres secciones · archivo:
      `src/app/(storefront)/account/page.tsx` · verificación: `npm run build`
- [ ] **T28** — Prueba manual end-to-end: `npm run dev` + `stripe listen
      --forward-to localhost:3000/api/webhooks/stripe`, guardar
      `4242 4242 4242 4242`, comprobar la fila en `payment_methods`, el `cus_…` en
      `users`, la entrada `payment_method.saved` en `audit_logs` y que la tarjeta
      aparece en `/account#tarjetas` sin recargar (AC5, AC6, AC13) ·
      verificación: manual, con el resultado de `db:studio` registrado en este spec

      **BLOQUEADA.** Dos motivos, ninguno de código:

      1. `STRIPE_SECRET_KEY` de `.env.local` es una clave **restringida**
         (`rk_test_…`) sin los permisos que necesita esta feature. Comprobado
         endpoint por endpoint contra la cuenta `acct_1UDAnkQA1QiCftQU` el
         2026-09-09: `customers.create` → falta `customer_write`;
         `customers.retrieve` → falta `customer_read`; `paymentMethods.update` y
         `paymentMethods.detach` → falta `payment_method_write`;
         `paymentMethods.retrieve` → falta `payment_method_read`. Sí tiene
         `checkout_session_write` y `setup_intent_read`. Con la clave actual,
         `POST /api/payment-methods/setup` responde `502` en el primer alta. Se
         corrige editando la clave en el Dashboard, no en el repo.
      2. Completar el formulario alojado de `checkout.stripe.com` con
         `4242 4242 4242 4242` exige una sesión de Clerk en un navegador real.

      Verificado sin navegador, mientras tanto:

      - **AC1** — `GET`, `POST` y `DELETE` de `/api/payment-methods` sin sesión
        responden `401` con `{"message":"Necesitas iniciar sesión para acceder a
        este recurso."}` y `content-type: application/json`. Ningún `307`.
      - **AC4 (parámetros)** — Stripe acepta la sesión con exactamente los
        parámetros de `startCardSetup`: la respuesta vuelve con `mode: setup`,
        `currency: pen` y `success_url` **con el fragmento intacto**
        (`http://localhost:3000/account?card=added#tarjetas`). Queda descartado el
        riesgo de §10 sobre el fragmento en `success_url`. La sesión de sonda se
        expiró después.
      - **AC18** — las tres rutas figuran como dinámicas `ƒ` en la salida de
        `npm run build`.
- [ ] **T29** — Prueba manual de idempotencia y de propiedad: reenviar el evento
      con `stripe events resend <id>` y comprobar que no hay segunda fila ni
      segunda entrada de bitácora (AC7); con dos cuentas, pedir
      `DELETE /api/payment-methods/{id de la otra}` y comprobar el `404` y que la
      tarjeta sigue adjunta en Stripe (AC9) · verificación: manual

      **BLOQUEADA por T28**: sin una tarjeta guardada de verdad no hay evento que
      reenviar ni fila ajena que pedir.
- [x] **T30** — Registrar `payment_methods` y la columna `users.stripe_customer_id`
      como construidas, el módulo `payments` en la estructura de carpetas y la
      sección de tarjetas como entregada · archivo: `docs/SETUP.md` (§3, §5.3 y
      §6) · verificación: lectura
- [ ] **T31** — Cierre: `npm run typecheck && npm run lint && npm run build` en
      verde y todos los AC marcados · verificación: los tres comandos

      Los tres comandos, **en verde** (2026-09-09): `typecheck` sin salida, `lint`
      con 0 errores —los 6 warnings son preexistentes, de `useReactTable` y
      `useForm` en módulos ajenos a este spec—, y `build` con
      `/api/payment-methods`, `/api/payment-methods/[id]` y
      `/api/payment-methods/setup` como dinámicas `ƒ`.

      **Los AC no están todos marcados**: AC1, AC16, AC17 y AC18 sí. AC2–AC15 y
      AC19 dependen de T28/T29, bloqueadas por los permisos de la clave restringida
      de Stripe y por el formulario alojado, que exige un navegador con sesión de
      Clerk.

### 9.1 Correcciones de la revisión 1 (2026-09-10)

- [x] **B-1 (bloqueante)** — `AlertDialogCancel` y `AlertDialogAction` del diálogo
      de baja se quedaban con el `size` por defecto de shadcn (32 px), por debajo
      del mínimo táctil de AC19. Ahora llevan `className="h-11 rounded-full px-5"`,
      el mismo patrón que `saved-card-item.tsx` y que el resto de la sección ·
      archivo: `src/modules/payments/components/delete-card-dialog.tsx`
- [x] **M-1 (mayor)** — `normalizeAllowRedisplay()` corría **antes** de la
      transacción y sin captura: un fallo de esa llamada accesoria (p. ej. una
      clave restringida sin `payment_method_write`, T28) tumbaba todo
      `saveFromSetupSession` y dejaba la tarjeta adjunta en Stripe pero ausente de
      la tabla —el modo de fallo silencioso de §10—. Ahora la transacción devuelve
      la fila insertada y la normalización se ejecuta **después del commit**, solo
      si hubo INSERT (en la reentrega ya está normalizada), envuelta en `try/catch`
      con `console.error` explícito. Un fallo suyo ya no impide ni el guardado ni
      el `200` al webhook, y la reentrega la sigue absorbiendo el `unique`. Coincide
      con D-8 y con el orden del diagrama de §7 · archivo:
      `src/server/services/payment-method.service.ts`
- [x] **m-1 (menor)** — El estado vacío llevaba el CTA genérico «Ver el catálogo»,
      que no es la acción siguiente en «Mis tarjetas». Se corrigió con copy: el
      cuerpo remite al botón «Agregar tarjeta» de arriba y el CTA pasa a «Empezar
      una compra», que es lo que da sentido a guardar la tarjeta. **No** se hicieron
      opcionales `ctaHref`/`ctaLabel` en `AccountEmpty`: contradice spec 006 D-9 y
      tocaría un componente compartido con otros dos consumidores, fuera del alcance
      de esta corrección · archivo:
      `src/modules/payments/components/saved-cards.tsx`
- [x] **m-2 (menor)** — `metadata.description` y el subtítulo de `/account`
      enumeraban tres secciones cuando ya hay cuatro. Ambos textos incluyen ahora
      las tarjetas · archivo: `src/app/(storefront)/account/page.tsx`

Verificación tras las correcciones (2026-09-10): `npm run typecheck` sin salida,
`npm run lint` con 0 errores —los 6 warnings siguen siendo los preexistentes de
`useReactTable` y `useForm` en módulos ajenos a este spec— y `npm run build` en
verde, con las tres rutas de `/api/payment-methods` como dinámicas `ƒ`.

### 9.2 Revisión 2 (2026-09-10) — APROBADO

Las cuatro correcciones de §9.1 se verificaron leyendo el código, no el reporte del
developer:

- **B-1** resuelto, y comprobado en el CSS compilado: `.h-11` se emite después de
  `.h-8` en la hoja de estilos, así que los botones del diálogo miden 44 px de alto.
  La otra mitad de AC19 —sin scroll horizontal a 390 px— sigue necesitando navegador
  y queda con T28.
- **M-1** resuelto: la transacción devuelve la fila insertada y
  `normalizeAllowRedisplay()` corre después del commit, solo si hubo INSERT, con
  `console.error` explícito. AC6 (INSERT y bitácora atómicos) y AC7 (reentrega sin
  segunda fila ni segunda entrada) siguen intactos, y la transacción ya no retiene
  una conexión mientras espera a la red de Stripe.
- **m-1** aceptado: mantener `ctaHref`/`ctaLabel` obligatorios respeta spec 006 D-9 y
  evita tocar un componente compartido por tres secciones.
- **m-2** aceptado: `metadata.description` y el subtítulo enumeran las cuatro
  secciones.

Deuda cosmética anotada, no bloqueante: en `delete-card-dialog.tsx`,
`AlertDialogAction` y `AlertDialogCancel` envuelven un `<Button asChild>`, y Radix
Slot **concatena** los `className` en vez de pasarlos por `tailwind-merge`. `h-11`
gana por orden de la hoja de estilos, pero `rounded-full` pierde contra el
`rounded-lg` de `buttonVariants`: los dos botones salen con esquina `lg` en lugar de
píldora. Se corrige con el modificador important de Tailwind 4 (`rounded-full!`)
cuando se vuelva a tocar la sección.

## 10. Riesgos y consideraciones

- **Cumplimiento y consentimiento.** Stripe es explícito: *«You're responsible for
  your compliance with all applicable laws […] Add terms to your website or app
  that state how you plan to save payment method details and allow customers to
  opt in.»* Aquí el opt-in es el propio botón «Agregar tarjeta», pero la sección
  debe decir con todas las letras qué se guarda (marca, últimos cuatro dígitos y
  caducidad), qué no (el número completo, que queda en Stripe) y para qué. Ese
  copy es parte de T23, no un adorno.
- **PCI.** Ningún dígito del PAN entra en nuestro dominio: el formulario es de
  Stripe y lo que vuelve por la API son cinco campos no sensibles. Es lo que
  descarta D-3: guardar los primeros cuatro dígitos nos metería a nosotros en un
  alcance del que hoy estamos fuera.
- **Ventana de eventual consistencia.** Entre que el cliente vuelve y el webhook
  escribe pasan segundos. D-16 la cubre con una espera acotada; si el webhook
  falla del todo, la tarjeta queda adjunta en Stripe y ausente de nuestra lista.
  El cliente puede volver a guardarla —creando un segundo `pm_…` en el Customer—,
  así que la deuda real es la falta de reconciliación (§11).
- **Sin `stripe listen` no se guarda nada.** En local, olvidar el forward deja la
  tarjeta en Stripe y la lista vacía sin ningún error visible. Es el mismo modo de
  fallo del checkout (spec 007) y T28 lo cubre explícitamente.
- **Baja a medio camino.** Si el `detach` sale bien y el DELETE local falla, queda
  una fila apuntando a un PaymentMethod ya desprendido. Por eso el reintento trata
  el `resource_missing` de Stripe como éxito y sigue con el borrado local: sin esa
  rama, la fila sería imposible de eliminar desde la UI.
- **Carrera del Customer.** Dos pestañas pulsando «Agregar tarjeta» a la vez
  pueden crear dos Customers en Stripe; el UPDATE condicional de D-15 garantiza
  que solo uno se guarda, y el otro queda vacío y sin tarjetas. Es basura en el
  Dashboard, no una tarjeta perdida.
- **Fuga de datos.** La proyección del repositorio es positiva: se enumera lo que
  sale. Un `select()` sin argumentos publicaría `user_id` y el `pm_…` (AC8).
- **Enumeración de tarjetas ajenas.** `findByIdForUser` y `deleteForUser` filtran
  por `user_id` dentro del `WHERE`, y el `404` uniforme impide distinguir «no
  existe» de «no es tuya» (AC9), igual que en el spec 008 D-13.
- **Fragmento en `success_url`.** El retorno lleva `#tarjetas`. Si Stripe rechazara
  la URL con fragmento, se cae a `?card=added` sin ancla y el desplazamiento lo
  resuelve el navegador con el rail; T28 lo verifica de verdad, no por suposición.
- **`ORDER_CURRENCY` en un módulo ajeno.** `card-setup.service.ts` importa la
  constante de `src/modules/orders/constants.ts`: la moneda es una sola en toda la
  app (spec 007, D-20) y duplicarla en `payments` crearía la segunda copia que se
  desincroniza.
- **Latencia de Stripe dentro del webhook.** `setupIntents.retrieve` y el
  `paymentMethods.update` de D-8 son dos llamadas de red dentro del margen de ~10 s
  que Stripe concede. Si se agota, el `500` provoca reintento y el `unique` absorbe
  la reentrega. Solo la primera bloquea el guardado: la segunda va después del
  commit y su fallo se registra sin deshacer la fila (revisión 1, M-1).
- **Rollback.** Revertir es borrar los archivos nuevos, deshacer la rama del
  webhook y quitar la sección de `ACCOUNT_SECTIONS`. La tabla y la columna pueden
  quedarse: nada más las referencia. Si ya hubiera tarjetas guardadas, la migración
  inversa no debe ejecutarse sin hacer antes `detach` de cada `pm_…`, o quedarían
  adjuntas en Stripe sin ninguna forma de gestionarlas desde la aplicación.

## 11. Fuera de alcance / deuda aceptada

| Diferido | Cuándo retomarlo |
|---|---|
| Pagar con una tarjeta guardada: `customer` en la Checkout Session de pago en lugar de `customer_email` | Inmediatamente después de este spec. Es lo que convierte la tarjeta guardada en valor real, y su spec debe repetir la prueba end-to-end de pago del 007. Comprobar antes que `allow_redisplay` normalizado por D-8 basta para que Checkout la muestre |
| Cobro off-session (`payment_intent` con `off_session: true`) y su manejo de autenticación fallida | Cuando exista un cargo sin cliente delante: renovaciones, cuotas o cargos por no presentarse |
| Tarjeta predeterminada (`is_default` o `invoice_settings.default_payment_method`) | Con el flujo que consuma la tarjeta; antes no hay nada a lo que aplicarle un valor por defecto |
| Reconciliación con Stripe (endpoint o job que compare `customers.listPaymentMethods` con la tabla) | Cuando aparezca la primera divergencia real: una tarjeta guardada en Stripe que no está en la lista, o al revés |
| `payment_method.automatically_updated` para tarjetas reemitidas | Cuando haya cobros recurrentes; hoy una caducidad vieja solo afea la lista y se resuelve borrando y volviendo a guardar |
| Editar la dirección de facturación o poner alias a una tarjeta | A petición |
| Panel admin con los medios de pago de un cliente | Con `/admin/customers`, y solo con un código de permiso propio; nunca reutilizando estos endpoints |
| Portal de facturación de Stripe como vista alternativa | Si el mantenimiento de esta sección se vuelve caro comparado con delegarla |
