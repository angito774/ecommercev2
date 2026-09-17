# SETUP — E-commerce Tech

Documento único de referencia para el arranque del proyecto y la **arquitectura de
carpetas obligatoria**. Todo agente y toda tarea debe respetar esta estructura.

---

## 1. Stack

| Capa | Tecnología | Versión objetivo |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.x |
| Runtime UI | React | 19.x |
| Lenguaje | TypeScript (strict) | 5.x |
| Estilos | Tailwind CSS | 4.x |
| Componentes | shadcn/ui (Radix + CVA) | latest |
| Base de datos | Neon Postgres (serverless) | — |
| ORM | Drizzle ORM + drizzle-kit | latest |
| Auth | Clerk (`@clerk/nextjs`) | latest |
| Estado servidor | TanStack Query v5 | 5.x |
| Tablas | TanStack Table v8 | 8.x |
| HTTP | Axios | 1.x |
| Estado cliente | Zustand | 5.x |
| Gráficos | Recharts | 2.x |
| Validación | Zod | 4.x |
| Formularios | React Hook Form + @hookform/resolvers | latest |
| Gestor de paquetes | **npm** | — |

---

## 2. Bootstrap del proyecto

```bash
# 1. Scaffold
npx create-next-app@latest . \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --turbopack --use-npm

# 2. Datos — Neon + Drizzle
npm i drizzle-orm @neondatabase/serverless
npm i -D drizzle-kit dotenv tsx

# 3. Auth
npm i @clerk/nextjs

# 4. Estado de servidor y tablas
npm i @tanstack/react-query @tanstack/react-table
npm i -D @tanstack/react-query-devtools

# 5. HTTP, estado cliente, gráficos
npm i axios zustand recharts

# 6. Validación y formularios
npm i zod react-hook-form @hookform/resolvers

# 7. UI
npx shadcn@latest init
npx shadcn@latest add button input label card table dialog sheet \
  dropdown-menu select badge separator skeleton sonner form tabs avatar

# 8. Utilidades
npm i class-variance-authority clsx tailwind-merge lucide-react next-themes
npm i -D prettier prettier-plugin-tailwindcss
```

### Variables de entorno (`.env.local`)

```bash
# Neon
DATABASE_URL="postgresql://<user>:<pass>@<host>.neon.tech/<db>?sslmode=require"

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

`.env.local` va en `.gitignore`. Nunca se commitea. Mantén un `.env.example` con
las claves vacías.

### Scripts (`package.json`)

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx src/server/db/seed.ts"
  }
}
```

---

## 3. Arquitectura de carpetas

Estructura **modular por dominio** sobre App Router. La regla base: el `app/`
solo enruta y compone; la lógica vive en `modules/` (cliente) y `server/` (datos).

