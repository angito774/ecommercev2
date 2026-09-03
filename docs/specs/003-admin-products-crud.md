---
id: 003
title: CRUD de productos en el panel admin
status: in-progress
module: products
scope: admin
created: 2026-09-02
approved: 2026-09-02
---

# 003 — CRUD de productos en el panel admin

## 1. Contexto

`/admin/products` devuelve 404 hoy. No es una regresión: nunca se construyó. El
spec 001 lo excluyó por escrito —*"Cualquier cosa de productos (tabla, FK
`category_id`, UI): es la Fase 2"*— y dejó preparado el terreno: `categories` ya
existe y está sembrada con 7 filas, `src/components/shared/data-table.tsx` es
presentacional y reutilizable sin tocarlo, y `src/hooks/use-debounce.ts` es
transversal. `src/modules/products/` existe con las cinco carpetas vacías que
creó el bootstrap.

`docs/SETUP.md` ya reserva la ruta (§3) y define la tabla (§5): *"SKU, nombre,
slug, precio, stock, specs; N—1 `categories`"*.

Lo que **no** está previsto en ningún sitio y es el trabajo menos obvio de este
spec: **`src/lib/permissions.ts` no contiene ningún `products.*`**. El catálogo
son 11 permisos y ninguno cubre productos. Así que esto no es "otro CRUD"
copiado del 001: amplía el catálogo de autorización, la matriz rol × permiso y
obliga a re-ejecutar el seed.

## 2. Objetivo

Un usuario con los permisos correspondientes puede crear, listar, buscar,
filtrar por estado y por categoría, ordenar, editar y desactivar productos desde
`/admin/products`, con la tabla resuelta en servidor y cada mutación registrada
en `audit_logs`.

## 3. Alcance

### Incluye

- Tabla `products` + migración Drizzle, con FK a `categories`.
- Cuatro permisos nuevos (`products.read/create/update/delete`), su matriz rol ×
  permiso y el seed correspondiente.
- Seed de 6–8 productos de tecnología repartidos entre las categorías activas, al
  menos uno inactivo y al menos uno con `stock = 0`.
- `product.repository.ts` con listado paginado, búsqueda, filtros, orden, lectura
  por id, creación, actualización y soft delete.
- Route Handlers bajo `/api/admin/products`, con `authorize()` y validación Zod.
- Módulo cliente `src/modules/products/` completo.
- Página `/admin/products` y su ítem de navegación, filtrado por permiso.
- Acciones de auditoría `product.created`, `product.updated` y
  `product.deactivated`, visibles en lenguaje llano en `/admin/audit-logs`.
- Estados de carga, vacío, sin resultados y error. Confirmación antes de
  desactivar.

### No incluye (explícito)

- **`product_images` (galería).** La imagen se captura como una URL de texto,
  igual que en categorías. La galería y el blob storage van juntos, en su spec.
- **Catálogo público del storefront** (`/products`, `/products/[slug]`,
  `/api/products`). Los enlaces del header siguen retirados hasta entonces.
- Carrito, checkout, pedidos, dashboard de métricas.
- Borrado físico de productos.
- Acciones en lote, importación/exportación CSV.
- Control de stock transaccional (reservas, decremento al comprar). Aquí `stock`
  es un número que se edita a mano.
- Persistencia de filtros en la URL — misma deuda que arrastra el 001.

## 4. Criterios de aceptación

- [x] **AC1** — Dado un usuario con `products.read` en `/admin/products`, cuando
  la página carga, entonces ve una tabla con SKU, Nombre, Categoría, Precio,
  Stock, Estado y Acciones, paginada de 10 en 10.
- [x] **AC2** — Dado el buscador, cuando el usuario escribe, entonces tras 300 ms
  la tabla muestra los productos cuyo `name` **o** `sku` contiene el texto
  (case-insensitive) y la paginación vuelve a la página 1.
- [x] **AC3** — Dado el filtro de categoría, cuando el usuario elige una,
  entonces la tabla lista solo los productos de esa categoría; el valor por
  defecto es `Todas`. El desplegable ofrece únicamente categorías activas.
- [x] **AC4** — Dado el filtro de estado (`Todos`, `Activos`, `Inactivos`),
  entonces la tabla filtra por `is_active`, con `Todos` por defecto.
