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
   contraseñas, tokens, claves de API, datos de tarjeta ni identificadores de personas
   naturales (DNI, RUC que empieza por `10`). Los campos sensibles se **excluyen**
   antes de serializar, no se enmascaran: no hay redacción ni truncado, la proyección
   simplemente no los enumera. El saneado se hace con una proyección positiva pura y probada
   —`toAuditableEmployee()` (018), `toAuditableProduct()` (021), `toAuditableExpense()`
   (024)— y nunca con un `delete` en el handler.
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
| `expenses` | gastos operativos registrados a mano: concepto, importe, categoría y día | N—1 `users` (`created_by_id`) |

Construido a 2026-09-21: `products.average_cost_cents` (spec 021, migración `0009`). Es la
**primera columna de costo del esquema**: hasta aquí `products` solo sabía a cuánto se
vende. Entra `integer` **nullable y sin `DEFAULT`**, y la nulabilidad es el contrato:
`null` significa «sin costo registrado» y es lo que apaga el margen en la pantalla de
precio unitario, mientras que un `0` diría «me costó gratis», que es una afirmación
distinta y falsa. Lleva el **tercer `CHECK` del esquema**,
`average_cost_cents IS NULL OR average_cost_cents > 0`: el promedio de valores positivos
nunca cae por debajo del menor de ellos, así que un `0` o un negativo solo puede venir de
un `psql` a mano o de una migración de datos, y ninguno de los dos pasa por Zod. Sin
índice: la columna no filtra, y el `average_cost_cents IS NULL` del `ORDER BY` se resuelve
con el mismo recorrido que ya hace `products_is_active_idx` (el índice parcial está
anotado como deuda en el spec 021 §11).

Solo **dos** caminos la escriben, y ninguno de los dos es el `PATCH` de productos: el
recálculo de una nota de `ingreso_compra` y `POST /api/admin/pricing/[id]/initial-cost`,
que exige que esté en `null`. La fórmula del promedio ponderado es normativa —con `S` el
stock previo, `C` el costo previo, `q` las unidades ingresadas y `c` el costo unitario de
la compra—:

```
nuevo = round( ( max(S, 0) × coalesce(C, c) + q × c ) / ( max(S, 0) + q ) )
```

Las tres piezas no son decorativas. `coalesce(C, c)`: sin costo previo el stock que había
se valoriza al precio de esta compra y el resultado colapsa exactamente a `c`, porque con
un solo número por producto no hay forma de valorizar solo las unidades entrantes.
`max(S, 0)`: **`products.stock` puede ser negativo** —`decrementStock` del webhook de
Stripe no lleva clamp (spec 007, D-10)— y un negativo en el numerador daría un costo por
debajo del pagado, o podría anular el denominador; tratarlo como `0` significa «no hay
existencias que promediar», con el efecto lateral de que tras una sobreventa el promedio
se recalcula como si el almacén estuviera vacío. El denominador es siempre `> 0` porque
`q ≥ 1`: no hay división por cero posible. El cálculo corre en `numeric` y se cierra con
`round(...)::integer` porque el numerador llega a 1e6 unidades × 1e8 céntimos = 1e14, que
desborda el `int4` y también el `float` con pérdida.

El recálculo vive **dentro del mismo `UPDATE` que mueve el stock**, como expresión sobre
las columnas y no como literal calculado en TypeScript (mismo criterio que
`buildStockChangeExpression`, spec 020 D-7): en un `UPDATE` todas las referencias del
`SET` ven los valores previos de la fila, así que leer, promediar en TypeScript y volver a
escribir dejaría que dos compras simultáneas del mismo producto perdieran una de las dos.
**Ningún otro tipo de transacción lo toca**: ni las salidas —el promedio es propiedad del
inventario que queda, no de lo que sale— ni `ingreso_devolucion` ni `ingreso_cambio`, que
devuelven mercadería ya comprada a su precio. La corrección de un promedio contaminado es
otra compra que lo vuelva a mover; no hay reversión.

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

Construido a 2026-09-17: `expenses` y el enum `expense_category` (spec 017,
migración `0006`). Es el primer concepto de gasto del proyecto: hasta aquí la base
solo conocía los ingresos. Ocho valores de enum —`suppliers`, `logistics`, `rent`,
`utilities`, `marketing`, `software`, `taxes`, `other`— y **ninguno de nómina**: los
salarios son el spec 018 y no se les reserva sitio (spec 017, D-4). `incurred_on` es
`date` con `mode: 'string'` y no `timestamptz`: un gasto ocurre un día, no en un
instante, y una columna sin hora no puede desplazarse de día al cruzar el huso;
`created_at` sigue siendo el instante del registro, que es otra cosa. Lleva el
**primer `CHECK` del esquema**, `amount_cents > 0`: un gasto negativo invertiría el
signo del resultado y el seed, una migración de datos o un `psql` a mano no pasan por
Zod. Sin ningún `unique` —dos facturas del mismo proveedor, el mismo día y por el
mismo importe son legítimas— así que ningún endpoint del módulo devuelve `409`. Un
único índice sobre `(incurred_on desc)`, que sostiene el filtro por rango y el orden
del listado. El borrado es **físico**: la tabla no tiene dependientes y un
`is_active` obligaría a que las tres consultas de agregado recordasen el filtro;
la traza queda en `audit_logs`, que es append-only (spec 017, D-7).

Construido a 2026-09-22: el enum `purchase_receipt_type` y **seis columnas de
comprobante** en `expenses` (spec 024, migración `0012`). Es el lado de **compras** del
IGV: hasta aquí el proyecto solo sabía el débito de ventas que produce
`electronic_documents` (§5.6), y sin saber qué gasto llegó con factura no hay contra qué
restarlo. Las seis son `receipt_type`, `supplier_ruc` (`varchar(11)`), `supplier_name`
(`varchar(160)`), `receipt_series` (`varchar(4)`), `receipt_number` (`varchar(20)`) e
`igv_cents` (`integer`), **todas nullable y sin `DEFAULT`**: `receipt_type IS NULL` es el
discriminador y significa «gasto sin comprobante formal», que es el estado de todo lo
registrado antes de esta migración. **No hay backfill y no lo habrá** (spec 024, D-16):
no se puede saber si un gasto de julio llegó con factura, y cualquier valor por defecto
sería una afirmación falsa sobre un hecho tributario.

`receipt_number` es **cadena y no `integer`** como `electronic_documents.number` (D-14):
aquel número lo genera el propio sistema, este se copia de un papel ajeno donde ya viene
con ceros a la izquierda, y `00001234` no es `1234` cuando hay que cotejarlo. Sin índice
nuevo (D-13) y sin `unique`: dos facturas distintas pueden compartir serie y número si
son de proveedores distintos, así que ningún endpoint del módulo devuelve `409`.

El enum se construye **desde el catálogo puro** `src/lib/purchase-receipts.ts` y no
repitiendo la tupla en el esquema, que es el patrón de `electronic-documents.ts` y
corrige de paso el riesgo que el propio spec 017 anotó sobre `EXPENSE_CATEGORIES`: dos
listas que deben decir lo mismo. Cuatro valores: `factura`, `boleta`,
`recibo_honorarios` y `otro`.

Llegan **cuatro `CHECK` nuevos** (los 017/020/021 sumaban tres en todo el esquema), y la
razón es la de siempre: el seed, una migración de datos y un `psql` a mano no pasan por
Zod, y un comprobante a medias contaminaría el número que el sub-proyecto de Impuestos
va a declarar.

- `expenses_receipt_all_or_nothing` — el comprobante es **todo o nada**: no existe un RUC
  sin tipo ni un tipo sin RUC ni sin razón social.
- `expenses_supplier_ruc_format` — solo la **forma** (`^[0-9]{11}$`). El dígito
  verificador se queda fuera a propósito: el módulo 11 exigiría crear una función en
  Postgres y esa comprobación ya vive en `isValidRuc()` (§5.6). Nótese que un `CHECK` se
  satisface cuando la expresión es `NULL`, así que `columna ~ patrón` deja pasar el
  `null` sin un `is null or` delante; es deliberado.
- `expenses_receipt_series_number_pair` — serie y número viajan juntos, y solo con
  comprobante.
- `expenses_igv_within_amount` — `igv_cents` es `null` o está en `[0, amount_cents)`. Con
  el 18 % incluido el IGV es ~15,25 % del total, así que un valor igual o mayor que el
  importe es dato corrupto. **Lo que este `CHECK` no atrapa es un IGV simplemente viejo**:
  el del importe anterior seguiría cumpliéndolo, y por eso el `PATCH` recalcula sobre el
  estado fusionado (abajo).

`igv_cents` lo escribe **solo el servidor**, con el mismo `splitIgv()` que las ventas del
spec 022, y ningún schema de entrada acepta el campo: no existe un cuerpo capaz de fijar
el impuesto. Se calcula **si y solo si** hay comprobante y su tipo es afecto según la
tabla de reglas; en cualquier otro caso es `null` y **nunca `0`**, porque cero
significaría «un IGV de cero» y eso es una afirmación distinta y falsa sobre un recibo
por honorarios (spec 024, D-5).

Las dos piezas puras que lo traducen viven en
`src/modules/finance/lib/expense-receipt.ts`. `resolveReceiptColumns()` es la del `PATCH`
y decide sobre el **estado fusionado** —el `before` que la transacción ya leyó para la
bitácora, más el cuerpo parcial— y no sobre lo que llega: corregir solo el importe de un
gasto que ya tenía factura es el caso frecuente, y sin recalcular quedaría el IGV del
importe viejo. Devuelve `null` cuando no hay nada que escribir, que es lo que hace que
**omitir `receipt` no borre el comprobante** mientras que `receipt: null` sí lo limpia.

Construido a 2026-09-23: `order_items.cost_cents_snapshot` (spec 027, migración `0013`).
Es el eslabón que faltaba entre el costo y la venta: hasta aquí `order_items` congelaba
nombre, imagen y precio, así que era imposible saber cuánto costó lo que se vendió en un
pedido. Entra `integer` **nullable y sin `DEFAULT`**, como `products.average_cost_cents`
(§5.3) y por el mismo motivo: `null` significa «sin costo registrado entonces» y un `0`
diría «me costó gratis», que es una afirmación distinta, falsa y que **infla la utilidad
bruta** justo en los productos peor registrados. Lleva su `CHECK`,
`cost_cents_snapshot IS NULL OR cost_cents_snapshot > 0`, con el criterio de siempre: un
`0` o un negativo aquí solo puede venir de un `psql` a mano o de una migración de datos.

Es el **cuarto `_snapshot` de la tabla y por la misma razón que los otros tres**: un pedido
pasado debe decir lo que costó *entonces*, no lo que costaría hoy, así que una subida del
costo promedio posterior **no reescribe** la línea ya vendida. Lo escribe
`snapshotItemCosts()` desde `fulfillCheckoutSession()`, **en la misma transacción en que se
descuenta el stock** y entre el descuento y `queueOriginalDocument`: es el instante en que
la venta se concreta —no el de crearse el carrito, así que el checkout sigue insertando las
líneas sin costo— y queda antes de la única operación que puede lanzar por datos del
comprador. Es un `UPDATE order_items SET cost_cents_snapshot = p.average_cost_cents FROM
products p WHERE …` de **una sola sentencia**, declarativa sobre `order_id`: no relee el
catálogo, no amplía el `RETURNING` de `decrementStock()` —que ya hace un UPDATE por línea y
duplicaría los viajes dentro de una transacción que compite con el corte de ~10 s de
Stripe— y **no lleva `coalesce`**, que es exactamente el bug que la columna existe para
evitar. La idempotencia la sigue dando el `markPaid` condicional: una reentrega del mismo
evento sale antes y la transacción entera no llega a ejecutarse dos veces.