```
.
├── .claude/
│   └── agents/                  orchestrator · spec · developer · reviewer
├── docs/
│   ├── SETUP.md                 este archivo
│   └── specs/                   NNN-slug.md — specs SDD (documentación viva)
├── drizzle/                     migraciones generadas por drizzle-kit
├── drizzle.config.ts
├── public/
└── src/
    ├── app/
    │   ├── (storefront)/        módulo CLIENTE
    │   │   ├── layout.tsx       header, footer, providers de tienda
    │   │   ├── page.tsx         home
    │   │   ├── products/
    │   │   │   ├── page.tsx     catálogo + filtros
    │   │   │   └── [slug]/page.tsx
    │   │   ├── cart/page.tsx
    │   │   ├── checkout/page.tsx
    │   │   └── orders/
    │   │       ├── page.tsx
    │   │       └── [id]/page.tsx
    │   ├── (admin)/             módulo ADMINISTRACIÓN
    │   │   └── admin/
    │   │       ├── layout.tsx   sidebar + guard de rol
    │   │       ├── page.tsx     dashboard (Recharts)
    │   │       ├── products/    CRUD (TanStack Table)
    │   │       ├── categories/
    │   │       ├── orders/
    │   │       ├── customers/
    │   │       ├── roles/       roles, permisos y asignaciones
    │   │       └── audit-logs/  bitácora (TanStack Table + filtros)
    │   ├── (auth)/
    │   │   ├── sign-in/[[...sign-in]]/page.tsx
    │   │   └── sign-up/[[...sign-up]]/page.tsx
    │   ├── api/                 Route Handlers — única API pública
    │   │   ├── products/route.ts
    │   │   ├── products/[id]/route.ts
    │   │   ├── categories/route.ts
    │   │   ├── cart/route.ts
    │   │   ├── orders/route.ts
    │   │   └── admin/
    │   │       ├── metrics/route.ts
    │   │       ├── roles/route.ts
    │   │       ├── permissions/route.ts
    │   │       └── audit-logs/route.ts
    │   ├── layout.tsx           root: fonts, ClerkProvider, Providers
    │   ├── globals.css
    │   └── not-found.tsx
    │
    ├── modules/                 FEATURES por dominio (lado cliente)
    │   └── <dominio>/           products | categories | cart | orders | payments | customers | dashboard | roles | audit
    │       ├── components/      UI específica del dominio
    │       ├── hooks/           TanStack Query: useProducts, useCreateProduct
    │       ├── services/        llamadas axios tipadas (product.service.ts)
    │       ├── schemas/         Zod: entrada/salida del dominio
    │       ├── store/           Zustand, solo si el dominio tiene estado UI global
    │       ├── types/           tipos derivados del schema Drizzle
    │       └── constants.ts
    │
    ├── server/                  SOLO servidor — nunca importar desde cliente
    │   ├── db/
    │   │   ├── index.ts         cliente Drizzle + Neon
    │   │   ├── schema/          una tabla por archivo + index.ts barrel
    │   │   └── seed.ts
    │   ├── repositories/        acceso a datos (product.repository.ts)
    │   └── services/            reglas de negocio que cruzan repositorios
    │
    ├── components/
    │   ├── ui/                  shadcn — no editar a mano salvo tokens
    │   ├── shared/              header, footer, sidebar, data-table, empty-state
    │   └── providers/           query-provider, theme-provider
    │
    ├── lib/
    │   ├── axios.ts             instancia única con baseURL e interceptores
    │   ├── query-client.ts      config de TanStack Query
    │   ├── utils.ts             cn() y helpers puros
    │   ├── auth.ts              helpers de Clerk: requireAuth, requireAdmin
    │   ├── permissions.ts       PERMISSIONS (códigos), can(), requirePermission()
    │   ├── audit.ts             logAudit() — escribe en audit_logs dentro de la tx
    │   └── constants.ts
    │
    ├── hooks/                   hooks transversales (useDebounce, useMediaQuery)
    ├── types/                   tipos globales compartidos
    └── proxy.ts                 clerkMiddleware() sin lógica de auth
```

### Convenciones de nombres

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivo de componente | kebab-case | `product-card.tsx` |
| Componente | PascalCase | `ProductCard` |
| Hook | `use` + camelCase | `useProducts` |
| Service | `<dominio>.service.ts` | `product.service.ts` |
| Repositorio | `<dominio>.repository.ts` | `product.repository.ts` |
| Schema Drizzle | singular | `src/server/db/schema/product.ts` |
| Tabla en Postgres | snake_case plural | `products`, `order_items` |
| Route Handler | `route.ts` | `app/api/products/route.ts` |

---

## 4. Flujo de datos

```
Server Component ──────────────────────► repositorio ──► Drizzle ──► Neon
   (lectura inicial, SEO)

Client Component ──► hook (TanStack Query) ──► service (axios)
                                                     │
                                                     ▼
                                          Route Handler (/api)
                                             · await auth() + requirePermission()
                                             · validación Zod
                                             · repositorio ──► Drizzle ──► Neon
```

**Reglas duras**

1. Un componente **nunca** importa `db`, Drizzle ni un repositorio.
2. Un componente **nunca** llama `axios`/`fetch` directo. Va en `services/`, se consume vía hook.
3. Toda consulta a BD vive en `src/server/repositories/`. Los Route Handlers orquestan, no consultan.
4. Todo Route Handler valida su entrada con Zod antes de llamar al repositorio.
5. Los tipos se **infieren** del schema Drizzle (`InferSelectModel`), no se escriben dos veces.
6. Datos de servidor → TanStack Query. Estado de UI (carrito local, filtros, sidebar) → Zustand. Sin mezclar.
7. `"use client"` lo más abajo posible en el árbol. Nunca en un layout que no lo necesita.
8. La autorización se verifica en el **recurso** que accede a los datos: cada page,
   layout, Route Handler y Server Function llama a `await auth()` y, cuando aplica,
   a `requirePermission(<código>)`. `src/proxy.ts` no lleva lógica de auth y no
   sustituye esa verificación (formas exactas en §6).