- [x] **AC5** — Dados los encabezados ordenables (Nombre, Precio, Stock, Creado),
  cuando el usuario hace clic, entonces el orden se resuelve en servidor y
  alterna asc/desc.
- [ ] **AC6** — Dado el formulario de creación, cuando el usuario escribe el
  nombre y no ha tocado el slug, entonces el slug se autocompleta en kebab-case;
  si lo edita a mano, deja de autocompletarse. Mismo comportamiento que en
  categorías.
- [x] **AC7** — Dado un precio escrito como `1299.90`, cuando se guarda, entonces
  la base almacena `price_cents = 129990` y la tabla vuelve a mostrar
  `S/ 1,299.90`. **Ningún punto flotante llega a Postgres.**
- [x] **AC8** — Dado un precio con más de dos decimales (`10.999`), cuando el
  usuario envía, entonces el formulario muestra un error junto al campo y no se
  emite la petición.
- [x] **AC9** — Dado un SKU ya existente, cuando se intenta guardar, entonces la
  API responde `409` y el formulario marca **el campo `sku`**, sin cerrar el
  diálogo. Dado un slug ya existente, el `409` marca **el campo `slug`**. Los dos
  casos se distinguen: no basta con un mensaje genérico.
- [x] **AC10** — Dado un `stock` negativo o no entero, entonces el formulario lo
  rechaza y la API responde `400` si se fuerza la petición.
- [x] **AC11** — Dada una `category_id` que no existe, cuando se envía a la API,
  entonces la respuesta es `400` con un mensaje que nombra el campo, no un `500`
  de violación de clave foránea.
- [x] **AC12** — Dado el botón Desactivar, cuando el usuario confirma, entonces
  el producto queda con `is_active = false`, sigue en la base, la tabla se
  refresca y aparece un toast.
- [x] **AC13** — Dado un producto inactivo, cuando se edita y se marca Activo,
  entonces vuelve a `is_active = true` sin endpoint propio.
- [ ] **AC14** — Dado un usuario con sesión y **sin** `products.read`, cuando
  abre `/admin/products`, entonces recibe `403` con `src/app/forbidden.tsx`, y el
  ítem Productos no aparece en la navegación.
- [ ] **AC15** — Dado un `manager`, cuando abre `/admin/products`, entonces puede
  crear, editar y desactivar. Dado un `audit`, ve la tabla pero **sin** botón de
  crear ni acciones de fila.
- [x] **AC16** — Dada cualquier mutación, entonces `audit_logs` recibe su entrada
  en la **misma transacción**, con el actor correcto, y `/admin/audit-logs` la
  muestra como "Producto creado/editado/desactivado", no como código crudo.
- [x] **AC17** — Dado que la consulta falla, entonces la vista muestra error con
  reintento, nunca una tabla vacía silenciosa. Sin productos, el estado vacío
  ofrece "Crear producto"; con filtros sin resultados, ofrece "Limpiar filtros".
- [x] **AC18** — Dado `npm run db:seed` ejecutado dos veces seguidas, entonces no
  duplica productos, permisos ni asignaciones, y no falla.
- [x] **AC19** — `npm run typecheck && npm run lint && npm run build` en verde al
  cierre de **cada fase**.

## 5. Modelo de datos

### 5.1 Tabla `products` (nueva, requiere migración)

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | `uuid` | PK, `defaultRandom()` |
| `sku` | `varchar(60)` | not null, **unique** |
| `name` | `varchar(160)` | not null |
| `slug` | `varchar(180)` | not null, **unique** |
| `description` | `text` | nullable |
| `image_url` | `varchar(500)` | nullable |
| `price_cents` | `integer` | not null — **céntimos, nunca decimal** |
| `stock` | `integer` | not null, default `0` |
| `specs` | `jsonb` | nullable, `.$type<Record<string, string>>()` |
| `category_id` | `uuid` | not null, FK → `categories.id`, `onDelete: restrict` |
| `is_active` | `boolean` | not null, default `true` — soft delete |
| `created_at` | `timestamptz` | not null, default `now()` |
| `updated_at` | `timestamptz` | not null, default `now()`, `$onUpdate` |

Índices: `products_sku_unique`, `products_slug_unique` (constraints),
`products_category_id_idx`, `products_is_active_idx`,
`products_created_at_idx` (desc).

Sin índice para la búsqueda: `ILIKE '%texto%'` sobre `name` y `sku` no lo
aprovecha. Es la misma deuda que el 001 y aquí importa más, porque productos sí
crecerá (§10).