**Sin backfill y no lo habrá** (spec 027, D-4). La migración es un `ADD COLUMN` a secas: los
pedidos fulfillados antes quedan en `null` para siempre. El `average_cost_cents` de hoy es
el de las compras registradas hasta hoy, no el vigente cuando aquellas ventas ocurrieron, y
rellenar produciría una utilidad histórica con aspecto de exacta y contenido inventado, que
es peor que una marcada como parcial. **Sin índice nuevo** (D-13): `order_items_order_id_idx`
es el que sostiene el join del COGS, y la columna se **agrega**, no se filtra, así que un
índice sobre ella no participaría en el plan.

### 5.4 Personal y nómina

| Tabla | Propósito | Relaciones |
|---|---|---|
| `employees` | planilla: código, nombre, apellido, cargo, fecha de ingreso, salario base en céntimos y baja lógica | 1—N `payroll_payments` |
| `payroll_payments` | bitácora de sueldos pagados: periodo mensual, fecha, importe congelado y anulación lógica | N—1 `employees` |

Construido a 2026-09-17: las dos tablas (spec 018, migración `0007`). Lo primero que
hay que dejar escrito es lo que **no** son, porque los nombres se parecen lo bastante
como para confundir a quien lea el código dentro de seis meses:

- `employees` **no tiene ninguna FK a `users`** ni exige cuenta de Clerk (spec 018,
  D-1). `users` responde «esta cuenta de Clerk existe» y `roles`/`permissions`
  responden «qué puede tocar en el panel»; ninguno de los dos dice nada sobre una
  relación laboral. Un empleado aquí es un registro puramente administrativo: si
  además esa persona entra al panel, se resuelve por invitación y roles (spec 002) y
  las dos filas no se conocen.
- El rol `employee` de `ROLE_DEFINITIONS` **no modela a un empleado**: su matriz de
  permisos está vacía y significa «cuenta de Clerk a la que no le concedemos nada en
  `/admin`». Nadie cobra por tener ese rol.
- La identidad del empleado la da `employee_code`, que teclea quien administra, igual
  que `products.sku`. **Sin DNI, sin dirección, sin teléfono, sin correo y sin datos
  bancarios** (D-2): el DNI es PII sensible y su única función aquí sería evitar
  duplicados, que es justo lo que hace el código de planilla con su `unique`.

`hired_at` y `paid_at` son `date` con `mode: 'string'`, no `timestamptz` (D-11): son
días del calendario, no instantes, y en modo string el valor entra y sale como
`'AAAA-MM-DD'` sin pasar por ningún `Date` con huso. **Ningún campo `Date` viaja en las
respuestas del módulo**, así que no hereda la deuda de `ProductWithCategory`.

`period` es `varchar(7)` con formato `'AAAA-MM'` y no un rango ni una columna `date`
(D-5): el ancho fijo hace que el orden lexicográfico sea el cronológico, y sobre todo
permite el invariante que de verdad importa —**un solo pago vivo por empleado y
mes**— como **índice único parcial** `where voided_at is null`. La cláusula parcial no
es decorativa: sin ella, anular un pago y volver a registrarlo sería imposible. Se
verificó en la base tras migrar: `CREATE UNIQUE INDEX
payroll_payments_employee_period_active_idx ON public.payroll_payments USING btree
(employee_id, period) WHERE (voided_at IS NULL)`.

`amount_cents` es un **snapshot** independiente de `employees.base_salary_cents`
(D-6), mismo criterio que `order_items` congelando el precio: una subida de sueldo en
octubre no puede reescribir lo que se pagó en septiembre. **Nada de este módulo se
borra**: el empleado se da de baja (`is_active = false`, con FK `restrict` desde los
pagos) y el pago se anula (`voided_at`), conservando su importe intacto.

### 5.5 Movimientos de inventario

| Tabla | Propósito | Relaciones |
|---|---|---|
| `transacciones` | catálogo semilla de 6 tipos de movimiento: `idtrans`, `nomtrans`, `tipotrans` (`ingreso` \| `salida`) | 1—N `inventory_documents` |
| `inventory_documents` | cabecera de la nota: correlativo, tipo, fecha de documento, documento de referencia y quién la registró | N—1 `transacciones`, N—1 `users`, 1—N `stock_movements` |
| `stock_movements` | detalle append-only: producto, unidades y stock con el que quedó | N—1 `inventory_documents`, N—1 `products` |

Construido a 2026-09-18: las tres tablas y el enum `tipo_transaccion` (spec 020,
migración `0008`). Es el libro mayor de movimientos que el spec 016 §11 dejó anunciado.

**`transacciones` es la única tabla del esquema con nombres físicos en castellano, y es
deliberado** (spec 020, D-2): el requerimiento nombra la tabla y sus tres campos de forma
literal, así que las columnas de Postgres son exactamente `idtrans`, `nomtrans` y
`tipotrans`, mientras que las propiedades de Drizzle son las idiomáticas del resto del
repo (`id`, `name`, `direction`). El mapeo columna↔propiedad es justo para lo que existe
el primer argumento de `varchar()`, y la excepción queda confinada a
`src/server/db/schema/transaccion.ts`. `direction` y no `type` porque los dos valores
describen un sentido y `type` competiría con la palabra reservada en cada `type X = …`
del módulo.

Se comporta exactamente como `permissions`: catálogo en código
(`src/lib/inventory-transactions.ts`), filas en la base, `db:seed` idempotente con
`onConflictDoUpdate`, y `isTransactionTypeCode()` descartando lo que no está en el código.
Su PK es de **texto** y no `uuid` (D-3): son 6 filas inmutables, el código es estable, el
seed es idempotente sobre la propia PK sin una cuarta columna que el requerimiento no
lista, y el tipo de TypeScript es la unión literal de los 6 códigos en vez de `string`.
Por eso **no hay endpoint para el catálogo** (D-4): el cliente lo conoce por ese módulo
puro y valida con `z.enum`, de modo que un tipo desconocido es `400` en el borde y no un
`500` por violación de clave foránea.

`doc_date` es `date` con `mode: 'string'` y no `timestamptz`, igual que
`expenses.incurred_on` y `payroll_payments.paid_at`: un documento se emite un día, no en
un instante. `reference` es **nullable** a propósito (D-8): no toda salida tiene papel
detrás. El correlativo `doc_number` es una **identidad de Postgres** y no un `MAX()+1` en
la aplicación (D-6) —la secuencia es lo único que aguanta dos altas simultáneas sin
carrera—, es único y compartido entre ingresos y salidas, y **deja huecos** cuando una
transacción revierte: el documento que falló no existió.

`stock_movements.quantity` es **siempre positiva** y el signo lo pone `tipotrans` del
documento (D-5). Cada línea guarda además `stock_after`, tal y como lo devolvió el
`RETURNING` del `UPDATE` (D-11): ya venía gratis, la línea se lee sola («salieron 5,
quedaron 3») y cualquier divergencia con `products.stock` queda a la vista. Lleva el
**segundo `CHECK` del esquema**, `quantity > 0`, y un índice único sobre
`(document_id, product_id)`: sumar dos líneas del mismo SKU es un error de captura, no un
caso de negocio. Las FK del detalle son `restrict` y no `cascade` como `order_items`
(D-10), porque la propiedad que hay que dejar escrita aquí es la contraria: un documento
con movimientos **no se puede borrar**.

**Las dos tablas son append-only**, como `audit_logs`: sin `updated_at`, sin `voided_at`,
sin `is_active` y sin ningún camino de `UPDATE` ni de `DELETE` desde la aplicación (D-9).
Un libro de inventario se corrige asentando el documento contrario, no tachando.

Construido a 2026-09-21: `stock_movements.unit_cost_cents` (spec 021, migración `0009`).
`integer` **nullable**, con el `CHECK` `unit_cost_cents IS NULL OR unit_cost_cents > 0`, y
es el importe que alimenta el costo promedio de `products.average_cost_cents` (§5.3). Solo
lo llevan las líneas de un documento **`ingreso_compra`**: una devolución o un cambio
devuelven mercadería que ya se compró a su precio, no una compra nueva (spec 021, D-2).

**El invariante «si el documento es `ingreso_compra` la línea lleva costo, y solo entonces»
no puede ser un `CHECK`**, y conviene tenerlo escrito: el tipo de transacción vive en la
cabecera (`inventory_documents.transaccion_id`) y un `CHECK` de fila no puede mirar otra
tabla. Lo sostienen el `superRefine` de `createInventoryDocumentSchema` —que cuelga el
error de `items[i].unitCostCents` para que el formulario lo marque en la línea que hay que
corregir— y el propio service, que es el único camino de escritura. Un trigger metería
lógica de negocio donde ningún test la cubre; poner `0` en los tipos sin costo sería
afirmar «me costó gratis» (spec 021, D-3). El código del tipo que exige costo vive en
`PURCHASE_TRANSACTION_ID` de `src/lib/inventory-transactions.ts`, y no como literal en las
tres piezas que lo comprueban.

La columna es **de solo escritura en este spec**: `findItems` enumera columnas
positivamente y sigue sin publicarla, así que `GET /api/admin/inventory/documents/[id]` no
devuelve el costo por línea (spec 021, D-11). El detalle del documento se abre con
`inventory.read`, que tienen `manager` y `audit`, y esos dos roles no tienen `finance.read`.
Leer el costo por línea es kardex valorizado y entrará con su propio permiso y su propia
proyección. Las líneas de `ingreso_compra` **anteriores** a la migración se quedan en
`null` para siempre: **no hay backfill**, no se inventa ningún importe retroactivo, y ese
hueco es exactamente lo que cubre el costo inicial manual.

### 5.6 Facturación electrónica

| Tabla | Propósito | Relaciones |
|---|---|---|
| `document_series` | catálogo semilla de 6 series con su correlativo: `key`, `series`, `last_number` | 1—N lógica con `electronic_documents` (sin FK: la serie viaja copiada a la fila) |
| `electronic_documents` | comprobante SUNAT: tipo, serie-número, importes con su desglose de IGV, estado de emisión y rastro del proveedor | N—1 `orders`, N—1 `users` (`created_by_id`), self-FK `related_document_id` |

Construido a 2026-09-22: las dos tablas, cuatro enums y cuatro columnas nuevas en `orders`
(spec 022, migración `0010`). Es el primer documento **fiscal** del esquema: hasta aquí lo
único que el cliente recibía era `Charge.receipt_url` de Stripe, que es un recibo del
procesador y no un comprobante de pago.

`orders` gana `buyer_document_type` (enum `dni`\|`ruc`), `buyer_document_number`,
`buyer_legal_name` y `refunded_amount_cents`. Las tres primeras son **nullable a
propósito** y no «notNull con default»: un default inventaría un DNI para los pedidos
anteriores a la migración, y `null` significa literalmente «este pedido no se puede
facturar». Llevan tres `CHECK` de fila —los tres datos viajan juntos o no viajan, la
longitud cuadra con el tipo (8 con DNI, 11 con RUC) y la razón social solo existe con
RUC—; el dígito verificador del RUC **no** es un `CHECK` porque es aritmética, y vive en
`src/modules/orders/lib/peru-document.ts`. `refunded_amount_cents` nace aquí con su
`CHECK` pero **la escribe el spec 023**: todo el esquema de las notas de crédito, las notas
de débito y la comunicación de baja se crea en esta migración para que 023 no lleve
ninguna, porque añadir un valor a un enum de Postgres es un `ALTER TYPE` que no puede
correr en la misma transacción que lo usa.

**El correlativo es nuestro y vive en `document_series`, no en una secuencia de Postgres**
(spec 022, D-5). El motivo es que `nextval` **no revierte**: un consumo dentro de una
transacción que después falla deja un hueco permanente en la numeración, y un hueco en la
correlatividad de comprobantes es un problema ante SUNAT, no una curiosidad. `nextNumber()`
es un `UPDATE … SET last_number = last_number + 1 … RETURNING`, que toma el lock de fila
—dos emisiones simultáneas salen con números distintos y consecutivos— y revierte con su
transacción. Exige `Tx` y no admite el `db` global. Verificado en la base: dos asignaciones
en paralelo dieron 1 y 2, y una transacción revertida devolvió el contador a su valor
previo. Seis claves y no cuatro porque SUNAT exige que la serie de una nota de crédito o de
débito empiece por la misma letra que el comprobante que corrige.