---

## 5. Modelo de datos inicial

El detalle exacto de cada tabla lo define su spec. Precios en **enteros
(centavos)**. Nunca `float`.

### 5.1 Identidad y acceso (RBAC)

| Tabla | Propósito | Relaciones |
|---|---|---|
| `users` | espejo local de Clerk: `clerk_id` (único), email, nombre, `is_active` | N—N `roles`, 1—N `orders`, 1—N `audit_logs` |
| `roles` | rol nombrado: `slug` (`customer`, `admin`, `manager`, `support`), nombre, descripción, `is_system` | N—N `users`, N—N `permissions` |
| `permissions` | permiso atómico: `code` único `<recurso>.<acción>` (`products.create`, `orders.update_status`), `resource`, `action`, descripción | N—N `roles` |
| `role_permissions` | pivote rol ↔ permiso. PK compuesta (`role_id`, `permission_id`) | N—1 `roles`, N—1 `permissions` |
| `user_roles` | pivote usuario ↔ rol. PK compuesta (`user_id`, `role_id`), `assigned_by`, `assigned_at` | N—1 `users`, N—1 `roles` |

**Cómo convive con Clerk**

- Clerk es la fuente de verdad de la **autenticación** (sesión, credenciales, MFA).
- Postgres es la fuente de verdad de la **autorización** (roles y permisos del dominio).
- `users` se sincroniza desde Clerk vía webhook (`user.created`, `user.updated`, `user.deleted`).
- El set de permisos efectivo se resuelve en servidor: `clerk_id → users → user_roles → role_permissions → permissions`.
- Cachear el set de permisos en `publicMetadata` de Clerk es opcional y **derivado**; ante discrepancia, gana Postgres.

**Reglas duras**

1. La verificación se hace siempre por `permission.code`, nunca por nombre de rol
   quemado en el código (`if (role === 'admin')` es un hallazgo bloqueante), y corre
   **dentro del recurso** que accede a los datos, no solo en `proxy.ts`.
2. Los roles de sistema (`is_system = true`) no se borran ni se renombran desde la UI.
3. Un usuario sin filas en `user_roles` es `customer` por defecto. Ese default vive
   en un solo lugar del servidor, no repartido por la app.
4. `permissions` es una tabla semilla (`db:seed`), no editable desde el panel. Los
   permisos nacen del código; los roles se componen desde la UI.

### 5.2 Auditoría y logs

| Tabla | Propósito | Relaciones |
|---|---|---|
| `audit_logs` | traza inmutable de toda mutación relevante | N—1 `users` (`actor_id`, nullable) |

Columnas:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `actor_id` | fk `users.id` nullable | null = acción del sistema, cron o webhook |
| `action` | text | `product.created`, `order.status_changed`, `role.permission_granted`, `auth.login_failed` |
| `entity_type` | text | `product`, `order`, `user`, `role` |
| `entity_id` | text nullable | id del registro afectado |
| `changes` | jsonb nullable | `{ before, after }` — solo los campos que cambiaron |
| `metadata` | jsonb nullable | contexto extra (ruta, motivo, id de request) |
| `ip_address` | inet nullable | |
| `user_agent` | text nullable | |
| `severity` | enum | `info` \| `warning` \| `error` |
| `created_at` | timestamptz | default `now()` |

Índices: `(entity_type, entity_id)`, `(actor_id, created_at desc)`, `(action)`,
`(created_at desc)`.

**Reglas duras**

1. `audit_logs` es **append-only**. Sin `UPDATE`, sin `DELETE` desde la aplicación.
   El único borrado permitido es la purga por retención (job, no request de usuario).
2. Se escribe en la **misma transacción** que la mutación auditada. Si la mutación
   revierte, el log también.
3. Nunca se guarda PII sensible ni secretos en `changes` o `metadata`: sin
   contraseñas, tokens, claves de API ni datos de tarjeta. Los campos sensibles se
   enmascaran antes de serializar.