`onDelete: restrict` en la FK es documentación tanto como restricción: las
categorías se desactivan, no se borran, así que hoy no hay camino que dispare la
restricción. Deja escrito que un borrado físico de categoría no debe poder dejar
productos huérfanos.

### 5.2 Catálogo de permisos ampliado

Cuatro códigos nuevos en `src/lib/permissions.ts`, que pasa de **11 a 15**
permisos:

| `code` | `resource` | `action` | Descripción |
|---|---|---|---|
| `products.read` | products | read | Ver el listado y el detalle de los productos. |
| `products.create` | products | create | Crear productos nuevos. |
| `products.update` | products | update | Editar productos existentes. |
| `products.delete` | products | delete | Desactivar productos. |

Matriz rol × permiso (decisión del usuario, 2026-09-02: **idéntica a
categorías**, para que el panel conserve una sola regla mental — quien gestiona
el catálogo lo gestiona entero):

| Rol | read | create | update | delete |
|---|---|---|---|---|
| `super_admin` | ✓ | ✓ | ✓ | ✓ |
| `admin` | ✓ | ✓ | ✓ | ✓ |
| `manager` | ✓ | ✓ | ✓ | ✓ |
| `audit` | ✓ | — | — | — |
| `employee` | — | — | — | — |
| `customer` | — | — | — | — |

`role_permissions` pasa de 31 a **44** filas (super_admin 15, admin 14,
manager 10, audit 5).

El seed ya soporta este cambio sin tocarlo: `seedPermissions` usa
`onConflictDoUpdate` y propaga los códigos nuevos, y `seedRolePermissions` usa
`onConflictDoNothing`, así que inserta las asignaciones que falten sin duplicar
las existentes. **Verificar, no asumir**: es lo que mide AC18.

### 5.3 Semilla de productos

6–8 filas repartidas entre las categorías activas, idempotentes por `sku`. Al
menos una con `is_active: false` y al menos una con `stock: 0`, para que los
filtros y el indicador de stock tengan qué mostrar sin crear datos a mano.

## 6. Contratos de API

Base `/api/admin/products`. Forma de error `{ message }`, más `{ message, issues }`
en los `400` de Zod. **401 = sin sesión, 403 = con sesión y sin permiso**, vía
`authorize()` y `toErrorResponse()` de `src/lib/api-guard.ts`.

| Método | Ruta | Permiso | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/products` | `products.read` | query: `q`, `status`, `categoryId`, `page`, `pageSize`, `sortBy`, `sortDir` | `ProductListResponse` | 400, 401, 403, 500 |
| POST | `/api/admin/products` | `products.create` | `CreateProductInput` | `201` `Product` | 400, 401, 403, 409, 500 |
| GET | `/api/admin/products/[id]` | `products.read` | — | `ProductWithCategory` | 400, 401, 403, 404, 500 |
| PATCH | `/api/admin/products/[id]` | `products.update` | `UpdateProductInput` | `Product` | 400, 401, 403, 404, 409, 500 |
| DELETE | `/api/admin/products/[id]` | `products.delete` | — | `Product` (con `isActive: false`) | 400, 401, 403, 404, 500 |

### Schemas Zod

```ts
// src/modules/products/schemas/product.schema.ts
export const productSlugSchema = z
  .string().trim().min(2).max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones');

export const skuSchema = z
  .string().trim().min(2).max(60)
  .regex(/^[A-Z0-9][A-Z0-9-]*$/, 'Solo mayúsculas, números y guiones');

// El formulario captura el precio en unidades ("1299.90") y la API lo recibe ya
// en céntimos. La conversión vive en un único sitio (§8) para que no haya dos
// verdades sobre dónde deja de ser decimal.
const productFields = z.object({
  sku: skuSchema,
  name: z.string().trim().min(2).max(160),
  slug: productSlugSchema,
  description: z.string().trim().max(2000).nullable(),
  imageUrl: z.url().max(500).nullable(),
  priceCents: z.number().int().min(0).max(99_999_999),
  stock: z.number().int().min(0).max(1_000_000),
  specs: z.record(z.string().min(1).max(60), z.string().max(200)).nullable(),
  categoryId: z.uuid(),
  isActive: z.boolean(),
});