**Serie y número se asignan al crear la fila, no al recibir la respuesta del proveedor**
(D-6). Es la idempotencia del reintento: si un timeout corta la respuesta de un documento
que el OSE sí emitió, el siguiente intento manda **el mismo** par y el proveedor devuelve
el documento existente en vez de crear un duplicado ante SUNAT. Con el número asignado
después, cada intento sería un comprobante nuevo y la tienda declararía ventas que no
ocurrieron.

Cinco índices y siete `CHECK`. Los dos que sostienen el modelo:
`electronic_documents_one_original_per_order_idx`, único y parcial sobre `order_id` where
`kind in ('boleta','factura') and status <> 'voided'`, es la **barrera estructural de la
idempotencia del webhook** —aunque el `markPaid` condicional fallara en absorber una
reentrega, este índice impide la segunda boleta, y está comprobado en la base—; y
`electronic_documents_series_number_idx`, único sobre `(series, number)` where
`series is not null`, que es la correlatividad. El `CHECK` del desglose exige
`base + igv = amount` exactamente, cierto **por construcción** porque `splitIgv()` calcula
la base como `round(total / 1.18)` y el IGV como el **residuo**: calcular los dos por
separado deja, en ciertos importes, una diferencia de un céntimo, y un comprobante que no
cuadra consigo mismo lo rechaza SUNAT.

Corregido a 2026-09-22 (spec 023, migración `0011`): el `CHECK
electronic_documents_issued_at_matches_status` pasa de `(status = 'issued') = (issued_at is
not null)` a `(status in ('issued','voided')) = (issued_at is not null)`. Tal como nació en
`0010` impedía el `UPDATE … SET status = 'voided'` del original —una fila emitida lleva
`issued_at` relleno y el constraint exigía borrarlo—, así que la anulación del padre era
estructuralmente imposible. Es un defecto de `0010` que nadie pudo ver antes porque ningún
camino del spec 022 escribe `voided`. **Se corrige el constraint y no se borra la fecha**: un
documento anulado sí se emitió, y `issued_at` es la fecha con la que el libro de ventas lo
agrupa. La equivalencia sigue siendo exacta porque `markVoided()` lleva
`WHERE status = 'issued'`: un `pending` o un `failed` nunca llegan a `voided`.

`issued_at` es columna propia y **no se deriva de `updated_at`** (D-17): `updated_at` lleva
`$onUpdate`, así que cualquier escritura futura sobre la fila movería la fecha con la que
el libro de ventas agrupa el período, y un cambio no fiscal no puede mover una venta de
mes. `provider_response` guarda una **proyección acotada** de la respuesta del proveedor
—`aceptada_por_sunat`, descripción, nota, hash, errores y status— y nunca su cuerpo entero,
que incluye el eco del cuerpo enviado con el documento del comprador dentro.
`permanent_failure` **no es columna**: se deriva de `provider_response.errors`.

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
gestión de pedidos y cambio de estado · control de inventario con notas de ingreso y
salida · resumen financiero
con ventas confirmadas y declarables, registro de gastos operativos, crédito fiscal de
compras y la utilidad bruta, operativa y neta del período · precio unitario con costo
promedio y margen por
producto · impuestos con el IGV neto del período y la Renta RER estimada ·
personal y nómina · emisión manual de comprobantes electrónicos ·
listado de clientes.

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
enlaces al Dashboard de Stripe, exportación a CSV y métricas de ventas.

> **Derogado por el spec 023 (2026-09-22).** Este spec dejaba fuera «reembolsos» y
> «cualquier llamada a la API de Stripe», y el panel pasó a tener las dos cosas:
> `POST /api/admin/orders/[id]/adjust` devuelve dinero por Stripe bajo el permiso
> `orders.refund` y registra el documento SUNAT de corrección. Lo que sigue **sin**
> existir es cancelar un pedido `paid` como transición de estado: `order_status` no
> crece y un pedido devuelto se reconoce comparando `refunded_amount_cents` con
> `amount_total_cents`. El stock tampoco se repone. Detalle en §6, «ajuste de pedido».

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

Construido a 2026-09-17: **control de inventario** (`/admin/inventory`, spec 016),
bajo el permiso nuevo `inventory.read` —el catálogo pasa de 18 a 19 códigos y lo
reciben `super_admin`, `admin`, `manager` y `audit`—. Sin migración: lee `products`
y `categories` tal y como están.

`GET /api/admin/inventory` lista paginado por offset (20 por página) los productos
**activos** con `stock < LOW_STOCK_THRESHOLD`, con búsqueda sobre nombre y SKU y
filtro por categoría (centinela `all`). Los dos invariantes —`is_active = true` y el
umbral— viven dentro de `buildInventoryFilters()` y **no** son desactivables desde la
query: ningún parámetro puede convertir esta ruta en el catálogo entero. El orden es
fijo (`stock asc, name asc, id asc`) y no hay `sortBy`: la pantalla responde «qué
atiendo primero» y un orden elegible permitiría ocultar lo urgente.

El umbral es el **mismo** que usa el widget de stock bajo del dashboard, y por eso
`LOW_STOCK_THRESHOLD = 10` se mudó de `src/modules/dashboard/constants.ts` a
**`src/modules/products/constants.ts`**: «menos de N unidades» es una propiedad del
producto, no del dashboard. Sigue siendo global y provisional; hacerlo configurable
por producto o categoría es deuda declarada del spec 016 §11. No confundirlo con el
`CATALOG_LOW_STOCK_THRESHOLD = 5` de `product.repository.ts`, que es información
comercial para el comprador y se renombró justamente para que los dos nombres no
colisionen. El `status` de cada fila (`out | low | in`) lo deriva el servidor en
TypeScript con `resolveStockStatus()`, no con un `CASE` en SQL, y el umbral que usó
la consulta viaja en `meta` para que el rótulo no pueda decir otro número.

El alcance es de **solo lectura**: no hay ningún verbo de escritura en este recurso.
La única escritura de stock sigue siendo `PATCH /api/admin/products/[id]` bajo
`products.update`, que ya escribe `product.updated` en `audit_logs` dentro de su
transacción; la página reutiliza `ProductFormDialog` del módulo de productos en vez
de duplicar el formulario, y `useUpdateProduct()` invalida también el caché de
inventario para que la fila corregida desaparezca sin recargar. Quien tiene
`inventory.read` pero no `products.update` —el rol `audit`— recibe
`meta.canUpdateProduct: false` y la tabla no pinta la columna de acciones.

Fuera de alcance por decisión: tabla de movimientos de stock y su historial, umbral
configurable, edición en línea de la celda, órdenes de compra y reposición,
exportación a CSV y notificaciones de stock bajo.

Construido a 2026-09-17: **resumen financiero** (`/admin/finance`, spec 017), con
migración `0006` (tabla `expenses`, §5.3) y **cuatro** permisos nuevos —el catálogo
pasa de 19 a 23 códigos—: `finance.read` para las dos lecturas y
`expenses.create/update/delete` para las tres escrituras. No existe un
`expenses.read`: el listado de gastos es el detalle que hay detrás de la cifra
«Gastos» del resumen, no un recurso que se consulte por separado.

Es el **primer módulo del panel que no se concede a los cuatro roles que lo abren**:
solo `super_admin` y `admin`. `manager` y `audit` quedan fuera a propósito —el
primero opera catálogo y pedidos, el segundo revisa la bitácora, y el resultado del
negocio y lo que se paga a proveedores no forman parte de su trabajo—. La entrada
«Finanzas» desaparece de la navegación sin `finance.read`, y la página responde el
403 de `src/app/forbidden.tsx`.

Cuatro endpoints: `GET /api/admin/finance/summary` (ingresos, gastos, resultado,
margen y desglose por categoría) y el CRUD `GET`/`POST /api/admin/expenses` +
`PATCH`/`DELETE /api/admin/expenses/[id]`. El resumen y el listado son **dos rutas y
no una**: el listado pagina y se filtra por categoría, el resumen no, y con una sola
ruta pasar a la página 2 recalcularía los tres agregados del mes entero. El filtro de
categoría afecta solo a la tabla y **nunca** a los KPI —el endpoint de resumen ni
siquiera acepta el parámetro—, para que «resultado del período» signifique lo mismo
mientras se explora el detalle. Las tres mutaciones corren en `db.transaction` con
`logAudit()` dentro (`expense.created` / `updated` / `deleted`); el `before` del
`PATCH` se lee con el `tx`, y el `DELETE` guarda la fila completa en `changes.before`
con `after: null`, que es la única copia que queda del gasto borrado.

El rango es **libre por días**, con el mes en curso por defecto, resuelto en
`America/Lima` igual que el dashboard. Los dos extremos son inclusivos porque es como
los lee quien los teclea; la traducción a la ventana semiabierta sobre
`orders.created_at` la hace el servidor en un solo sitio, así que es imposible que el
resumen cuente un día de ventas distinto del de gastos. Por eso las primitivas de
reporting —`REPORTING_TIME_ZONE`, `REPORTING_UTC_OFFSET_MINUTES`,
`startOfReportingDay()`, `toReportingDayKey()`, `reportingDayStart()` y
`addReportingDays()`— se mudaron de `src/modules/dashboard/` a **`src/lib/reporting.ts`**:
«la zona horaria con la que el negocio corta sus días» no es una propiedad del
dashboard, y de paso `metrics.repository.ts` —código de servidor— dejó de importar de
un módulo de cliente.

Lo que este resultado **no** es, y la pantalla lo dice en su encabezado: no es
utilidad contable. No hay costo de mercadería vendida (`products` no tiene columna de
costo), ni nómina (spec 018), ni comisiones de Stripe, ni impuestos. Los ingresos son
`sum(amount_total_cents)` de los pedidos `paid`, envío incluido, para que la cifra de
ventas sea la misma que la del dashboard en el mismo rango. `marginPercent` vale
`null` —no `0` ni `Infinity`— cuando el rango no tuvo ingresos. Sin gráficos: el
desglose por categoría son barras de ancho porcentual en CSS, porque ocho categorías
con un importe cada una se leen mejor en una lista ordenada que en un donut.

Fuera de alcance por decisión: nómina y salarios (spec 018), costo de mercadería,
comisiones y reembolsos de Stripe, impuestos, multimoneda, adjuntos y proveedores como
entidad, gastos recurrentes, presupuestos y alertas, cierre contable de período,
exportación a CSV/PDF y búsqueda por concepto.

Ampliado a 2026-09-22: **crédito fiscal de compras** (spec 024, migración `0012`,
§5.3). **Ningún permiso nuevo** —el catálogo se queda en 29 códigos— y ninguna ruta
nueva: los tres endpoints tocados son los mismos de 017, que cambian de forma y no de
dirección. Es deliberado (D-12): declarar con qué comprobante llegó un gasto es una
extensión de un recurso ya protegido, no un recurso nuevo, y un permiso que separase
«registrar el gasto» de «declarar su comprobante» describiría un reparto de trabajo que
no existe. Sigue siendo un módulo de `super_admin` y `admin` solamente, y ahora con más
razón: el contenido incluye identificadores tributarios de terceros.

`POST`/`PATCH /api/admin/expenses[/id]` aceptan un `receipt` **anidado y nullable**, no
cinco campos planos (D-6). El objeto es lo que hace que el `PATCH` distinga sus tres
semánticas sin un centinela: con valor lo cambia, con `null` lo borra y **omitido no lo
toca**. Cuidado con un detalle de Zod 4 que el spec no había previsto: `.partial()`
envuelve el campo en `optional` pero **no elimina el `default(null)`** del schema de
alta, así que `updateExpenseSchema` redeclara `receipt` sin default. Heredarlo tal cual
haría que omitirlo llegara al handler como «bórralo» y que un cuerpo `{}` dejara de ser
vacío para el guard de «no hay nada que actualizar». Hay tests que fijan las dos cosas.