4. Un fallo al escribir el log **no** debe romper la operación de negocio salvo que
   la acción sea de seguridad (cambio de rol o permiso), donde sí es transaccional
   y bloqueante.
5. Retención sugerida: 180 días para `info`, indefinida para acciones de seguridad.

> `audit_logs` cubre también los eventos de autenticación y de seguridad mediante
> el prefijo de `action` (`auth.*`, `role.*`). Se separa en una tabla propia solo
> si el volumen o los patrones de consulta divergen de verdad.

### 5.3 Catálogo y ventas

| Tabla | Propósito | Relaciones |
|---|---|---|
| `categories` | taxonomía de productos | 1—N `products` |
| `products` | SKU, nombre, slug, precio, stock, specs | N—1 `categories` |
| `product_images` | galería | N—1 `products` |
| `carts` / `cart_items` | carrito persistido | N—1 `users`, `products` |
| `orders` | cabecera: totales, estado, referencias de Stripe, dirección | N—1 `users` |
| `order_items` | detalle con precio congelado | N—1 `orders`, `products` |
| `payment_methods` | tarjetas guardadas del cliente: `pm_…` (unique), marca, `last4` y caducidad | N—1 `users` |

Construido a 2026-09-07: `orders` y `order_items` (spec 007, migración `0004`).
`orders` guarda `subtotal_cents`, `shipping_cents` y `amount_total_cents` como
snapshot del importe cobrado, más `stripe_checkout_session_id` (unique) y
`stripe_payment_intent_id`. `order_items` congela nombre, imagen y precio: un
pedido pasado nunca relee `products`. `carts` / `cart_items` siguen pendientes —
el carrito vive en `localStorage` (Zustand) y el servidor solo recibe
`(productId, quantity)`.

Construido a 2026-09-09: `payment_methods` y `users.stripe_customer_id` (spec 009,
migración `0005`). De la tarjeta se guardan **solo** `brand`, `last4`, `exp_month` y
`exp_year`: ningún dígito más del PAN, ningún CVC y ninguna dirección de
facturación, porque Stripe no expone el IIN en una petición estándar y guardar más
del número nos metería en un alcance PCI del que hoy estamos fuera (spec 009, D-3).
El `unique` sobre `stripe_payment_method_id` es la idempotencia del webhook, y la
fila no se actualiza nunca: se inserta al guardar y se borra al eliminar, porque el
`detach` de Stripe es permanente e irreversible. El `cus_…` vive en `users` y no en
`payment_methods`: el Customer es del usuario, y hay que poder leerlo cuando
todavía no tiene ninguna tarjeta.

---

## 6. Módulos funcionales

### Cliente (storefront)
Catálogo con filtros y búsqueda · ficha de producto · carrito · checkout ·
historial y detalle de pedidos · tarjetas guardadas · perfil (Clerk).

Construido a 2026-09-09: catálogo y búsqueda (spec 004), ficha de producto
(spec 005), perfil (spec 006), **checkout con Stripe** (spec 007), **Mis
compras** (spec 008) y **Mis tarjetas** (spec 009). El pago usa
Stripe Checkout alojado en modo `payment`: `POST /api/checkout` relee precio y
stock de `products` —el request solo transporta `(productId, quantity)`— y
`POST /api/webhooks/stripe` es el **único** lugar donde una orden pasa a `paid`,
descuenta stock y escribe `order.paid` en `audit_logs`, todo en la misma
transacción e idempotente por `UPDATE … WHERE status = 'pending'`. El cliente
Stripe vive en `src/lib/stripe.ts` con `import 'server-only'`.

El historial del cliente vive dentro de `/account#compras` (spec 008), no en una
ruta propia: `GET /api/orders` devuelve los pedidos del usuario de la sesión con
sus líneas, filtrados por rango de fechas y agrupados por día en el navegador, y
`GET /api/orders/[id]/receipt` resuelve la boleta alojada de Stripe
(`Charge.receipt_url`) en cada apertura, porque esos enlaces caducan a los 30
días. Ninguno de los dos lleva código de permiso RBAC: la autorización es la
propiedad de la fila —el filtro por `user_id` va dentro del `WHERE`— sobre
`requireActiveUser()`, igual que `POST /api/checkout`. Pendientes del historial
de cliente: solo las rutas `/orders` y `/orders/[id]` con enlace permanente y
compartible por pedido, que se retoman cuando haga falta esa URL.