// Los `default` viven solo en el schema de creación: con `.partial()`, un
// ZodDefault heredado reescribiría las claves ausentes de un PATCH. Es la
// corrección C2 del spec 001 y no se repite.
export const createProductSchema = productFields.extend({
  description: productFields.shape.description.default(null),
  imageUrl: productFields.shape.imageUrl.default(null),
  specs: productFields.shape.specs.default(null),
  stock: productFields.shape.stock.default(0),
  isActive: productFields.shape.isActive.default(true),
});

export const updateProductSchema = productFields
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Debe enviar al menos un campo');

export const productQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  categoryId: z.union([z.literal('all'), z.uuid()]).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['name', 'priceCents', 'stock', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
```

### Forma de respuesta

```ts
export type ProductWithCategory = Product & {
  categoryName: string;
  categorySlug: string;
};

export type ProductListResponse = {
  data: ProductWithCategory[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};
```

El nombre de la categoría viaja resuelto por el servidor con un `innerJoin`: sin
él, la tabla tendría que pedir el listado de categorías y cruzarlo en cliente
para pintar una columna.

## 7. Arquitectura y archivos afectados

- `src/server/db/schema/product.ts` — **nuevo**; `index.ts` — **modificado**.
- `drizzle/` — **nueva** migración.
- `src/server/db/seed.ts` — **modificado**: `seedProducts()`.
- `src/lib/permissions.ts` — **modificado**: 4 permisos y su fila en la matriz.
- `src/lib/utils.ts` — **modificado**: `uniqueViolationTarget()` (§8).
- `src/server/repositories/product.repository.ts` — **nuevo**.
- `src/app/api/admin/products/route.ts` y `[id]/route.ts` — **nuevos**.
- `src/app/(admin)/admin/products/page.tsx` — **nuevo**.
- `src/app/(admin)/admin/layout.tsx` — **modificado**: ítem Productos.
- `src/modules/products/**` — **existente y vacío**: se rellena, no se recrea.
- `src/modules/audit/constants.ts` — **modificado**: 3 acciones y la entidad
  `product` en las etiquetas.
- `src/components/shared/data-table.tsx`, `src/hooks/use-debounce.ts`,
  `src/lib/api-guard.ts`, `src/app/forbidden.tsx` — **sin cambios**: se reutilizan.
- `src/proxy.ts` — **sin cambios**.

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **`price_cents` entero** y conversión en el borde del formulario | `numeric(10,2)` en Postgres, o `number` decimal en JS | CLAUDE.md §6: *precios en enteros (centavos), nunca float*. `0.1 + 0.2 !== 0.3` y un catálogo con miles de precios acumula el error. El decimal solo existe en el `<input>` y en el formateo de la celda |
| La conversión unidades ⇄ céntimos vive en **`src/modules/products/lib/price.ts`**, con `toCents()` y `formatPrice()` | Convertir en cada componente que toque un precio | Un único sitio donde el número deja de ser decimal. Si la conversión se repite en el formulario, en la columna y en el seed, la tercera copia es la que redondea distinto |
| **`uniqueViolationTarget(error)`** sustituye a `isUniqueViolation()` donde haya más de un constraint unique | Mantener el booleano actual y devolver un 409 genérico | `products` tiene **dos** constraints unique (`sku` y `slug`) y el booleano actual no distingue cuál saltó: el formulario no sabría qué campo marcar (AC9). Se lee `error.constraint` de Postgres y se mapea a nombre de campo. `isUniqueViolation()` se conserva para categorías, que solo tiene uno |
| El conflicto lo detecta el **constraint**, no un `SELECT` previo | `findBySku()` antes de insertar | Mismo argumento del 001: un pre-check es una carrera entre la lectura y el INSERT |
| **`category_id` inexistente se valida con una lectura previa** dentro de la transacción, devolviendo `400` | Dejar que salte la violación de FK y mapearla a 500 | AC11. Es una lectura barata sobre PK y la carrera es irrelevante: las categorías no se borran, solo se desactivan. Un `500` por FK sería un fallo del servidor cuando en realidad el cliente mandó un dato inválido |
| **Se permite crear productos en categorías inactivas**, pero el desplegable solo ofrece activas | Rechazar con `400` | Desactivar una categoría no debe romper la edición de los productos que ya cuelgan de ella: al abrir el diálogo de un producto cuya categoría se desactivó, el valor actual se muestra aunque no esté en la lista. Prohibirlo dejaría productos ineditables |
| El selector de categorías consume **`/api/admin/categories?status=active&pageSize=100`** | Endpoint nuevo `/api/admin/categories/options` | Los cuatro roles con `products.*` tienen también `categories.read`, así que no hay hueco de permisos. Un endpoint más sería superficie sin consumidor propio. El límite de 100 se documenta como deuda en §11 |
| **`specs` como `jsonb`** editado con una lista de pares clave/valor | Columna de texto libre, o tabla `product_specs` | `docs/SETUP.md` §5 nombra `specs` como parte de la tabla. Una tabla aparte no aporta nada mientras nadie consulte por especificación; `jsonb` deja la puerta abierta sin migración futura. El editor es una lista de pares, no un editor de JSON: el usuario objetivo no es técnico |
| Las acciones nuevas se añaden a **`AUDIT_ACTIONS`** de `src/modules/audit/constants.ts` | Dejar que la bitácora las muestre con su código crudo | El fallback existe y no rompe nada —así se diseñó—, pero `product.deactivated` en pantalla es peor que "Producto desactivado" para el usuario objetivo |
| La tabla **oculta** el botón Crear y el menú de acciones a quien no tiene el permiso, y el servidor lo decide | Mostrarlos siempre y dejar que la API responda 403 | AC15. Igual que en `/admin/users`, los permisos llegan resueltos en `meta` desde el handler: el cliente no deduce nada, solo deshabilita. La frontera real sigue siendo el 403 |
| Se reutiliza `data-table.tsx` **sin modificarlo** | Añadirle selección múltiple para acciones en lote | Las acciones en lote están fuera de alcance; tocarlo cambiaría también categorías, usuarios y bitácora |

## 9. Tareas

Agrupadas en 4 fases. **Cada fase deja `npm run typecheck && npm run lint &&
npm run build` en verde** (AC19).

### Fase 1 — Esquema, permisos y seed

- [x] **T1** — Definir la tabla `products` según §5.1 · archivo: `src/server/db/schema/product.ts` · verificación: `npm run typecheck`
- [x] **T2** — Exportar `products` desde el barrel · archivo: `src/server/db/schema/index.ts` · verificación: `npm run typecheck`
- [x] **T3** — Añadir los 4 permisos y su fila en `ROLE_PERMISSION_MATRIX` según §5.2 · archivo: `src/lib/permissions.ts` · verificación: `npm run typecheck`
- [x] **T4** — Generar y aplicar la migración · archivo: `drizzle/` · verificación: `npm run db:generate && npm run db:migrate`
- [x] **T5** — Añadir `seedProducts()` con 6–8 filas idempotentes por `sku`, ≥1 inactiva y ≥1 con `stock 0` · archivo: `src/server/db/seed.ts` · verificación: `npm run db:seed` dos veces (AC18)
- [x] **T6** — Comprobar contra la base que `permissions` pasó a 15 y `role_permissions` a 44, y que ningún rol perdió permisos · archivo: — · verificación: consulta directa

### Fase 2 — Servidor

- [x] **T7** — Añadir `uniqueViolationTarget(error)` que devuelva el nombre del constraint, conservando `isUniqueViolation()` · archivo: `src/lib/utils.ts` · verificación: `npm run typecheck`
- [x] **T8** — Implementar el repositorio: `findMany` (búsqueda `ilike` sobre `name` y `sku`, filtros por estado y categoría, orden contra mapa cerrado, `innerJoin` a `categories` para `categoryName`, paginación y `count`), `findById`, `create`, `update`, `softDelete`. Mutadores con `Tx` · archivo: `src/server/repositories/product.repository.ts` · verificación: `npm run typecheck`
- [x] **T9** — Definir tipos y schemas Zod de §6 · archivos: `src/modules/products/types/product.types.ts`, `schemas/product.schema.ts` · verificación: `npm run typecheck`
- [x] **T10** — Implementar `toCents()` y `formatPrice()` · archivo: `src/modules/products/lib/price.ts` · verificación: `npm run typecheck`
- [x] **T11** — Implementar `GET` y `POST`, con `authorize()`, validación de `category_id` y el 409 por constraint · archivo: `src/app/api/admin/products/route.ts` · verificación: `npm run build`
- [x] **T12** — Implementar `GET`, `PATCH` y `DELETE` por id, cada mutación con `logAudit` en su transacción · archivo: `src/app/api/admin/products/[id]/route.ts` · verificación: `npm run build`
- [x] **T13** — Recorrer la API con `curl` contra la base real: 201, 409 de sku, 409 de slug, 400 de categoría inexistente, 400 de stock negativo, 404, 401 sin sesión y 403 sin permiso · archivo: — · verificación: AC9, AC10, AC11

### Fase 3 — Cliente

- [x] **T14** — Query keys, tamaño de página y opciones de filtro · archivo: `src/modules/products/constants.ts` · verificación: `npm run typecheck`
- [x] **T15** — Service axios y `useProducts(params)` con `keepPreviousData` · archivos: `services/product.service.ts`, `hooks/use-products.ts` · verificación: `npm run typecheck`
- [x] **T16** — `useCreateProduct`, `useUpdateProduct`, `useDeleteProduct`, invalidando el listado y con su toast · archivo: `hooks/use-product-mutations.ts` · verificación: `npm run typecheck`
- [x] **T17** — Definir columnas: SKU, Nombre, Categoría, Precio, Stock, Estado y acciones. El stock 0 se marca de forma que no dependa solo del color · archivo: `components/product-columns.tsx` · verificación: `npm run typecheck`
- [x] **T18** — Diálogo de alta y edición con React Hook Form, `Field*`, autocompletado de slug, precio en unidades, selector de categoría y editor de pares clave/valor para `specs`. Mapea el 409 al campo que corresponda · archivo: `components/product-form-dialog.tsx` · verificación: `npm run typecheck`
- [x] **T19** — Diálogo de confirmación de desactivación con `AlertDialog` · archivo: `components/delete-product-dialog.tsx` · verificación: `npm run typecheck`
- [x] **T20** — Contenedor cliente con búsqueda, filtros, orden y paginación en modo manual, y los controles de escritura ocultos según `meta` · archivo: `components/products-table.tsx` · verificación: `npm run build`
- [x] **T21** — Página con `requirePagePermission('products.read')` · archivo: `src/app/(admin)/admin/products/page.tsx` · verificación: `npm run build` + AC14
- [x] **T22** — Ítem de navegación Productos con su permiso · archivo: `src/app/(admin)/admin/layout.tsx` · verificación: `npm run build`

### Fase 4 — Cierre

- [x] **T23** — Añadir `product.created/updated/deactivated` a `AUDIT_ACTIONS` y `product` a las etiquetas de entidad · archivo: `src/modules/audit/constants.ts` · verificación: AC16
- [x] **T24** — Marcar en `docs/SETUP.md` §7 lo que este spec cierra y actualizar el §11 del spec 001 si alguna deuda deja de aplicar · archivo: — · verificación: lectura
- [ ] **T25** — Recorrer los 19 criterios en `npm run dev` con al menos un `super_admin` y un rol sin `products.read`, y cerrar con los tres comandos en verde · archivo: — · verificación: los tres en verde

### Cierre de la fase 4

`typecheck`, `lint` y `build` en verde. **24 de 25 tareas y 16 de 19 criterios.**

Lo verificado en esta fase, contra la base y la API reales con una sesión de
`super_admin`:

| Criterio | Comprobación |
|---|---|
| AC1 | `pageSize` por defecto = 10 |
| AC2 | `q=SAM` → `SAM-980-1TB, SAM-A55-256` (por SKU); `q=lenovo` → `LEN-IP3-15` (por nombre, sin distinguir mayúsculas) |
| AC3 | filtro por categoría → los 2 periféricos |
| AC4 | `status=inactive` → `LOG-MX3S`; `status=active` → 7 |
| AC5 | orden por precio asc `34900 < 39900 < 45900` y desc `549900 > 219900 > 189900`, resuelto en servidor |
| AC12 | `DELETE` → `isActive=false`, la fila sigue existiendo. Un segundo `DELETE` devuelve `200` sin escribir una segunda entrada de bitácora |
| AC13 | `PATCH { isActive: true }` reactiva, sin endpoint propio |
| AC16 | la bitácora muestra "Producto creado/editado/desactivado" y la entidad "Producto"; el detalle expande `Acceso: No → Sí` con la etiqueta de campo traducida |
| AC17 | búsqueda sin coincidencias → `data: []`, `total: 0` |

**T25 queda abierta**, y con ella tres criterios, porque los tres necesitan algo
que no se puede fabricar sin tocar datos ajenos:

- **AC14 y AC15** exigen una segunda cuenta con un rol sin `products.*` (un
  `audit`, y un `manager` para el caso contrario). La instancia de Clerk de la
  aplicación tiene otra cuenta, pero es de otra persona: iniciar sesión con ella o
  cambiarle los roles no procede. La alternativa —degradar temporalmente al único
  `super_admin`— arriesga dejar el panel sin acceso a mitad de la comprobación.
  Lo que sí está verificado por separado: la matriz en base coincide con el
  catálogo rol a rol (T6), `forbidden()` devuelve `403` renderizado (spec 002), y
  `meta.canCreate/canUpdate/canDelete` viaja resuelto desde el servidor.
- **AC6** (autocompletado del slug al teclear el nombre) es puramente de
  interfaz. Se comprobó que el diálogo de edición **no** reescribe el slug, que es
  la mitad que puede fallar en silencio; la mitad de creación quedó sin teclear
  porque el navegador dejó de responder a capturas a mitad de la sesión.

Ninguna de las tres es un defecto conocido: son afirmaciones sin comprobar, y se
distinguen a propósito de las 16 que sí lo están.

## 10. Riesgos y consideraciones

- **Búsqueda `ILIKE '%texto%'` sobre dos columnas.** En categorías era aceptable
  con decenas de filas; productos crecerá, y el `OR` sobre `name` y `sku` fuerza
  dos scans. Cuando duela: `pg_trgm` con índice GIN. Se acepta ahora para no
  meter una extensión de Postgres en el mismo spec que introduce la tabla.
- **Dos constraints unique en la misma tabla.** Es lo que obliga a T7. Si se
  implementa el 409 con el booleano actual, AC9 no se puede cumplir y el
  formulario marcará el campo equivocado.
- **El precio es el punto donde más fácil se cuela un `float`.** El riesgo real
  no es el `<input>`, es el seed: escribir `price: 1299.90` en el catálogo del
  seed y multiplicar por 100 al vuelo produce `129989.99…`. El seed debe declarar
  céntimos enteros directamente.
- **El seed re-ejecutado sobre la base actual.** Ya hay 2 entradas en
  `audit_logs` y un `super_admin` asignado. `seedPermissions` usa
  `onConflictDoUpdate`: si algún `description` cambia, se propaga — que es lo
  buscado, pero conviene mirar el diff antes de darlo por bueno.
- **`role_permissions` crece a 44 filas.** Si la cuenta no cuadra tras el seed,
  lo más probable es que la matriz del código y la de §5.2 hayan divergido. T6
  existe para detectarlo antes de construir la UI encima.
- **Categorías inactivas en el selector.** El caso "producto cuya categoría se
  desactivó" es fácil de olvidar y se manifiesta como un desplegable en blanco al
  abrir el diálogo de edición. Está en §8 y merece una prueba manual explícita.
- **Datos existentes:** ninguno. Tabla nueva; rollback = revertir la migración y
  borrar la tabla. Los 4 permisos nuevos sí quedarían en la base tras un
  rollback: habría que borrarlos a mano o dejarlos, ya que un permiso sin
  consumidor no otorga nada.

## 11. Fuera de alcance / deuda aceptada

- **Galería de imágenes.** `image_url` es una URL de texto. Además, `z.url()`
  acepta `javascript:` y `data:`; hoy no hay superficie porque el valor no se
  renderiza, pero **el catálogo público de un spec futuro debe restringir el
  protocolo a `http`/`https` antes de pintarlo**. Misma deuda que arrastra el 001.
- **El selector de categorías pide 100 como máximo.** Con más de 100 categorías
  activas, algunas dejarían de ofrecerse en silencio. Retomar con un combobox
  buscable y paginado cuando el catálogo lo justifique.
- **Sin control de stock transaccional.** `stock` se edita a mano y nada lo
  decrementa. La reserva y el decremento pertenecen al spec de pedidos.
- **Sin acciones en lote ni exportación.**
- **Filtros no persistidos en la URL.** Recargar pierde búsqueda, filtros y
  página. Es la misma deuda del 001 y ya afecta a cuatro vistas; cuando aparezca
  la quinta, conviene resolverla de una vez en un helper compartido.
- **Sin tests automatizados.** El proyecto sigue sin runner. La verificación es
  `typecheck` + `lint` + `build` + el recorrido manual de los criterios.