`GET /api/admin/finance/summary` gana `data.purchaseIgv` con cuatro números, y
`GET /api/admin/expenses` publica `data[].receipt` como objeto entero o `null`. Ninguno
de los dos añade una consulta: el comprobante sale del mismo `SELECT` del listado y los
cuatro agregados de IGV —dos sumas y dos recuentos con `FILTER`— de la misma pasada de
`findExpenseTotals()` (D-9). Al salir de la misma fila del mismo `SELECT` es imposible
que el total de gastos y el IGV del período se calculen sobre filtros distintos. Sin
`GROUP BY`, así que no entra en la clase de bug del `42803` del spec 015. El handler
deriva lo no deducible **por resta entera**, que no puede divergir de la suma.

La **regla de elegibilidad vive en un único sitio**, `src/lib/purchase-receipts.ts`, y es
una **tabla de dos banderas por tipo** (`carriesIgv`, `grantsTaxCredit`), no una lista de
elegibles (D-4). Son dos preguntas distintas —si el comprobante lleva IGV y si ese IGV es
crédito fiscal— y colapsarlas obligaría a suponer que todo lo que no da crédito tampoco
lleva IGV, que es **falso para la boleta**. El `TAX_CREDIT_RECEIPT_TYPES` que consume el
`inArray` del agregado se **deriva** de esa tabla, así que el SQL y la vista no pueden
discrepar, y no hay ningún `=== 'factura'` suelto en el código.

> **La tabla no está verificada contra la normativa SUNAT.** Su T1 era bloqueante y se
> cerró sin fuente: ninguna de las dos sesiones —la del spec ni la de implementación—
> tuvo acceso a la normativa. Los valores de arranque son los **conservadores**: solo
> `factura` otorga crédito fiscal, `boleta` lleva IGV pero no lo otorga, y
> `recibo_honorarios` no lleva IGV en absoluto por ser renta de cuarta categoría.
> Subdeclarar crédito fiscal es recuperable; sobredeclararlo es una infracción. Mientras
> no se confirme, **el sistema subdeclara a propósito**. Corregir una celda es editar ese
> objeto y su test, pero ojo con el efecto que no se ve: `igv_cents` se calculó al
> guardar, así que abrir la afectación de un tipo **no recalcula las filas ya
> registradas** y exige un `UPDATE` ejecutado a conciencia.

En la pantalla, el IGV de compras es una **cuarta tarjeta** cuyo valor principal es solo
lo que da derecho a crédito fiscal; lo que no lo da se publica aparte con su etiqueta y
**los dos números nunca se presentan sumados** (D-10): un único total invitaría a
descontar IGV de boletas, que es justo la infracción que la regla evita. El encabezado
dice que este número **no entra en el resultado del período**, y sigue siendo cierto tras
el spec 027: el IGV no resta en ninguno de los tres niveles de utilidad. El filtro de
categoría tampoco lo mueve, igual que el resto de los KPI. Restar este crédito contra el
débito de ventas es el sub-proyecto de Impuestos; el enganche está listo en
`purchaseIgv.creditableCents`, y el spec 027 lo reutiliza otra vez para los gastos netos.

El 18 % es una **aproximación declarada**: una factura con bienes exonerados dentro
declara más IGV del que corresponde, misma asunción que `splitIgv()` ya documenta para
las ventas. Lo que este spec añade es que la aproximación **no** se extiende a los tipos
que no son afectos en absoluto. Y el dato depende de que alguien lo teclee: un mes en el
que nadie declaró comprobantes se ve igual que un mes sin compras.

La bitácora **no** recibe el RUC. Los tres `logAudit()` —`expense.created`, `updated` y
`deleted`— pasan la fila por `toAuditableExpense()`
(`src/modules/finance/lib/expense-audit.ts`) antes de escribir `changes`: una proyección
positiva que enumera lo que sale, deja `supplier_ruc` fuera y conserva `supplier_name`
—razón social, no documento de identidad—, porque sin él la bitácora no diría de qué
proveedor se habla. El motivo es que un RUC que empieza por `10` es el de una persona
natural y lleva el DNI en sus ocho primeros dígitos: es PII, no solo un identificador
tributario, y `audit_logs` es append-only y la leen `manager` y `audit`, que tienen
`audit_logs.read` y **no** `finance.read`. Mismo patrón que `toAuditableEmployee()`
(spec 018, D-8) y `toAuditableProduct()` (spec 021, D-9); es lo que sostiene la
afirmación de más arriba de que el RUC no sale del módulo de `super_admin` y `admin`.
Por la misma razón `ExpenseMutated` **no** se amplió con el comprobante: solo alimenta el
toast, y publicar un RUC en una respuesta que nadie lee sería superficie gratis.

Fuera de alcance de esta ampliación, por decisión: catálogo de proveedores (RUC y razón
social son texto libre por gasto, como `concept`), validación en línea del RUC contra el
padrón de SUNAT —la comprobación es aritmética y offline: dice que el número no está
tecleado al azar, no que exista—, adjuntar el PDF del comprobante, retroactividad,
detracciones y retenciones, tasas distintas del 18 %, afectación por línea de gasto, y
filtro por comprobante o búsqueda por RUC en la tabla (D-15).

Ampliado a 2026-09-22: **ventas declarables** (spec 025). **Sin migración** —el journal
de `drizzle/` se queda en `0012_careful_cargill`— y **sin permiso nuevo**: el catálogo
sigue en 29 códigos y toda la pantalla sigue detrás de `finance.read`. Las tres columnas
que hacían falta (`issued_at`, `base_cents`, `igv_cents`) y los dos índices que sostienen
las consultas ya existían: el spec 022 los construyó por adelantado (§5.6). Ninguna ruta
nueva tampoco: `GET /api/admin/finance/summary` gana `data.declarableSales` y pasa de
tres lecturas en paralelo a cinco.

El módulo responde ahora «cuánto entró» con **dos** cifras que no coinciden y no tienen
por qué. **Ventas confirmadas** es la de siempre —`sum(amount_total_cents)` de los
pedidos `paid`, envío incluido— y solo cambia su etiqueta en la card: el campo del
contrato **sigue llamándose `revenueCents`** (D-3), porque renombrarlo movería tipo,
handler, repositorio, service, hook y dos componentes sin alterar un céntimo y rompería
cualquier caché de TanStack Query en vuelo durante el despliegue. **Ventas declarables**
es lo emitido ante SUNAT neto de correcciones, agregado sobre `electronic_documents` por
`issued_at` y nunca por `created_at` ni `updated_at` —`updated_at` lleva `$onUpdate` y
movería una venta de mes—. En este spec, `netCents` y `marginPercent` seguían restando los
gastos a las **confirmadas** (D-10); alinear el resultado con lo declarado era el
sub-proyecto #5, y lo hizo el spec 027: la utilidad cuelga hoy de las **declarables**.

**La regla de conteo es el punto delicado y se apartó del diseño aprobado.** Aquel
proponía restar toda nota de crédito `issued`, razonando que la `comunicacion_baja` no
resta porque ya deja `voided` al original. El razonamiento es correcto pero la baja **no
es el único documento que anula a su padre**: `voidsParent()`
(`src/modules/invoicing/lib/adjustment.ts`) devuelve `true` también para una nota de
crédito con motivo 01, 06, 02 o 03, y `voidParentAndReissue()` ejecuta ese `markVoided`
**dentro de la misma transacción** que emite la nota. Con la fórmula del diseño, una
anulación total fuera de ventana declara ventas **negativas** y una corrección de
comprador declara cero: dos de los cinco caminos de ajuste del spec 023 dan un número
falso, y el primero es el camino frecuente en cuanto pasan unos días.

La regla que se implementó es una sola, positiva y sin lista de motivos: **un documento
cuenta cuando está `issued`, su `issued_at` cae en el rango y la venta que documenta
sigue contando —es un original, o su padre sigue `issued`—**; el signo lo da el `kind`
(original `+`, nota de crédito `−`, nota de débito `+`). Da el número correcto en los
cinco caminos, absorbe la `comunicacion_baja` sin tratarla como caso especial —su padre
siempre queda `voided` al emitirse ella— y **no depende de los códigos de motivo**: si el
spec 023 cambiara qué motivos anulan, la consulta sigue valiendo. Vive en
`buildDeclarableFilter()` (`finance.repository.ts`), exportada para compilarla con
`PgDialect`, porque equivocarse ahí es declarar ventas que no existen.

El desglose sale de **una sola consulta** con auto-join al padre, agrupada por familia de
comprobante: la nota de crédito de una factura descuenta de facturas y nunca de boletas,
y el parentesco se lee de `related_document_id` y no de la letra de la serie (D-2). Se
agrupa y se ordena **por ordinal** (`group by 1`), que es la precaución que este mismo
repositorio dejó escrita tras el `42803` del spec 015: con un `coalesce` en el `SELECT`,
el ordinal es la única forma que no puede desalinearse. El total lo **deriva el handler
sumando el desglose**, no una segunda consulta, así que es imposible que el total y sus
partes discrepen. Solo aparecen las familias con al menos una fila contada, igual que
`expensesByCategory`. `base_cents` e `igv_cents` **no se publican** aunque existan desde
022: son el insumo del sub-proyecto #4, que decidirá cómo se agregan (D-13).

El indicador de salud cuenta los pedidos `paid` del rango sin comprobante original
`issued`, con un `NOT EXISTS` y en consulta aparte —no un `FILTER` dentro de
`findSalesTotals()` (D-6): un join en la consulta que calcula `sum(amount_total_cents)`
abre la puerta a que un cambio de condición duplique filas y falsee la cifra más mirada
del panel—. Mira «original `issued`», así que un pedido cuyo comprobante quedó `voided` y
cuyo reemitido sigue `pending` cuenta como pendiente, que es la verdad. No se pinta con
cero (D-12) y **enlaza a `/admin/orders` a secas**: aquella tabla guarda sus filtros en
`useState` y no lee la URL, así que una query string no filtraría nada y el enlace
prometería algo que no pasa (D-11).

Un riesgo que conviene tener escrito: **el período de una venta puede cambiar hacia
atrás**. Si una nota de crédito anulatoria de octubre deja `voided` un original de
septiembre, las ventas declarables de septiembre bajan al recargar. Es consecuencia
directa del modelo del spec 023 y contablemente lo discutible es el caso de la nota de
crédito —SUNAT la registra en **su** período—; corregirlo exige dejar de anular el padre
por nota de crédito, que es un cambio de 023. Hasta que el sub-proyecto #4 tenga que
producir un Registro de Ventas por período cerrado, la cifra es correcta como saldo vivo.