Las tarjetas guardadas viven dentro de `/account#tarjetas` (spec 009), cuarta
entrada de `ACCOUNT_SECTIONS`. El alta es la misma página alojada de Stripe que el
pago, pero con la Checkout Session en `mode: 'setup'` y `currency` obligatoria
—el SDK la exige en ese modo cuando no se fija `payment_method_types`—: ningún
dígito de la tarjeta entra en nuestro dominio. `POST /api/payment-methods/setup`
resuelve el Stripe Customer del usuario (`users.stripe_customer_id`, creado la
primera vez con `UPDATE … WHERE stripe_customer_id IS NULL` para que dos pestañas
no creen dos) y devuelve la URL. La fila la escribe **solo**
`POST /api/webhooks/stripe`, ramificando el `checkout.session.completed` que ya se
procesa por `session.mode === 'setup'`: no hay ningún evento nuevo que registrar en
el Dashboard. `GET /api/payment-methods` y `DELETE /api/payment-methods/[id]`
completan el listado y la baja (`detach` en Stripe + borrado físico). Los tres, como
`POST /api/checkout` y `GET /api/orders`, van sin código de permiso RBAC: la
autorización es la propiedad de la fila —el `user_id` dentro del `WHERE`— sobre
`requireActiveUser()`.

Antes de desplegar hay que registrar el endpoint de producción en el Dashboard
de Stripe (`checkout.session.completed`, `async_payment_succeeded`,
`async_payment_failed`, `expired`) y poner su `whsec_…` en
`STRIPE_WEBHOOK_SIGNING_SECRET`; en local lo cubre `stripe listen`.

`STRIPE_SECRET_KEY` necesita, además de lo que ya usaba el checkout, permisos de
**Customers (read y write)** y **Payment Methods (read y write)**: sin ellos la API
responde `403 more_permissions_required` y el alta de tarjeta devuelve `502`.
Comprobado el 2026-09-09 contra la clave restringida (`rk_test_…`) de `.env.local`,
a la que hoy le faltan los cuatro; `checkout_session_write` y `setup_intent_read` sí
los tiene. Se editan en el Dashboard, en la propia clave.

### Administración
Dashboard con métricas (Recharts: ventas, pedidos, top productos, stock bajo) ·
CRUD de productos y categorías (TanStack Table: paginación, orden, filtros) ·
gestión de pedidos y cambio de estado · listado de clientes.

Construido a 2026-09-02: categorías (spec 001), accesos y bitácora (spec 002) y
productos (spec 003). Pendiente: listado de clientes.

Construido a 2026-09-16: **panel de pedidos** (`/admin/orders`, spec 014), con los
permisos `orders.read` y `orders.update_status` —los dos primeros de `orders` en el
catálogo, que pasa de 15 a 17 códigos—. `GET /api/admin/orders` lista paginado por
offset (20 por página, orden `created_at desc, id desc`) con filtros de rango de
fechas, estado y búsqueda de cliente por correo, nombre, apellido y nombre completo;
`GET /api/admin/orders/[id]` devuelve el detalle con las líneas, la dirección de
envío parseada del jsonb y los ids de Stripe como texto.

El alcance es de **solo consulta** salvo una única mutación:
`PATCH /api/admin/orders/[id]` con `{ status: 'canceled' }`, que solo admite la
transición `pending → canceled`. Reutiliza el `markCanceled()` del webhook —el mismo
`UPDATE … WHERE status = 'pending'` que ya sostiene la idempotencia— y escribe
`order.status_changed` en `audit_logs` dentro de la misma transacción, con `changes`
limitado a `{ status }`: ni la dirección ni el correo del comprador entran en la
bitácora. Un estado distinto de `pending` responde `409` nombrando el estado actual,
no `400`: el cuerpo es válido y lo que está en conflicto es el recurso. No hay
migración: el enum `order_status` no crece, y `orders`, `order_items` y `users` se
leen tal cual estaban.

Fuera de alcance por decisión y no por olvido: fulfillment y estados de envío,
reembolsos, cancelación de pedidos `paid` (necesitaría reponer stock y llamar a
Stripe), enlaces al Dashboard de Stripe, exportación a CSV y métricas de ventas.

Construido a 2026-09-16: **dashboard de métricas** en la raíz del panel (`/admin`,
spec 015), bajo el permiso nuevo `dashboard.read` —el catálogo pasa de 17 a 18
códigos y lo reciben `super_admin`, `admin`, `manager` y `audit`—. Sin migración:
agrega sobre `orders`, `order_items` y `products` tal y como están.

`GET /api/admin/metrics` devuelve los cuatro bloques en una sola respuesta —tres
KPI con su variación, serie diaria, top 5 de productos y stock bajo— para un único
parámetro `period` (`today | 7d | 30d`, default `7d`). Las cuatro consultas se
lanzan en paralelo dentro del handler; los KPI del período y del anterior salen de
una sola consulta con agregados condicionales, y las sumas se castean a `::bigint`
porque `sum(amount_total_cents)` desborda el `int4` a partir de ~21 500 000 PEN
acumulados. Todas las lecturas de venta filtran `status = 'paid'`: lo que no se
cobró no cuenta, así que el dashboard puede mostrar menos pedidos que
`/admin/orders` para el mismo rango.

Los días se agrupan en **`America/Lima`** con desfase fijo de −05:00, no en UTC:
una venta de las 20:00 de Lima aparecería en el día siguiente y el KPI de «hoy»
estaría vacío hasta las 05:00. El rango se resuelve en el servidor como intervalo
semiabierto `[from, to)` y viaja en `meta` para que un error de huso sea visible en
la respuesta. La constante vale solo mientras el negocio opere en un país sin
horario de verano.

El umbral de stock bajo es constante (`LOW_STOCK_THRESHOLD = 10`, máximo 10 filas)
y el widget ignora el período: refleja el stock de ahora. El refresco es *polling*
de 60 s con `refetchInterval` de TanStack Query, sin refrescar en segundo plano;
no hay WebSockets ni SSE, y se descartaron a conciencia (spec 015, D-3). El
dashboard es de solo lectura y no escribe en `audit_logs`.

Fuera de alcance: rango de fechas libre, comparativa interanual, desglose por
categoría o cliente, exportación, enlaces del dashboard al detalle y métricas de
tráfico o conversión.

Gestión de accesos: CRUD de roles, matriz rol × permiso, asignación de roles a
usuarios · bitácora de auditoría filtrable por actor, entidad, acción y fecha.

Acceso admin protegido **en el recurso**: cada page, layout y Route Handler bajo
`/admin` y `/api/admin/` verifica por **código de permiso**
(`requirePermission('products.create')`), nunca por nombre de rol. Un recurso que
dependa solo del proxy es hallazgo bloqueante.

`src/proxy.ts` no lleva lógica de autenticación: solo `clerkMiddleware()` y su
`matcher`, que Clerk sigue necesitando para resolver la sesión. Las rutas son
públicas por defecto. El motivo lo documentan las dos fuentes:

- Next 16: Proxy no debe usarse como solución completa de gestión de sesión o
  autorización, y solo debe leer la cookie sin consultar la BD, porque corre en
  cada request incluidas las prefetch.
- Clerk 7: `createRouteMatcher` quedó deprecado porque el matching por ruta puede
  divergir del routing real y dejar recursos alcanzables. Además las Server
  Functions se invocan por id y no por ruta, así que ningún matcher puede
  protegerlas.

**Forma exacta de la verificación**, comprobada contra Clerk 7.8.2:

| Recurso | Sesión | Permiso | Sin sesión | Con sesión y sin permiso |
|---|---|---|---|---|
| Page / layout | `await auth.protect()` | `await requirePagePermission(<código>)` | `307` a `/sign-in?redirect_url=…` | `403` con `src/app/forbidden.tsx` |
| Route Handler | `const { isAuthenticated } = await auth()` + `401` explícito | `await authorize(<código>)` | `401` con `{ message }` | `403` con `{ message }` |
| Server Function | `await auth.protect()` | — | `401` (según la guía de Clerk; no verificado en este repo) | — |