Fuera de alcance de esta ampliación, por decisión: el impuesto a pagar (cruzar esta cifra
contra el IGV de compras es el sub-proyecto #4), `base_cents`/`igv_cents` en la respuesta,
el KPI de ventas del dashboard (spec 015, que sigue con su definición), filtros por URL en
`/admin/orders`, ventas declarables por moneda, serie o vendedor, y exportación del
Registro de Ventas a CSV. **El Registro de Ventas y su exportación se construyeron
después**, en el spec 028 (`/admin/finance/accounting`, más abajo): el resto de esta lista
sigue fuera de alcance.

Construido a 2026-09-23: **impuestos** (`/admin/finance/taxes`, spec 026). Es la tercera
pantalla del módulo financiero y el sub-proyecto que cruza las dos mitades que 024 y 025
dejaron preparadas: el IGV que se cobró en las ventas menos el que se pagó en las compras
con derecho a crédito, y la Renta RER estimada sobre la base sin IGV de esas mismas
ventas. **Sin migración** —el journal de `drizzle/` se queda en `0012_careful_cargill`—,
**sin índice nuevo** y **sin permiso nuevo**: el catálogo sigue en 29 códigos y la
pantalla entera está detrás de `finance.read`, así que «Finanzas», «Precio unitario» e
«Impuestos» aparecen y desaparecen juntas de la navegación. Nada del esquema cambia:
`electronic_documents.base_cents` e `igv_cents` existen desde 022, `expenses.igv_cents`
desde 024, y los dos índices que acotan los rangos (`electronic_documents_issued_at_idx` y
`expenses_incurred_on_idx`) también. Un índice sobre `igv_cents` no participaría en el
plan: el crédito fiscal no **filtra** por esa columna, la agrega sobre las filas que el
rango ya selecciona (D-11).

Ruta y endpoint propios, `GET /api/admin/finance/taxes` (D-1): esta pantalla no consume
ninguno de los campos del resumen ni el resumen ninguno de estos, y compartir endpoint
haría que cada una pagara las lecturas de la otra. En este spec `/admin/finance` se quedaba
**exactamente como estaba** —sus cinco cards, `netCents` y `marginPercent` sin tocar—, y
alinear el resultado del período con los impuestos era el sub-proyecto #5: el spec 027 lo
cerró reutilizando estas dos piezas. El handler autoriza antes
de mirar la query, valida con el `financeRangeSchema` que ya existía y hace **dos**
lecturas en `Promise.all`.

Las dos lecturas son reutilización, no código nuevo, y ese es el punto de todo el spec.
El **débito fiscal** sale de `findDeclarableTaxTotals()`, que importa el mismo
`buildDeclarableFilter()` de las ventas declarables y solo cambia la columna que suma
—`igv_cents` y `base_cents` en vez de `amount_cents`—, sin `GROUP BY` porque el IGV se
declara junto y no por familia de comprobante. Importar el filtro en vez de copiar su
condición es lo que hace **estructuralmente imposible** que las ventas declarables y el
IGV débito discrepen sobre qué documento cuenta; los tests compilan el `WHERE` con
`PgDialect` y afirman que el texto es byte a byte el mismo. Es agregado propio y no una
ampliación de `findDeclarableSalesByKind()` porque aquella devuelve el tipo publicado
`DeclarableSalesByKind[]` y ampliarla filtraría base e IGV al contrato de `/summary`, que
025 dejó fuera a propósito (D-3). El **crédito fiscal** no tiene función nueva: se llama a
`findExpenseTotals()` tal cual y se leen dos de sus seis campos, así que el número de esta
pantalla es **el mismo** que el de la card «IGV de compras» del resumen, con la misma
tabla `TAX_CREDIT_RECEIPT_TYPES` aplicada (D-4).

`netCents` se publica **con signo** y la etiqueta la elige la vista (D-5): positivo es
«IGV por pagar», negativo es «Saldo a favor» por su valor absoluto y el cero tiene copy
propio, con etiqueta, icono y color en las tres ramas. Nunca un «por pagar» en negativo.
La Renta es `round(base × 150 / 10 000)` en **aritmética entera de puntos básicos** y no
`× 0.015`, que no es representable en binario (D-7), y vale `0` cuando la base no es
positiva —un rango cuyas notas de crédito superan lo emitido no genera «Renta a favor»—,
aunque la base sí viaja con su signo real al lado. La tasa **no viaja en la respuesta**:
vive en `RER_RATE_BASIS_POINTS` (`src/modules/finance/lib/rer.ts`), módulo puro que el
cliente importa para formatear el rótulo, mismo criterio que `grantsTaxCredit()` en 024
(D-8). Sin Recharts: son cuatro números y dos barras de ancho porcentual en CSS (D-12).

> **Dos valores normativos siguen sin confirmar.** La tasa de 1.5 % de RER no se pudo
> contrastar contra fuente en ninguna sesión, igual que la tabla de crédito fiscal del
> spec 024. La tasa vive en **una sola constante con su test**, así que corregirla es
> editar un número y una prueba; la tabla de compras arrastra además el efecto que no se
> ve —`expenses.igv_cents` se calculó al guardar y no se recalcula hacia atrás—.

Y hay que tenerlo escrito porque la pantalla presenta juntos dos números de distinta
calidad: el débito es **exacto** —`base_cents` e `igv_cents` son el desglose que se envió
al proveedor, con `base + igv = total` garantizado por `CHECK`—, mientras que el crédito
es una **aproximación** sobre un importe tecleado a mano. Restar un exacto menos un
aproximado da un neto aproximado, y el copy no presenta el neto como «lo que hay que
pagar»: el cálculo ignora retenciones, percepciones y detracciones, y asume que todo el
catálogo tributa al 18 % general. Dos avisos permanentes y **no condicionales** (D-13) lo
dicen en el encabezado: que el saldo a favor es informativo del rango y que este panel no
lo arrastra ni registra declaraciones presentadas, y que la Renta es un estimado mientras
que la declaración real es mensual exacta. Permanentes porque un aviso que aparece y
desaparece enseña a ignorarlo, y porque un rango elegido a mano no es un período
declarable aunque las fechas cuadren con un mes.

Fuera de alcance de este sub-proyecto, por decisión: registro de declaraciones presentadas
y cierre de período, arrastre automático del saldo a favor entre períodos (D-10), ajuste
anual de Renta y cambio de régimen (RMT, General), otros tributos y regímenes de retención
—ITAN, ESSALUD, ONP, cuarta categoría, detracciones, percepciones y retenciones de IGV—,
presentación ante SUNAT y exportación del Registro de Ventas y de Compras. **Los dos
registros y sus dos exportaciones llegaron con el spec 028** (más abajo); lo demás sigue
fuera de alcance, y en particular el registro de declaraciones presentadas: el CSV de 028
no es una declaración ni el PLE oficial.

Construido a 2026-09-23: **Ganancias v2** en `/admin/finance` (spec 027), con migración
`0013` (§5.3) y **ningún permiso nuevo**: el catálogo se queda en 29 códigos. Es el
sub-proyecto #5 y el más dependiente del roadmap —se apoya en 018, 021, 024, 025 y 026—, y
es exactamente lo que la advertencia del encabezado del spec 017 dejó pendiente: aquel
«resultado del período» era `revenueCents − expensesCents` y la propia pantalla llevaba un
spec entero diciendo que **no era utilidad contable**.

`netCents` y `marginPercent` **ya no existen** en `FinanceSummary` (D-11): se **reemplazan**
por `profit`, un estado de resultados de tres niveles. No coexisten, y no por prisa: dos
cifras de «ganancia» en la misma pantalla obligan a explicar cuál es la buena cada vez que
alguien la mira, y la vieja pierde siempre esa comparación. Ojo al homónimo —el `netCents`
de `IgvSettlement` (spec 026) es **otro campo de otro contrato**, el IGV por pagar del
período, y no se toca: son los dos únicos `netCents` del proyecto y comparten nombre sin
compartir significado—.

La cascada, toda en aritmética entera de céntimos y calculada en `buildPeriodProfit()`
(`src/modules/finance/lib/profit.ts`), módulo puro con test:

```
utilidadBruta     = ingresoNeto − cogs
utilidadOperativa = utilidadBruta − gastosNetos − nómina
utilidadNeta      = utilidadOperativa − rentaEstimada
```

**Lo decisivo es de dónde sale cada sumando, y la respuesta es «de lo que ya existía».** El
**ingreso neto** es `findDeclarableTaxTotals().baseCents` tal cual —la misma función del
spec 026—, así que es por construcción el mismo número que la base de Renta de
`/admin/finance/taxes`: no se deriva ninguna fórmula nueva, porque la del brainstorming era
la que el spec 025 ya había descartado. Los **gastos netos** son
`expensesCents − igvCreditableCents` de `findExpenseTotals()`, dos campos que salen de la
misma fila del mismo `SELECT` que el handler ya pedía: ni una consulta más, y la
elegibilidad la decide un solo sitio, `TAX_CREDIT_RECEIPT_TYPES`. La regla correcta no es
«lleva IGV» sino «**ese IGV vuelve como crédito fiscal**»: una factura resta solo su base;
una boleta, un recibo por honorarios, otro comprobante o un gasto sin comprobante restan su
importe completo. La **Renta** es `estimateRerIncomeTax()` sobre esa misma base. Solo hay
**dos funciones nuevas** en `finance.repository.ts`: `findCogsTotals()` y
`findPayrollTotals()`.

El **COGS** se ancla en el **comprobante original vigente** y nunca en `orders.created_at`:
el costo se reconoce en el mismo período en que se reconoce su ingreso. Importa el mismo
`buildDeclarableFilter()` y le suma `related_document_id is null` —lo que se reutiliza no es
la disyunción del padre, trivial para un original, sino el anclaje del período (`issued`
más la ventana de `issued_at` con extremo superior estricto)—, y los tests compilan las dos
con `PgDialect` afirmando que el texto es el mismo: si alguien copiara la condición, el
numerador y el denominador de la utilidad bruta divergirían en silencio. No abanica filas
porque `electronic_documents_one_original_per_order_idx` garantiza un solo original no
anulado por pedido. `costo × cantidad` se castea a `bigint` **antes** del producto, como
`LINE_REVENUE`: en `int4` el producto desborda antes que la suma. La **nómina** suma
`amount_cents` de los pagos con `voided_at is null` cuyo `paid_at` cae entre los dos días
**inclusive** —es una columna `date`, como `expenses.incurred_on`, no la ventana semiabierta
de los instantes—.

**El IGV no resta en ninguno de los tres niveles** (D-10) y la pantalla lo dice: la empresa
lo recauda del comprador y lo traslada a SUNAT, así que el ingreso base ya es `base_cents`
sin IGV desde la primera línea y restarlo otra vez al final sería contarlo dos veces. La
Renta sí es un impuesto **sobre** el resultado, y por eso separa la operativa de la neta.

**`null` se propaga como «parcial» y jamás se sustituye por `0`** (D-3). `sum` ignora los
nulos, así que una línea sin costo aporta `0` a la suma y `1` a `uncostedLineCount`: esa
asimetría es el dato, y la vista rotula el bloque como cálculo parcial con el conteo y un
enlace a `/admin/finance/pricing` —solo cuando el conteo es mayor que cero, porque una
advertencia permanente que casi siempre dice cero es ruido—. Los tres márgenes son `null`
con base **no positiva**, no solo con base cero: el guard vive en `profit.ts` y no dentro de
`marginPercent()`, que lo comparte con el margen unitario del spec 021, donde el precio
nunca es negativo. Con base negativa, `marginPercent()` devolvería un porcentaje de signo
invertido que afirmaría lo contrario de lo que pasó.

En la pantalla es un **bloque propio de ancho completo** y no tres cards más (D-12): los
niveles se leen en cascada, con sus sustraendos entre medias, y en cards sueltas se pierde
de dónde sale cada número. El signo se comunica con etiqueta, icono **y** color. La card
«Gastos operativos» sigue mostrando el importe **registrado** (D-8) —responde «cuánto salió
de caja», el número que cuadra con el banco—, y la rejilla vuelve a cuatro columnas. El
resumen pasa de cinco a ocho lecturas en `Promise.all`, todas independientes y acotadas por
índices existentes, así que el coste sigue siendo el de la más lenta.

Tres advertencias que conviene no perder. La utilidad bruta **será poco fiable durante
meses**, porque hoy casi ningún producto tiene `average_cost_cents`: es una señal operativa
—faltan compras registradas—, no un defecto del cálculo, y el día que alguien proponga
«poner cero mientras tanto», la respuesta es D-3. El **COGS no baja con una devolución**: el
spec 023 no repone stock, así que una nota de crédito parcial reduce el ingreso y deja el
costo entero. Y **ingreso y COGS no caen siempre en el mismo período**, porque el ingreso
incluye las notas emitidas en el rango aunque corrijan ventas de meses anteriores: es el
período contable de la nota, la deuda que 025 y 026 ya dejaron enganchada y que se retoma en
el primer spec que cierre períodos.

Fuera de alcance por decisión: costeo retroactivo y backfill, costeo por lote (FIFO/LIFO),
utilidad por pedido, producto o categoría, comisiones de pasarela como línea propia, otros
tributos que sí reducirían la neta —ESSALUD, entre otros—, y cierre de período, gráficos,
exportación y comparación entre rangos.

Construido a 2026-09-23: **contabilidad** (`/admin/finance/accounting`, spec 028). Es la
**cuarta pantalla** del módulo financiero y el último sub-proyecto del roadmap de Finanzas.
Es también la primera pieza que **no agrega nada al esquema** —`drizzle/` se queda en
`0013`, ninguna tabla cambia, ningún índice nuevo y ningún permiso nuevo: el catálogo sigue
en 29 códigos— y la primera que **exporta**. Las cuatro entradas de Finanzas del sidebar
van detrás de `finance.read` y aparecen y desaparecen juntas.

Las tres pantallas anteriores publican **agregados**; esta publica los **documentos**: una
fila por comprobante emitido (Registro de Ventas) y una por compra con comprobante
(Registro de Compras), en dos pestañas del mismo rango, paginadas y exportables a CSV. Los
índices existentes bastan: `electronic_documents_issued_at_idx` y `expenses_incurred_on_idx`
acotan los rangos, y los dos joins de ventas buscan por **clave primaria** (`orders.id` y
`p.id` del auto-join al padre). `receipt_type is not null` es un predicado residual sobre
las filas que el rango ya seleccionó, con el mismo criterio de 024 D-11.

**El Registro de Ventas NO reutiliza `buildDeclarableFilter()`, y es la decisión central
del spec** (028, D-1). No es la misma pregunta: aquel filtro exige «sin padre o padre
`issued`» para poder **sumar un neto**, y `voidsParent()` deja `voided` al original justo en
las anulaciones más frecuentes (motivos 01, 06, 02 y 03). Heredarlo **escondería del
registro precisamente esas notas de crédito**, que son documentos reales que SUNAT ya tiene.
Un registro lista documentos; un neto los compensa. La regla propia vive en
`buildSalesRegistryFilter()` (`accounting.repository.ts`) y su test compila las dos con
`PgDialect` afirmando que la del registro **no** contiene la disyunción del padre. Lo que sí
se comparte es la ventana —`issued` más `issued_at` en `[from, to)`, del mismo
`resolveFinanceRange()`—, para que un documento no pueda caer en el registro de un mes y en
el neto de otro. La consecuencia hay que tenerla escrita: **la suma del registro no cuadra
con «Ventas declarables», y no es un error**; el encabezado de la pantalla lo dice.

La `comunicacion_baja` **no es fila del registro**: no consume serie ni número propios ni
lleva importes —lo garantizan dos `CHECK`—, así que no hay nada que cruzar contra el SIRE.
La lista de tipos se **deriva** del catálogo, `NUMBERED_DOCUMENT_KINDS` en
`src/lib/electronic-documents.ts`, que es el mismo patrón de `ORIGINAL_DOCUMENT_KINDS` y
`TAX_CREDIT_RECEIPT_TYPES`: añadir mañana un `kind` con serie propia lo mete en el registro
sin tocar el módulo. El tipo y número de documento del comprador salen de **`orders`**, que
es donde están: `electronic_documents` no los guarda. El Registro de Compras **compone**
`buildExpenseFilters()` —los dos extremos inclusive sobre una columna `date`, no la ventana
semiabierta de los instantes— y deriva el crédito fiscal con `grantsTaxCredit()`, sin
publicarlo como campo del contrato: la tabla de elegibilidad es una sola y la leen igual el
CSV del servidor y la tabla del cliente. Los dos registros ordenan **cronológicamente
ascendente** con desempate total, al revés que el resto del módulo, porque un libro contable
se lee de la primera operación del período a la última.

Cuatro rutas, todas `GET` y todas bajo `finance.read`: `…/accounting/sales` y
`…/accounting/purchases` devuelven JSON paginado, y sus dos `…/export` devuelven
`text/csv; charset=utf-8` con `Cache-Control: no-store` —un archivo con RUCs, razones
sociales e importes no se queda en ninguna caché intermedia—. Rutas separadas y no un
`?format=csv` (D-13): un handler que devuelve JSON o texto según un query param mezcla dos
contratos de error. **La exportación no pagina ni trunca** (D-7): un registro contable
truncado en silencio es un registro incorrecto, y el rango de fechas es el límite; el día
que un rango tarde, la salida es streaming con `ReadableStream`, no un tope.

**Este spec fija el patrón de exportación del proyecto**, porque no había ninguno. Vive en
dos módulos puros: `csv.ts` (el serializador, sin nada de contabilidad) y `accounting-csv.ts`
(las dos tablas y el nombre del archivo). Las decisiones, que valen para cualquier
exportación futura: **UTF-8 con BOM** —sin él Excel en Windows rompe tildes y ñ—, `\r\n` de
RFC 4180, **coma** como separador y punto decimal —Perú usa el punto como decimal, así que
el separador de lista es la coma; el `;` sería la elección para España—, entrecomillado solo
cuando hace falta con las comillas internas duplicadas, e importes en soles con dos
decimales **sin símbolo ni separador de miles**, en aritmética entera: `S/ 1,234.56` llega a
Excel como texto y no se puede sumar, que es lo primero que hace quien abre el archivo. El
serializador **neutraliza la inyección de fórmulas** —un campo que no es un número y empieza
por `=`, `+`, `-`, `@`, TAB o CR se prefija con un apóstrofo—, con la excepción numérica que
deja pasar `-1234.56` como importe y no como texto; el guard vive en **una sola función con
test** y no repartido por cada celda.

La descarga va por **`axios` con `responseType: 'blob'`** desde el service, con su hook y su
`URL.revokeObjectURL`, y **no** por un `<a href="/api/…" download>` (D-6): el ancla es más
corta, pero con el atributo `download` el navegador **guarda igualmente el cuerpo de un
error**, y ante un 403 o un 500 el contador se queda con un `registro-ventas-….csv` que
dentro tiene un JSON. Por eso el copy del fallo es propio y no el del servidor: con
`responseType: 'blob'` el interceptor de axios no puede leer el `{ message }` del cuerpo. El
nombre del archivo lo construye **una sola función pura** para el `Content-Disposition` y
para el `a.download`.

**Ninguna lectura ni exportación escribe en `audit_logs`** (D-17): la tabla es append-only
para mutaciones y ninguna lectura del proyecto se audita hoy; empezar aquí instauraría un
patrón que nadie pidió. La superficie ya está acotada por `finance.read` y por el
`no-store`.

Fuera de alcance por decisión: el **formato PLE / TXT** de SUNAT y la integración con el
SIRE —SUNAT arma el registro oficial con lo que el OSE ya le reportó al emitir—, `.xlsx`,
Libro Diario, Libro Mayor y plan de cuentas, los comprobantes anulados como fila con estado
e importes en cero, totales al pie, gráficos, filtros por tipo de documento, serie o
proveedor, búsqueda, orden configurable, streaming de la exportación, exportación programada
o por correo, y un módulo `csv` compartido en `src/lib/`, que se mueve allí a la tercera
repetición y hoy tiene un solo dominio consumidor.

Construido a 2026-09-17: **personal y nómina** (`/admin/payroll`, spec 018), con
migración `0007` (§5.4) y **dos** permisos nuevos —el catálogo pasa de 23 a 25
códigos—: `payroll.read` para las dos lecturas y `payroll.manage` para las cinco
escrituras. Dos códigos y no siete (`employees.*` + `payroll.*` con CRUD cada uno)
porque no existe el rol que administre personal sin ver sus pagos; partir por
read/manage sí separa algo real y es lo que sostiene el `meta.canManage` de la UI.
El nombre del recurso es el dominio y no la ruta: por eso `/api/admin/employees` se
protege con un código `payroll.*`.

Como el resumen financiero, **solo `super_admin` y `admin`**. `manager` y `audit`
quedan fuera y aquí el motivo es más fuerte que en el 017: `audit_logs.read` lo tienen
`audit` y `manager`, y la vista de bitácora renderiza `changes` y `metadata` íntegros,
así que si una mutación de nómina escribiera un importe en el log, `/admin/audit-logs`
se convertiría en el listado de sueldos de la empresa para justo los roles a los que se
les acaba de negar el módulo. De ahí la regla dura del spec 018 (D-8): **ningún importe
entra en `audit_logs`**. Un cambio de salario se registra como
`metadata: { salaryChanged: true }`, nunca con las cifras, y el saneado no es un
`delete` suelto en el handler sino `toAuditableEmployee()`, una función pura con
proyección positiva y probada. El precio consciente es que la bitácora dice que el
salario cambió, quién y cuándo, pero no de cuánto a cuánto; si algún día hace falta ese
rastro, la salida es una tabla `employee_salary_history` protegida por `payroll.read`,
no relajar lo que entra en el log.

Siete endpoints: `GET`/`POST /api/admin/employees` + `PATCH`/`DELETE
/api/admin/employees/[id]` y `GET`/`POST /api/admin/payroll` + `DELETE
/api/admin/payroll/[id]`. Los dos `DELETE` son **lógicos** —baja del empleado y
anulación del pago—, idempotentes, y devuelven `200` con el recurso en su estado final:
repetirlos no escribe una segunda entrada en la bitácora. El CRUD de empleados se
orquesta en sus handlers, que tocan un solo repositorio, y los pagos en
`src/server/services/payroll.service.ts`, porque registrar un pago cruza
`employee.repository` (existe, está activo, cuándo ingresó) y
`payroll-payment.repository` (D-9). Las cinco mutaciones corren en `db.transaction` con
`logAudit()` dentro y `severity: 'warning'` —con `info` el alta se purgaría a los 180
días mientras sus pagos siguen ahí—.

Tres respuestas que conviene no confundir: pagar a un empleado **inactivo** es `409`
—el cuerpo es válido y lo que está en conflicto es el estado del recurso, igual que
cancelar un pedido que ya no está `pending`—; un `paidAt` anterior al ingreso es `400`;
y un segundo pago vivo del mismo mes es `409` nombrando el mes. Ese último invariante lo
sostienen **dos** piezas (D-19): la pre-comprobación dentro de la transacción, que
produce el mensaje con el mes, y el índice único parcial, que es lo que aguanta la
concurrencia. Un pago anulado no ocupa el mes, así que corregir un importe es anular y
volver a registrar; no hay `PATCH` sobre `payroll_payments`.

Periodicidad **solo mensual** y sin lógica de huso horario en el servidor (D-13): aquí
nada se deriva de `now()` —el periodo y la fecha de pago son datos de entrada
obligatorios del cuerpo— y el único instante que pone el servidor es `created_at`. Por
eso el módulo **no importa `src/lib/reporting.ts`**: hacerlo acoplaría la nómina a la
zona de corte del negocio sin necesitarla. Las fechas se pintan con `formatIsoDate()`,
que parte la cadena sin construir un `Date`, porque `new Date('2026-09-01')` es
medianoche UTC y en Lima se pintaría como 31 de agosto.

Una sola página con dos pestañas —Personal y Pagos— y una sola entrada «Nómina» en la
navegación, que desaparece sin `payroll.read` y cuya página responde el 403 de
`src/app/forbidden.tsx`. El pago se registra **desde la fila del empleado** y no desde
un selector en la pestaña de pagos: elimina el problema de listar cientos de empleados
en un `Select` y permite proponer el salario base como importe inicial sin una segunda
petición. La pestaña activa es estado local, sin Zustand y sin parámetro en la URL, así
que `/admin/payroll` siempre abre en «Personal».

Fuera de alcance por decisión: **motor de cálculo de nómina** (AFP/ONP, EsSalud, quinta
categoría, gratificaciones, CTS, asignación familiar, horas extra) —es un dominio legal
que cambia por norma y modelarlo mal tiene consecuencias legales, no de UX—, vínculo
empleado ↔ cuenta de usuario, portal del empleado, periodicidad quincenal o semanal,
edición de un pago ya registrado, borrado físico, recibos en PDF, exportación,
adelantos, préstamos, vacaciones y evaluaciones. La integración con el resumen
financiero (spec 017) —los pagos de nómina como línea de gasto— queda documentada como
deuda: el enganche es una lectura agregada desde el repositorio de nómina, expuesta por
una función de servidor y casteando a `::bigint`, nunca un import de tabla cruzado.

Construido a 2026-09-18: **notas de ingreso y de salida de inventario** (spec 020), con
migración `0008` (§5.5) y **un** permiso nuevo —el catálogo pasa de 25 a 26 códigos—:
`inventory.move`, para `super_admin`, `admin` y `manager`. La lectura de documentos
reutiliza `inventory.read`, así que `audit` ve los movimientos y no registra ninguno. Los
tres roles que reciben `inventory.move` son exactamente los que ya tenían
`products.update`, es decir, los que ya podían reescribir un stock a mano: el permiso no
concede nada que esos roles no pudieran hacer ya peor, solo una forma trazable de hacerlo.

Esto es lo que el spec 016 dejó fuera a propósito. Hasta aquí la única forma de corregir
un stock era teclear el entero final en `ProductFormDialog`, que deja un `product.updated`
en la bitácora pero no responde **por qué** un producto pasó de 40 a 3, con qué documento
y contra qué referencia.

Tres endpoints y ninguno de escritura más: `GET`/`POST
/api/admin/inventory/documents` y `GET /api/admin/inventory/documents/[id]`. **No hay
`PATCH` ni `DELETE`**: los documentos no se editan, no se borran y no se anulan, y la
corrección es una nota en sentido contrario (spec 020, D-9). El listado pagina por offset
(20 por página, orden `doc_date desc, doc_number desc`) y filtra por dirección —centinela
`all`—, por rango de días con ambos extremos inclusivos y por `reference` con
`escapeLikePattern`. Los agregados por documento (`itemCount`, `totalQuantity`) salen de
una **segunda consulta agrupada** sobre los ids de la página y no de un `LEFT JOIN …
GROUP BY` sobre la principal (D-14), que es la clase de bug del spec 015.

El `POST` es la única mutación y vive en `src/server/services/inventory-document.service.ts`
y no en el handler (D-12), porque cruza tres repositorios —`product`,
`inventory-document` y `audit-log`— y tiene reglas propias. Corre en **una sola
`db.transaction`** con `logAudit()` dentro (`inventory_document.created`,
`severity: 'info'`): el efecto en stock, la cabecera, sus líneas y la bitácora son cuatro
escrituras de la misma transacción, y si una revierte revierten todas. En la bitácora se
registra el documento —número, tipo, fecha y nº de líneas—, **nunca las cantidades por
producto** (D-19): el detalle vive en `stock_movements`, que es permanente, mientras que
un log `info` se purga a los 180 días.

El efecto en stock es un `UPDATE … SET stock = stock + $delta WHERE id = $id AND stock >=
$qty`, con el guard **solo en las salidas** y **dentro del `WHERE`** (D-7): leer, comprobar
en TypeScript y luego escribir dejaría una ventana en la que dos salidas simultáneas del
último producto pasarían las dos comprobaciones. Una salida sin stock suficiente es `409`
nombrando el producto, su stock y lo pedido, y **bloquea**: el stock nunca queda negativo
por esta vía (D-8). Es lo contrario de `decrementStock` en el webhook de Stripe, y a
propósito: allí el cobro ya ocurrió y el negativo es evidencia de una sobreventa real;
aquí hay una persona tecleando y una salida mayor que el stock es casi siempre un dígito
de más. Las líneas se aplican **ordenadas por `productId`** (D-18) para que dos documentos
simultáneos tomen los bloqueos en la misma secuencia y no se maten por deadlock.

**El webhook de Stripe sigue sin escribir en `stock_movements`** (D-13), y es una deuda
declarada, no un olvido: tocar el camino del cobro —idempotente, probado y con dinero real
detrás— para estrenar tres tablas es cambiar lo que funciona por lo que aún no tiene
rodaje. La consecuencia es que `sum(stock_movements)` **no** reconstruye el stock actual,
solo explica los movimientos manuales, y nadie debe programar como si lo hiciera;
`stock_after` hace visible la divergencia en la propia línea. El enganche natural es
`order-fulfillment.service.ts`, que ya corre en transacción y ya llama a `decrementStock`.

`/admin/inventory` pasa a tener **dos pestañas** —«Alertas de stock», intacta, y
«Movimientos»— y ninguna ruta ni entrada de navegación nueva (D-20): son dos vistas del
mismo dominio y del mismo permiso de lectura, igual que Personal y Pagos en nómina. La
pestaña activa es estado local, sin Zustand y sin parámetro en la URL. El documento se
registra desde un modal multi-línea con un buscador de producto que usa `Command` **en
línea**, sin `Popover` (D-15): un desplegable con el catálogo entero es inutilizable y no
hace falta ningún componente de shadcn nuevo. Los botones «Nota de ingreso» y «Nota de
salida» filtran los tipos ofrecidos por dirección, y la dirección **no viaja al servidor**:
la deriva del catálogo.

Fuera de alcance por decisión: edición, borrado y anulación de documentos; ajustes sin
documento («merma», «conteo») más allá de los 6 tipos del requerimiento; vínculo de la
salida por venta con su pedido; correlativo por serie; kardex por producto como pantalla;
valorización del inventario (`products` no tiene columna de costo, así que este módulo no
alimenta el resumen financiero del spec 017); almacenes múltiples; filtro por tipo
concreto, búsqueda por número de documento, exportación a CSV e impresión de la nota.

Construido a 2026-09-21: **precio unitario** (`/admin/finance/pricing`, spec 021), con
migración `0009` (§5.3 y §5.5) y **un** permiso nuevo —el catálogo pasa de 26 a 27
códigos—: `pricing.set_initial_cost`, solo para `super_admin` y `admin`. La lectura
reutiliza `finance.read`, así que la entrada «Precio unitario» aparece y desaparece de la
navegación junto a «Finanzas», y la página responde el 403 de `src/app/forbidden.tsx`.

Es el sub-proyecto #1 del roadmap de Finanzas y responde una pregunta que hasta aquí no
tenía respuesta en ningún sitio: **qué margen deja cada producto**. Ruta propia y no una
pestaña de `/admin/finance` (D-13): aquel resumen se mira por rango de fechas y esto es un
estado actual del catálogo, sin fechas, así que meterlos juntos obligaría a que el filtro
de rango de arriba no significara nada en una de las dos pestañas.

Dos endpoints: `GET /api/admin/pricing` —listado paginado por offset (20 por página) de
los productos **activos**, con precio, stock, costo promedio, margen en céntimos y margen
en porcentaje— y `POST /api/admin/pricing/[id]/initial-cost`. El orden es fijo, sin
`sortBy`: **«sin costo» primero**, luego nombre, luego id (D-14), porque lo primero que hay
que resolver para responder la pregunta es el producto al que le falta el costo, y el `id`
cierra el desempate para que la paginación sea estable. El único filtro es la búsqueda por
nombre y SKU, con `escapeLikePattern`. El margen lo deriva el **servidor** con
`unitMargin()`, que compone el `marginPercent()` del resumen financiero en vez de calcular
otro porcentaje (D-7): esa guarda `base === 0 → null` es la que salva el caso real de
`price_cents = 0`, que `createProductSchema` admite. Sin costo, `averageCostCents`,
`marginCents` y `marginPercent` son los tres `null` y la UI dice «Sin costo registrado»:
nunca `S/ 0.00` ni `0 %`.

El `POST` del costo inicial es para el stock que ya existía antes del spec, y es
**irrepetible**: `200` la primera vez y `409` la segunda, no un no-op. Va por un endpoint
propio y no por `PATCH /api/admin/products/[id]` (D-5), que se autoriza con
`products.update` —lo tienen `manager` y `admin`— y además permitiría **reescribir** el
costo, que es justo lo que este módulo prohíbe. La unicidad la sostiene el guard
`average_cost_cents IS NULL` **dentro del `WHERE`**, no un `if` previo: es lo único que
impide que dos peticiones simultáneas fijen dos costos distintos. Sin service dedicado:
cruza un repositorio y la bitácora, que es el caso del `PATCH` de productos y no el de la
nota de inventario. Registrar el costo **dentro de una compra** no necesita permiso nuevo
(D-6): esa captura la cubre `inventory.move`, que `manager` tiene, así que el encargado
anota lo que se pagó y no ve el margen que produce ni puede fijar un costo fuera de una
compra. Es la separación de funciones del módulo.

Tres decisiones existen **solo** para cerrar la fuga de datos financieros por caminos
laterales, y las tres nacen del mismo hecho verificado: `audit` tiene `audit_logs.read`,
`manager` y `audit` tienen `products.read` e `inventory.read`, y **ninguno de los dos tiene
`finance.read`**.

- **D-8**: `averageCostCents` queda fuera de `ProductWithCategory` vía
  `AdminProduct = Omit<Product, 'averageCostCents'>`. El `Omit` no es documentación: es lo
  que rompe el typecheck si alguien añade la columna a `PRODUCT_COLUMNS` o a
  `INVENTORY_COLUMNS` para reutilizar la proyección. La **única** lectura que sí publica el
  costo vive en `src/server/repositories/pricing.repository.ts`, en su propio archivo
  justamente para que reutilizarla por error sea imposible en vez de improbable.
- **D-9**: `toAuditableProduct()` retira el costo del `changes` de `product.created` y
  `product.updated`, que hasta aquí registraban las filas **enteras**. Sin eso, cualquier
  edición de producto copiaría el costo a `audit_logs`, que `audit` lee sin tener
  `finance.read` —la misma puerta trasera que el spec 018 documentó para los salarios—. Es
  una función pura, con proyección positiva y probada, no un `delete` suelto en el handler,
  y se aplica también a la **respuesta** del `POST`, del `PATCH` y del `DELETE` de
  productos, no solo al log.
- **D-10**: la bitácora del costo inicial (`product.cost_initialized`,
  `severity: 'warning'`) registra **qué** producto y **quién**, nunca el importe: ni en
  `changes` ni en `metadata`. `warning` y no `info` porque es irrepetible y no queda
  registrada en ninguna otra tabla, a diferencia del costo de una compra, que vive en
  `stock_movements`. La entrada de la nota de inventario tampoco cambia: sigue sin importes
  (spec 020, D-19).

La captura del costo entra en el modal de nota de inventario como una columna por línea que
aparece **solo** con «Ingreso por compra» seleccionado, observando el tipo con `useWatch`;
al cambiar de tipo desaparece y lo que quedara tecleado **no viaja** en el cuerpo. El
importe se teclea en soles y se convierte con `toCents` en el borde del formulario, como el
precio del producto. El costo se registra **tal y como se pagó, sin desagregar el IGV**
(D-12): separar la base imponible solo sirve para el crédito fiscal, que necesita el RUC
del proveedor y el número de comprobante —sub-proyectos #2 y #4—, y el importe único es el
que aparece en la factura que la persona tiene delante.

Lo que este número **no** es, y el encabezado de la página lo dice: es el promedio
ponderado de las compras registradas, no el costo del lote vendido, así que el margen es el
**potencial de la próxima venta** y no el realizado. **Desde el spec 027 ese costo sí entra
en el resultado de `/admin/finance`**: se congela por línea en
`order_items.cost_cents_snapshot` al confirmarse cada venta (§5.3) y alimenta el costo de lo
vendido de la utilidad bruta, así que la aproximación del promedio ponderado llega ahora
hasta la utilidad y el encabezado de aquella pantalla lo declara. Lo que **no** cambia es el
alcance del costeo por lote (FIFO/LIFO), que sigue fuera (D-1).

El riesgo principal queda declarado: **la aritmética del promedio vive en SQL y ningún test
unitario la ejecuta**. Se acepta a cambio de la atomicidad y se mitiga con tres cosas —el
test que compila la expresión con `PgDialect` y fija su forma, la verificación de los casos
numéricos contra la base real, y la fórmula escrita como contrato en §5.3—. Si algún día
entran tests de integración con base de datos, esos casos son los primeros que deben
migrarse allí. El promedio se almacena redondeado al céntimo, así que una cadena larga de
compras acumula un error de fracciones de céntimo; la alternativa, `numeric(12,4)`, rompería
la regla de céntimos enteros de todo el proyecto.

Fuera de alcance por decisión: FIFO, LIFO y costeo por lote (D-1); margen realizado
histórico por venta e integración con el resumen financiero (sub-proyecto #5); desagregar
el IGV del costo (#2 y #4); alertas y semáforos de margen bajo; edición o corrección del
costo promedio una vez tiene valor; valorización del inventario (`stock × costo`) como cifra
de la pantalla y kardex valorizado; backfill del costo de las compras históricas;
proveedores como entidad, precio de compra por proveedor, multimoneda y descuentos;
gráficos y exportación; y ordenación configurable y filtro por categoría en la tabla.

Construido a 2026-09-22: **facturación electrónica — emisión** (spec 022), con migración
`0010` (§5.6) y **un** permiso nuevo —el catálogo pasa de 27 a 28 códigos—:
`invoicing.issue`, solo para `super_admin` y `admin`. Recurso propio y no
`orders.update_status`, que lo tiene `manager` y solo concede cancelar un pedido
`pending`: emitir manda un documento fiscal a SUNAT con el RUC de la empresa, que es el
mismo criterio restrictivo del resto de finanzas. **Ver** los comprobantes no estrena
permiso: reutiliza `orders.read`.

**La emisión es manual y no existe ningún proceso programado.** Es la decisión central del
spec (D-8) y conviene que quede escrita aquí para que nadie la «arregle» más tarde: no hay
cron, no hay cola, no hay `waitUntil()`, no hay `vercel.json` y no hay ninguna ruta
`/api/cron/*`. El proyecto no tenía hoy ningún mecanismo de job y este módulo no estrena el
primero: un cron no habría sido «usar lo que ya hay» sino inaugurar una categoría entera de
infraestructura con su secreto compartido, su endpoint sin sesión y su ventana de
solapamiento. Además, emitir un comprobante fiscal es una acción con responsable, y que
quede registrado **quién** la disparó (`audit_logs.actor_id`) vale más que ahorrar un clic.
El precio asumido es que un comprobante puede quedarse sin emitir si nadie mira; se mitiga
mostrando su estado dentro del propio pedido, con la acción a un clic.

El flujo va en dos tiempos. El **webhook de Stripe** encola: `fulfillCheckoutSession()`
inserta la fila `pending` **dentro de la misma transacción** que el `markPaid` y **sin
ninguna llamada de red** —consume un correlativo e inserta, dos consultas cortas sobre la
conexión ya abierta—, así que no compite con el corte de ~10 s del webhook. Un pedido sin
`buyer_document_type` —anterior a la migración— no encola nada: deja `invoice.skipped` con
`severity: 'warning'` y el fulfillment sigue, porque emitir una boleta a nombre de nadie
sería un comprobante falso. `src/server/services/invoicing/index.ts` carga el proveedor con
`import()` **dinámico** justamente para que la cadena `nubefact.provider → invoicing-config`
—que lanza al importarse si falta una variable— no entre en el grafo del webhook: un
despliegue sin credenciales de Nubefact no debe dejar de fulfillar pedidos pagados.

Después, **una persona emite** desde el `Sheet` de `/admin/orders` con
`POST /api/admin/invoicing/documents/[id]/issue`, que es **la única puerta** y sirve por
igual para el primer intento (`pending`) y para cualquiera posterior (`failed`): sin
automatismo detrás son la misma operación sobre la misma fila, con el mismo par
serie-número, así que dos endpoints serían dos copias con un `if` distinto. El service
corre en **tres tramos y la llamada al proveedor nunca dentro de una transacción**: tx corta
de reclamo (`SELECT … FOR UPDATE` a secas, sin `SKIP LOCKED` —no hay cola que recorrer y que
el segundo administrador espere es lo correcto— más el incremento de `attempt_count`), la
llamada HTTP **fuera de toda transacción** —una llamada de segundos dentro de
`db.transaction` retiene una conexión del pool serverless de Neon, y un timeout revertiría
el `attempt_count` dejando la pantalla en «0 intentos» tras haber intentado— y una tx corta
que persiste el resultado con su `logAudit`.

Nubefact vive detrás de `InvoicingProvider`, una interfaz de un método:
**ningún nombre de campo suyo aparece fuera de `nubefact.provider.ts`**, que es también el
único archivo que divide por 100 —la interfaz habla en céntimos enteros—. El fallo se
clasifica en permanente o transitorio y la regla **no puede mirar solo el status**, porque
Nubefact devuelve rechazos de validación con HTTP `200` y un `errors` en el cuerpo: hay
`errors` ⇒ permanente; sin `errors`, `5xx` o red ⇒ transitorio, `4xx` ⇒ permanente. La UI
usa esa distinción para decir «volver a pulsar no lo arregla» en vez de invitar a un bucle
inútil. La bitácora registra pedido, tipo, serie, número y actor, y **nunca** el documento
del comprador, su razón social ni el texto del error, que puede citar de vuelta el RUC
rechazado: `audit` y `manager` leen la bitácora y la vista renderiza `metadata` íntegro.

`buyer_document_number` y `buyer_legal_name` **no salen por ninguna API**: ni el detalle de
admin ni el historial del cliente los publican, y la única proyección del repositorio que
los lee (`findFiscalSnapshot`) tiene un solo llamador, el service de emisión, cuyo destino
legítimo es el cuerpo que se envía a Nubefact. El comprobante se publica con la **misma
forma** para el panel y para «Mis compras» —es el comprobante del propio comprador— y el
recibo de Stripe **se conserva** junto a él: son dos cosas distintas, el documento fiscal y
la constancia del cargo, y el recibo cubre además la ventana en que el comprobante sigue
`pending`, que con emisión manual puede durar.

Fuera de alcance por decisión: cualquier proceso en segundo plano; emisión en lote; guías de
remisión; validación en línea de RUC/DNI contra RENIEC o el padrón de SUNAT; panel de
configuración del emisor —RUC, razón social y domicilio son variables de entorno validadas
al importar—; reenvío del comprobante por correo; multiserie por sucursal; resumen diario de
boletas; backfill de pedidos anteriores; y almacenar el XML y el CDR en vez de sus URLs.
Asunción declarada: **todo el catálogo tributa al 18 % general**, sin exonerados ni
inafectos.

Construido a 2026-09-22: **ajuste de pedido** (spec 023), con el permiso nuevo
`orders.refund` —el catálogo pasa de 28 a 29 códigos— que reciben solo `super_admin` y
`admin`. **Deroga la nota del spec 014** según la cual reembolsos y llamadas a la API de
Stripe quedaban fuera del panel de pedidos: `POST /api/admin/orders/[id]/adjust` devuelve
dinero de verdad. `manager` conserva `orders.update_status` y **no** recibe este permiso, y
esa es justamente la distinción que justifica un código aparte: cancelar un pedido `pending`
no mueve un céntimo —nunca se cobró— mientras que esto devuelve dinero real y prepara un
documento fiscal a nombre de la empresa. Los dos permisos de facturación —`invoicing.issue`
y `orders.refund`— se conceden a los mismos dos roles a propósito: quien decide una
devolución es quien después tiene que emitir su nota, y separarlos crearía el estado
«alguien devolvió dinero y nadie puede documentarlo».

El endpoint recibe una de **cuatro intenciones** —`anulacion_total`, `devolucion_parcial`,
`correccion_comprador` y `cargo_adicional`— en una **unión discriminada** con `strictObject`
en cada rama: cada intención declara exactamente lo que admite, y un `cargo_adicional` con
`buyer` dentro es un `400` de Zod en vez de un campo ignorado en silencio. El `reasonCode` se
valida contra el subconjunto de **su** intención (`REASONS_BY_INTENT`), no contra el catálogo
entero. **La UI elige la intención; el mecanismo SUNAT lo decide el servidor**
(`planAdjustment()`, puro y con test): si sale nota de crédito, nota de débito o comunicación
de baja es una regla fiscal, no una preferencia, y dejarla en un `<Select>` emitiría
documentos que SUNAT rechaza. `canVoidWithCommunication()` devuelve **`false`** mientras la
norma no se confirme, de modo que hoy se emite **siempre nota de crédito**: es el mecanismo
general, cubre todos los casos y nunca es inválido. Su firma recibe `original.issuedAt` —no
la fecha del pedido— porque con la emisión manual el plazo se cuenta desde la emisión, y
entre el cobro y ella pueden pasar días.

El orden es **leer, cobrar, escribir**, y la llamada a Stripe ocurre **fuera de toda
transacción**, igual que la del OSE. `tx A` toma `SELECT … FOR UPDATE` sobre el pedido,
valida —`paid`, original `issued`, saldo suficiente— y planifica; se suelta el lock; se crea
el refund; `tx B` escribe todo junto. Lo que sostiene la corrección es la **clave de
idempotencia derivada del estado**: `refund:${orderId}:${refundedBefore}:${amountCents}`, y
no un uuid. Así, dos intentos de *la misma* operación —porque la `tx B` falló, o porque dos
administradores pulsaron a la vez— producen la misma clave y Stripe devuelve el refund ya
creado en lugar de uno nuevo, mientras que un ajuste posterior legítimo parte de un
`refundedBefore` distinto y no se bloquea. La `tx B` cierra la carrera en el motor con
`UPDATE orders SET refunded = refunded + $x WHERE id = $1 AND refunded = $refundedBefore`:
cero filas significa «alguien se adelantó» y sale por `409` sin haber duplicado nada.

**`order_status` no crece**: el estado de reembolso se deriva comparando
`refunded_amount_cents` con `amount_total_cents`, y esa misma comparación es la que decide si
hay que **reencolar** un comprobante. Cuando el documento que anula a otro pasa a `issued`,
`persistSuccess()` marca el padre `voided` y, **si el pedido sigue cobrado**, encola un
comprobante original nuevo con los datos corregidos —en estado `pending`, pendiente de
emisión como cualquier otro—; todo dentro de la misma transacción, así que el índice único de
original vigente ve el `voided` ya escrito y no existe ningún instante sin comprobante
vigente. Una anulación total no reencola nada, porque el pedido quedó íntegramente devuelto,
y no hace falta ninguna columna de intención para distinguir los dos casos.

**El ajuste no emite nada.** Registra el documento de corrección `pending` en la misma tabla,
con su `related_document_id` apuntando al original, y emitirlo es la misma acción manual de
siempre: `POST /api/admin/invoicing/documents/[id]/issue`, sin un solo cambio. **Hay un único
camino de emisión en todo el sistema.** Encadenar Stripe y Nubefact en una sola petición
obligaría a decidir si un fallo del OSE revierte un reembolso que no puede revertirse. El
precio es un segundo clic, señalizado en el diálogo y en el sheet.

La bitácora escribe `order.refunded` o `order.adjusted` —dos hechos distintos— con
`severity: 'warning'`, y su `metadata` lleva pedido, intención, mecanismo, motivo e importes.
**Nunca** el documento del comprador, su razón social, el objeto `Refund` ni el
`payment_intent`. La corrección de comprador es el único camino del spec que escribe PII, y
va a `orders` y a ningún sitio más: no sale por la respuesta ni entra en el log.

**Corrección de esquema (migración `0011`)**: el `CHECK
electronic_documents_issued_at_matches_status` que creó la migración `0010` decía
`(status = 'issued') = (issued_at is not null)`, lo que hacía **imposible** anular el
original —un `UPDATE … SET status = 'voided'` sobre una fila con `issued_at` relleno lo
violaba—. Pasa a `(status in ('issued','voided')) = (issued_at is not null)`. La alternativa,
borrar `issued_at` al anular, habría destruido la fecha en la que ese comprobante se emitió
ante SUNAT: un documento anulado **sí** se emitió, y su período sigue siendo el suyo. La
equivalencia sigue siendo exacta porque `markVoided` lleva `WHERE status = 'issued'`, así que
un `pending` o un `failed` nunca alcanzan `voided`.

Fuera de alcance por decisión: **el stock no se repone** —devolver dinero no repone
mercadería; la devolución física se registra como nota `ingreso_devolucion` (spec 020), que
ya existe—; la nota de débito **no cobra nada** —documenta un mayor importe, y cobrar exigiría
método guardado y flujo SCA—; reembolso por ítem con recálculo de líneas; corrección de
comprador sobre pedidos con reembolso previo (el comprobante reemitido tendría que ser por el
neto, que no coincide con ninguna línea); reembolso iniciado por el cliente; reversión de un
ajuste desde la aplicación —lo que corrige un documento fiscal es otro documento—; y el
resumen de anulaciones automatizado, que se lanza desde el panel de Nubefact.

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