En un Route Handler **no** se usa `auth.protect()` a secas: redirige con `307` al
login incluso cuando el cliente manda `Accept: application/json`, y axios acabaría
leyendo el HTML del formulario. El `401` con `{ message }` es la forma que espera
el interceptor de `src/lib/axios.ts`.

Las dos comprobaciones de permiso son distintas a propósito y **no se unifican**:

- `requirePagePermission()` (pages y layouts) llama a `forbidden()` de
  `next/navigation`, que corta el render y devuelve `403` con el boundary
  `src/app/forbidden.tsx`. Requiere `experimental.authInterrupts: true` en
  `next.config.ts`; sin ese flag, `forbidden()` lanza en tiempo de ejecución.
- `requirePermission()` (Route Handlers, vía `authorize()`) lanza `ForbiddenError`,
  que `toErrorResponse()` traduce al `403` con `{ message }` del contrato.
  `forbidden()` aquí no serviría: señaliza a través del router de Next y no produce
  el JSON que espera el interceptor.

Un recurso **sin código de permiso** —una operación de cliente, no administrativa,
como `POST /api/checkout`— usa `requireActiveUser()` en vez de `requireAuth()`.
`requireAuth()` no mira `is_active` a propósito: esa frontera la pone
`requirePermission()`, que resuelve el conjunto vacío para un usuario inactivo. Sin
permiso detrás no queda nadie que la ponga, y un usuario desactivado desde el panel
seguiría operando mientras su sesión de Clerk siguiera viva. `requireActiveUser()`
lanza `ForbiddenError` con `permission: null` → `403` con `{ message }`.

Verificado en este repo con una página sonda: `forbidden()` devuelve `403` y
renderiza el boundary, tanto en `next dev` como en el build de producción. El HTML
inicial llega vacío y el contenido entra por el payload RSC al hidratar —
comprobado en navegador, la página se ve.

---

## 7. Checklist de arranque

- [x] `create-next-app` ejecutado con las flags de la sección 2
- [x] Dependencias instaladas
- [x] Proyecto Neon creado y `DATABASE_URL` en `.env.local`
- [x] `drizzle.config.ts` apuntando a `src/server/db/schema`
- [x] Aplicación Clerk creada y claves en `.env.local`
- [x] `src/proxy.ts` con `clerkMiddleware()` y su `matcher`, sin lógica de auth
- [x] Verificación por código de permiso en cada recurso protegido, no solo en el proxy
- [ ] Webhook de Clerk (`user.created/updated/deleted`) sincronizando `users`
- [x] Seed de `permissions` y roles de sistema ejecutado (`npm run db:seed`)
- [x] `ClerkProvider` + `QueryProvider` en `src/app/layout.tsx`
- [x] `shadcn init` ejecutado y componentes base agregados
- [x] Estructura de carpetas de la sección 3 creada
- [x] `npm run typecheck`, `npm run lint` y `npm run build` en verde

Estado comprobado contra la base el 2026-09-02: 2 migraciones aplicadas, 7
categorías, 11 permisos, 6 roles y 31 filas de `role_permissions`, que coinciden
exactamente con `PERMISSIONS`, `ROLE_DEFINITIONS` y `ROLE_PERMISSION_MATRIX` de
`src/lib/permissions.ts`.

El único ítem sin marcar es el webhook: su código está escrito y compila
(`src/app/api/webhooks/clerk/route.ts`), pero `CLERK_WEBHOOK_SIGNING_SECRET`
está vacía en `.env.local` y el endpoint no se ha registrado en el dashboard de
Clerk, así que nunca se le ha visto sincronizar una fila. Se marca cuando corra
de verdad, no cuando exista el código (spec 002, T21).

Bootstrap del `super_admin` completado el 2026-09-02: `SEED_SUPER_ADMIN_EMAIL`
apunta a la cuenta de Clerk `nelsonnina`, su fila espejo existe en `users` y
`user_roles` le concede `super_admin`. El join real resuelve los 11 permisos de
11, así que `/admin/**` ya abre. La concesión dejó su entrada en `audit_logs`
(`user.roles_changed`, `actor_id` nulo porque el actor es el seed,
`metadata.source = 'db:seed'`), que es la primera fila que tiene la tabla.
