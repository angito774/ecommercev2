---
id: 014
title: Panel de pedidos en administración
status: done
module: orders
scope: admin
created: 2026-09-16
---

# 014 — Panel de pedidos en administración

## 1. Contexto

Desde el spec 007 hay pedidos reales en `orders`: el checkout de Stripe los crea
`pending` y el webhook los pasa a `paid`, `payment_failed` o `canceled`. Hoy nadie
del equipo puede consultarlos: el cliente ve los suyos en `/account#compras`
(spec 008), pero el panel no tiene ninguna vista de pedidos y la única forma de
mirar una venta es `npm run db:studio`.

`docs/SETUP.md` §6 ya deja anotado que `/admin/orders` con los permisos
`orders.read` y `orders.update_status` es lo siguiente del panel. Ninguno de los
dos permisos existe todavía en `src/lib/permissions.ts` — verificado: el catálogo
tiene 15 códigos y ninguno de `orders`.

## 2. Objetivo

Una persona con `orders.read` puede encontrar cualquier pedido por fecha, estado o
cliente y ver su detalle completo; con `orders.update_status` puede además cancelar
un pedido que siga `pending`.

## 3. Alcance

### Incluye

- Página `/admin/orders` protegida con `requirePagePermission('orders.read')` y su
  entrada en la navegación del panel.
- Listado paginado con filtros de rango de fechas, estado y búsqueda libre por
  cliente (nombre o correo).
- Detalle en un `Sheet`: líneas del pedido con precio congelado, importes,
  dirección de envío formateada desde el jsonb y las referencias de Stripe como
  texto plano.
- Cancelar un pedido `pending`, en transacción y con entrada en `audit_logs`
  (`order.status_changed`).
- Alta de los permisos `orders.read` y `orders.update_status` en el catálogo y en
  la matriz rol × permiso.

### No incluye (explícito)

- Flujo de envío o fulfillment. No se añade ningún valor al enum `order_status`:
  sigue siendo `pending | paid | payment_failed | canceled`.
- Reembolsos, anulaciones o cualquier llamada a la API de Stripe. El panel es de
  lectura frente a Stripe.
- Enlaces al Dashboard de Stripe. Los ids se muestran como texto copiable.
- Edición de líneas, importes, dirección o cliente de un pedido.
- Exportación a CSV, métricas o gráficos (eso es el dashboard, otro spec).
- Ruta pública `/orders/[id]` del cliente: sigue pendiente desde el spec 008.

## 4. Criterios de aceptación

- [ ] AC1 — Dado un usuario sin sesión, cuando pide `GET /api/admin/orders`,
      entonces recibe `401` con `{ message }` (nunca un `307` al formulario).
- [ ] AC2 — Dado un usuario con sesión y sin `orders.read`, cuando pide cualquiera
      de los tres endpoints, entonces recibe `403` con `{ message }` sin que se
      valide la query ni el cuerpo.
- [ ] AC3 — Dado un usuario sin `orders.read`, cuando abre `/admin/orders`,
      entonces recibe `403` renderizado por `src/app/forbidden.tsx` y la entrada
      «Pedidos» no aparece en la navegación del panel.
- [ ] AC4 — Dado el listado sin filtros, cuando se carga la página, entonces
      muestra los pedidos ordenados por fecha descendente, 20 por página, con
      fecha, cliente (nombre y correo), total formateado desde `amountTotalCents`
      y badge de estado.
- [ ] AC5 — Dado un rango de fechas, cuando se aplica, entonces solo se listan los
      pedidos cuyo `created_at` cae dentro del rango, extremos incluidos.
- [ ] AC6 — Dado un rango con `dateFrom` posterior a `dateTo`, cuando llega al
      endpoint, entonces responde `400` y la UI deshabilita el botón de aplicar
      antes de llegar a pedirlo.
- [ ] AC7 — Dado el filtro de estado en `paid`, cuando se aplica, entonces solo se
      listan pedidos `paid`; con el valor `all` no se filtra por estado.
- [ ] AC8 — Dado un texto en el buscador de cliente, cuando se aplica, entonces se
      listan los pedidos cuyo comprador casa por correo, nombre, apellido o nombre
      completo, sin distinguir mayúsculas.
- [ ] AC9 — Dado un texto de búsqueda que contiene `%` o `_`, cuando se aplica,
      entonces se buscan esos caracteres literalmente y no como comodines.
- [ ] AC10 — Dado un pedido de la lista, cuando se pulsa «Ver detalle», entonces se
      abre un `Sheet` con sus líneas (nombre, cantidad y precio congelados), los
      tres importes, la dirección de envío y los ids de Stripe.
- [ ] AC11 — Dado un pedido sin `shipping_address` (nunca llegó a `paid`), cuando se
      abre su detalle, entonces se indica que no hay dirección registrada, sin error
      ni hueco en blanco.
- [ ] AC12 — Dado un pedido `pending` y un usuario con `orders.update_status`,
      cuando confirma «Cancelar pedido», entonces la orden queda `canceled`, la
      lista y el detalle se refrescan y aparece una confirmación.
- [ ] AC13 — Dado un pedido en cualquier estado distinto de `pending`, cuando se
      abre su detalle, entonces el botón de cancelar no se renderiza; y si se
      llamara al endpoint igualmente, responde `409` con un mensaje que nombra el
      estado actual.
- [ ] AC14 — Dado un usuario con `orders.read` pero sin `orders.update_status`,
      cuando abre el detalle de un pedido `pending`, entonces no ve el botón de
      cancelar, y el endpoint le responde `403` si lo invoca a mano.
- [ ] AC15 — Dada una cancelación válida, cuando se completa, entonces existe una
      fila en `audit_logs` con `action = 'order.status_changed'`,
      `entity_type = 'order'`, `entity_id` del pedido, `actor_id` del administrador
      y `changes = { before: { status: 'pending' }, after: { status: 'canceled' } }`,
      escrita en la misma transacción que el `UPDATE`.
- [ ] AC16 — Dado un `id` inexistente o con forma de uuid inválida, cuando se pide
      el detalle o el PATCH, entonces responde `404` y `400` respectivamente.
- [ ] AC17 — Dado un fallo de red, cuando la tabla o el detalle no cargan, entonces
      se muestra el estado de error con opción de reintentar, y el estado de carga
      mientras tanto (`DataTable` ya los cubre en la tabla).
- [ ] AC18 — Dada una cancelación, cuando se completa, entonces el stock no cambia:
      un pedido `pending` nunca descontó inventario.

## 5. Modelo de datos

**Sin cambios de esquema.** No hay tablas nuevas, columnas nuevas ni valores nuevos
en `order_status`, y por tanto **no hay migración**. Se leen las tablas que ya
existen:

| Tabla | Archivo | Uso en este spec |
|---|---|---|
| `orders` | `src/server/db/schema/order.ts` | cabecera, estado, importes en céntimos, ids de Stripe, `shipping_address` |
| `order_items` | `src/server/db/schema/order-item.ts` | líneas con `name_snapshot`, `image_url_snapshot`, `price_cents_snapshot`, `quantity` |
| `users` | `src/server/db/schema/user.ts` | join para nombre y correo del comprador |
| `audit_logs` | `src/server/db/schema/audit-log.ts` | `order.status_changed` de la cancelación |

Índices existentes que sostienen las consultas: `orders_status_idx` (filtro por
estado) y `orders_user_id_created_at_idx`. El orden del listado es
`created_at desc, id desc` sobre la tabla completa; con el volumen actual no
justifica un índice nuevo (ver §10).

Lo único que cambia como **dato semilla** es el catálogo de permisos, que no es
migración sino `npm run db:seed` (idempotente: `seedPermissions` hace
`onConflictDoUpdate` por `code` y `seedRolePermissions` `onConflictDoNothing`).

```ts
// src/lib/permissions.ts — dos entradas nuevas en PERMISSIONS
{
  code: 'orders.read',
  resource: 'orders',
  action: 'read',
  description: 'Ver el listado y el detalle de los pedidos.',
},
{
  code: 'orders.update_status',
  resource: 'orders',
  action: 'update_status',
  description: 'Cancelar pedidos que siguen pendientes de pago.',
},
```

Matriz rol × permiso resultante:

| Rol | `orders.read` | `orders.update_status` |
|---|---|---|
| `super_admin` | sí | sí |
| `admin` | sí | sí |
| `manager` | sí | sí |
| `audit` | sí | no |
| `employee`, `customer` | no | no |

Forma del jsonb `orders.shipping_address`, tal y como lo escribe
`readShippingAddress()` en `src/server/services/order-fulfillment.service.ts:32`:

```ts
{ name: string | null, address: { line1, line2, city, state, postal_code, country } }
```

Se parsea con Zod de forma defensiva (`safeParse` → `null` si no encaja): es jsonb
sin constraint y una fila antigua o de otra versión de la API de Stripe no debe
tumbar el detalle.

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/orders` | `orders.read` | query: `dateFrom?`, `dateTo?`, `status`, `customerSearch?`, `page`, `pageSize` | `AdminOrderListResponse` | 400, 401, 403, 500 |
| GET | `/api/admin/orders/[id]` | `orders.read` | — | `AdminOrderDetailResponse` | 400, 401, 403, 404, 500 |
| PATCH | `/api/admin/orders/[id]` | `orders.update_status` | body: `{ status: 'canceled' }` | `OrderStatusChangeResult` | 400, 401, 403, 404, 409, 500 |

Todos los errores siguen el contrato ya vigente: `toErrorResponse()` y
`badRequest()` de `src/lib/api-guard.ts`, cuerpo `{ message }` (más `issues` en el
400 de validación), que es lo que espera el interceptor de `src/lib/axios.ts`.

### Zod — `src/modules/orders/schemas/admin-order.schema.ts`

```ts
export const adminOrderQuerySchema = z
  .object({
    dateFrom: z.iso.datetime().optional(),
    dateTo: z.iso.datetime().optional(),
    status: z.enum(['all', 'pending', 'paid', 'payment_failed', 'canceled']).default('all'),
    customerSearch: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['dateFrom'],
  });

// Solo `canceled`: el enum completo abriría por la puerta de atrás transiciones
// que este spec no define (D-2).
export const cancelOrderSchema = z.object({ status: z.literal('canceled') });

export const orderIdSchema = z.uuid();

export const shippingAddressSchema = z.object({
  name: z.string().nullish(),
  address: z.object({
    line1: z.string().nullish(),
    line2: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    postal_code: z.string().nullish(),
    country: z.string().nullish(),
  }),
});

export type AdminOrderQueryParams = z.output<typeof adminOrderQuerySchema>;
export type ShippingAddress = z.output<typeof shippingAddressSchema>;
```

### Salida — `src/modules/orders/types/order.types.ts`

Todo derivado por `Pick`/`Omit` de los tipos inferidos del schema Drizzle que el
archivo ya expone (`Order`, `OrderItem`, `OrderStatus`, `OrderLineDisplay`):

```ts
export type AdminOrderRow = Pick<
  Order,
  'id' | 'status' | 'subtotalCents' | 'shippingCents' | 'amountTotalCents' | 'currency'
> & {
  createdAt: string;            // ISO: JSON no transporta Date (spec 008, D-15)
  customerId: string;
  customerName: string | null;  // firstName + lastName, null si Clerk no los dio
  customerEmail: string;
  itemCount: number;
};

export type AdminOrderListResponse = {
  data: AdminOrderRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    canUpdateStatus: boolean;   // resuelto en servidor: la UI solo oculta controles
  };
};

export type AdminOrderDetail = Omit<AdminOrderRow, 'itemCount'> & {
  updatedAt: string;
  items: OrderLineDisplay[];
  shippingAddress: ShippingAddress | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
};

export type AdminOrderDetailResponse = {
  data: AdminOrderDetail;
  meta: { canUpdateStatus: boolean };
};

export type OrderStatusChangeResult = Pick<Order, 'id' | 'status'> & { updatedAt: string };
```

`GET /api/admin/orders` responde `200` siempre que la query valide, también con
cero resultados (`data: []`, `total: 0`): «no hay pedidos que casen» no es un 404.

## 7. Arquitectura y archivos afectados

- `src/server/db/schema/` — sin cambios.
- `src/lib/permissions.ts` — dos códigos nuevos en `PERMISSIONS` y su reparto en
  `ROLE_PERMISSION_MATRIX`.
- `src/server/repositories/order.repository.ts` — `buildAdminOrderFilters()`,
  `findManyForAdmin()`, `findByIdForAdmin()`, `findById()`. Reutiliza el
  `markCanceled()` que ya existe para la cancelación.
- `src/app/api/admin/orders/route.ts` — `GET` listado.
- `src/app/api/admin/orders/[id]/route.ts` — `GET` detalle y `PATCH` cancelación.
- `src/modules/orders/schemas/admin-order.schema.ts` — Zod compartido
  cliente/servidor.
- `src/modules/orders/types/order.types.ts` — tipos de salida del panel.
- `src/modules/orders/lib/order-transitions.ts` — `canCancelOrder()` puro.
- `src/modules/orders/lib/shipping-address.ts` — parseo y formateo de la dirección.
- `src/modules/orders/constants.ts` — `adminOrderKeys`, etiquetas de estado para
  admin, tamaño de página y mensajes de conflicto.
- `src/modules/orders/services/admin-order.service.ts` — tres llamadas axios.
- `src/modules/orders/hooks/use-admin-orders.ts` — `useAdminOrders`, `useAdminOrder`.
- `src/modules/orders/hooks/use-cancel-order.ts` — mutación e invalidación.
- `src/modules/orders/components/admin-order-columns.tsx`,
  `admin-order-filters.tsx`, `admin-orders-table.tsx`,
  `admin-order-detail-sheet.tsx`, `cancel-order-dialog.tsx`.
- `src/modules/orders/components/order-status-badge.tsx` — prop `label` opcional.
- `src/app/(admin)/admin/orders/page.tsx` — Server Component con el guard.
- `src/app/(admin)/admin/layout.tsx` — entrada «Pedidos» en `NAV_ITEMS`.
- `src/modules/audit/constants.ts` — etiquetas de las acciones `order.*`.
- `docs/SETUP.md` — §6, marcar el panel de pedidos como construido.

Componentes shadcn: `sheet`, `alert-dialog`, `select`, `badge`, `table`,
`skeleton` y `button` ya están instalados en `src/components/ui/`. **No hace falta
ningún `npx shadcn@latest add`.**

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| D-1: Solo se permite `pending → canceled`; el enum no crece | Añadir `shipped`/`delivered` | El fulfillment no existe como proceso; un estado que nadie mueve es una mentira en la tabla. Alcance explícito del §3 |
| D-2: El body del PATCH es `z.literal('canceled')`, no el enum | `z.enum(orderStatus.enumValues)` + reglas en el handler | Un enum abierto deja que el cliente proponga `paid`; el `literal` hace que la única transición posible sea la especificada, y el 403/409 no depende de recordar un `if` |
| D-3: La transición inválida responde `409`, no `400` | `400` como sugería el borrador de errores | El cuerpo es válido; lo que está en conflicto es el estado del recurso. `toErrorResponse()` ya mapea `ConflictError → 409` y el 400 queda reservado a la forma de la petición |
| D-4: Se reutiliza `orderRepository.markCanceled()` (UPDATE condicional `WHERE status = 'pending'`) | Un mutador nuevo para admin | Es literalmente la misma invariante que ya protege al webhook (`transitionFromPending`); duplicarla es duplicar la idempotencia. La carrera la resuelve el motor: si otra transacción llegó antes, devuelve `null` → 409 |
| D-5: El 404 se distingue del 409 leyendo la fila con el `tx` antes del UPDATE | Solo el `markCanceled` y asumir 404 cuando devuelve `null` | Sin la lectura previa, cancelar un pedido ya `paid` respondería «no encontrado», que es falso y deja al administrador sin saber qué pasó |
| D-6: El listado publica una proyección, no `select()` | Fila cruda | Mismo criterio que `HISTORY_ORDER_COLUMNS`: lo que sale se enumera. Aquí sí salen los ids de Stripe, pero solo en el detalle y solo bajo `orders.read` |
| D-7: El admin ve también los pedidos sin `stripe_checkout_session_id` | Filtrarlos como hace `findManyByUser` | Al cliente se le ocultan porque nunca vio la pantalla de pago (spec 008, D-14); al administrador le interesan justamente esos: son los intentos en los que falló la creación de la sesión |
| D-8: Búsqueda por `ilike` sobre correo, nombre, apellido y `concat_ws(' ', first_name, last_name)` | Solo correo, `tsvector`, o `nombre \|\| ' ' \|\| apellido` | Quien atiende busca «Nina» o «nelson@…» indistintamente. El concatenado cubre «Nelson Nina», que ninguna columna suelta casa. `concat_ws` en vez de `\|\|` porque este último anula la expresión completa si un lado es `NULL` (alguien con solo nombre desaparecería del resultado, incumpliendo AC8). Full-text es desproporcionado para el volumen actual (§10) |
| D-9: `escapeLikePattern` se mueve a `src/lib/utils.ts` | Importarla desde `product.repository` | Con el segundo consumidor, un repositorio importando de otro solo por un helper de cadena crea una dependencia lateral falsa. `lib/utils.ts` ya es el sitio de los helpers puros (`isUniqueViolation`) |
| D-10: `canCancelOrder(status)` vive en `modules/orders/lib/` y la usan handler y UI | La condición escrita en el handler y repetida en el componente | Es la regla que decide el 409 y la que decide si se pinta el botón. En dos sitios, un día divergen y la UI ofrece algo que la API rechaza. Además es pura y testeable sin base de datos |
| D-11: `canUpdateStatus` viaja en el `meta` de las dos respuestas GET | Solo en el listado, y el sheet lo recibe por props | El sheet tiene su propia consulta; que dependa del `meta` de otra query lo acopla al orden de carga. Mismo patrón que `canCreate`/`canUpdate` de productos |
| D-12: La dirección se parsea con Zod `safeParse` y cae a `null` | Castear el jsonb al tipo esperado | La columna es `jsonb` sin constraint y su forma la dicta Stripe. Un cast convierte un cambio de la API de otro en un `TypeError` en el detalle |
| D-13: Estado de los filtros en `useState` del componente de tabla | Zustand | Un solo consumidor y muere al desmontar. Mismo criterio que el filtro del historial (spec 008, D-9) y la regla 6 de CLAUDE.md: Zustand es para estado de UI **global** |
| D-14: Campos `<input type="date">` nativos | `react-day-picker` / `calendar` de shadcn | Dos fechas no justifican una dependencia nueva; el control nativo ya es accesible y localizado. Precedente: `order-history-filter.tsx` |
| D-15: `OrderStatusBadge` gana una prop `label` opcional | Un `AdminOrderStatusBadge` aparte | Las etiquetas del cliente («Confirmando tu pago») no sirven en el panel, pero los colores sí deben ser los mismos: el propio componente dejó escrito que «un futuro /admin/orders debe leer el mismo verde» |
| D-16: Botón «Ver detalle» en la columna de acciones | `onRowClick` en `DataTable` | Evita tocar un componente compartido por cuatro tablas y da un objetivo alcanzable por teclado; una fila clicable no es un control accesible |
| D-17: Paginación por `offset`, 20 por página | Cursor | Es el patrón de las otras tres tablas del panel y el volumen no lo tensiona. Cambiarlo aquí solo rompería la simetría |
| D-18: Los ids de Stripe se muestran como texto | Enlace a `dashboard.stripe.com` | Alcance del §3. El enlace además obliga a saber si la cuenta está en test o en live para no mandar al administrador a un 404 |
| D-19: `manager` recibe también `orders.update_status` | Solo `super_admin` y `admin` | Cancelar un pedido no cobrado es operación de tienda, no de administración de accesos, y `manager` ya gestiona el catálogo completo. `audit` se queda en solo lectura, coherente con su definición |

## 9. Tareas

- [x] **T1** — Añadir `orders.read` y `orders.update_status` a `PERMISSIONS` y
      repartirlos en `ROLE_PERMISSION_MATRIX` según la tabla del §5 · archivo:
      `src/lib/permissions.ts` · verificación: `npm run typecheck && npm test`
- [x] **T2** — Ejecutar el seed y comprobar que el catálogo queda en 17 permisos y
      que `super_admin` los resuelve todos · comando: `npm run db:seed` ·
      verificación: salida del seed + `npm run db:studio`
- [x] **T3** — Mover `escapeLikePattern` a `src/lib/utils.ts`, actualizar el import
      de `product.repository.ts` y trasladar sus casos de
      `product.repository.test.ts` a `src/lib/utils.test.ts` (D-9) · verificación:
      `npm test && npm run typecheck`
- [x] **T4** — Crear los schemas Zod del panel: `adminOrderQuerySchema`,
      `cancelOrderSchema`, `orderIdSchema`, `shippingAddressSchema` · archivo:
      `src/modules/orders/schemas/admin-order.schema.ts` · verificación:
      `npm run typecheck`
- [x] **T5** — Tests del schema: defaults, tope de `pageSize`, rechazo del rango
      invertido, rechazo de un `status` fuera del enum, `cancelOrderSchema` que
      rechaza `paid` · archivo:
      `src/modules/orders/schemas/admin-order.schema.test.ts` · verificación:
      `npm test`
- [x] **T6** — Crear `canCancelOrder(status: OrderStatus): boolean` (D-10) ·
      archivo: `src/modules/orders/lib/order-transitions.ts` · verificación:
      `npm run typecheck`
- [x] **T7** — Test exhaustivo de `canCancelOrder` sobre los cuatro valores del
      enum: solo `pending` devuelve `true` · archivo:
      `src/modules/orders/lib/order-transitions.test.ts` · verificación: `npm test`
- [x] **T8** — Crear `parseShippingAddress(value: unknown): ShippingAddress | null`
      y `formatShippingAddress(address): string[]` (líneas listas para pintar,
      descartando los campos vacíos) · archivo:
      `src/modules/orders/lib/shipping-address.ts` · verificación:
      `npm run typecheck`
- [x] **T9** — Tests de `shipping-address`: jsonb bien formado, `null`, objeto con
      forma ajena, dirección con `line2` y `state` vacíos · archivo:
      `src/modules/orders/lib/shipping-address.test.ts` · verificación: `npm test`
- [x] **T10** — Añadir los tipos `AdminOrderRow`, `AdminOrderListResponse`,
      `AdminOrderDetail`, `AdminOrderDetailResponse` y `OrderStatusChangeResult`,
      derivados por `Pick`/`Omit` de los inferidos · archivo:
      `src/modules/orders/types/order.types.ts` · verificación: `npm run typecheck`
- [x] **T11** — Añadir `adminOrderKeys`, `ADMIN_ORDER_PAGE_SIZE = 20`,
      `ADMIN_ORDER_STATUS_LABELS` (Pendiente / Pagado / Pago fallido / Cancelado),
      `ADMIN_ORDER_STATUS_OPTIONS` y los mensajes de 404 y 409 de la cancelación ·
      archivo: `src/modules/orders/constants.ts` · verificación:
      `npm run typecheck`
- [x] **T12** — Repositorio: `buildAdminOrderFilters()` exportada (estado, rango,
      búsqueda por cliente con `escapeLikePattern`) y `findManyForAdmin()` con
      `innerJoin` a `users`, orden `created_at desc, id desc`, `limit`/`offset` y
      conteo en paralelo · archivo:
      `src/server/repositories/order.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T13** — Repositorio: `findById(id, reader)` (fila desnuda para el `before`
      de la bitácora) y `findByIdForAdmin(id)` (cabecera + cliente + líneas por
      `loadItems` + dirección parseada) · archivo:
      `src/server/repositories/order.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T14** — Test de `buildAdminOrderFilters`: `undefined` sin filtros, `SQL`
      definida con cada filtro por separado y con todos combinados · archivo:
      `src/server/repositories/order.repository.test.ts` · verificación: `npm test`
- [x] **T15** — Route Handler `GET /api/admin/orders`: `authorize('orders.read')`
      antes de leer la query, `safeParse` → `badRequest`, repositorio y `meta` con
      `canUpdateStatus` vía `can()` · archivo:
      `src/app/api/admin/orders/route.ts` · verificación: `npm run typecheck`
- [x] **T16** — Route Handler `GET /api/admin/orders/[id]`:
      `authorize('orders.read')`, `orderIdSchema` sobre el `params` (promesa en
      Next 16), `404` si no existe · archivo:
      `src/app/api/admin/orders/[id]/route.ts` · verificación: `npm run typecheck`
- [x] **T17** — En el mismo archivo, `PATCH`: `authorize('orders.update_status')`,
      `parseJsonBody(cancelOrderSchema)`, transacción con lectura previa (D-5),
      `canCancelOrder` → 409, `markCanceled` → 409 en carrera, y `logAudit` con
      `order.status_changed` dentro de la misma transacción · archivo:
      `src/app/api/admin/orders/[id]/route.ts` · verificación: `npm run typecheck`
- [x] **T18** — Service axios con `fetchAdminOrders`, `fetchAdminOrder` y
      `cancelOrder` sobre `/admin/orders` · archivo:
      `src/modules/orders/services/admin-order.service.ts` · verificación:
      `npm run typecheck`
- [x] **T19** — Hooks de lectura: `useAdminOrders(params)` con
      `placeholderData: keepPreviousData` y `useAdminOrder(id)` con
      `queryFn: id === null ? skipToken : ...` en vez de `enabled: id !== null`:
      con `enabled` la `queryFn` sigue recibiendo `id: string | null` y exige un
      `id as string` que choca con TypeScript estricto; `skipToken` deshabilita
      la consulta igual y estrecha el tipo a `string` sin castear · archivo:
      `src/modules/orders/hooks/use-admin-orders.ts` · verificación:
      `npm run typecheck`
- [x] **T20** — Hook `useCancelOrder()`: mutación, invalidación de
      `adminOrderKeys.all` y toast de éxito/error con sonner · archivo:
      `src/modules/orders/hooks/use-cancel-order.ts` · verificación:
      `npm run typecheck`
- [x] **T21** — Añadir la prop opcional `label` a `OrderStatusBadge` conservando el
      default del cliente (D-15) · archivo:
      `src/modules/orders/components/order-status-badge.tsx` · verificación:
      `npm run typecheck`
- [x] **T22** — Columnas de TanStack Table: fecha, cliente (nombre + correo),
      número de líneas, total con `formatPrice`, estado con badge y acción «Ver
      detalle» · archivo:
      `src/modules/orders/components/admin-order-columns.tsx` · verificación:
      `npm run typecheck`
- [x] **T23** — Filtros: rango de fechas con `<input type="date">`, `Select` de
      estado y buscador de cliente con `useDebounce`; el botón de aplicar se
      deshabilita con el rango invertido (AC6) · archivo:
      `src/modules/orders/components/admin-order-filters.tsx` · verificación:
      `npm run typecheck`
- [x] **T24** — Diálogo de confirmación de cancelación sobre `AlertDialog`, con el
      identificador del pedido en el texto y el estado pendiente del botón ·
      archivo: `src/modules/orders/components/cancel-order-dialog.tsx` ·
      verificación: `npm run typecheck`
- [x] **T25** — `Sheet` de detalle: importes, líneas, dirección formateada o aviso
      de ausencia (AC11), ids de Stripe como texto, estados de carga y error, y el
      botón de cancelar condicionado a `canCancelOrder(status) && canUpdateStatus`
      · archivo: `src/modules/orders/components/admin-order-detail-sheet.tsx` ·
      verificación: `npm run typecheck`
- [x] **T26** — Componente contenedor: estado de filtros y paginación, `useReactTable`
      manual (`manualPagination`, `pageCount` del `meta`), `DataTable` compartida y
      apertura del sheet · archivo:
      `src/modules/orders/components/admin-orders-table.tsx` · verificación:
      `npm run typecheck`
- [x] **T27** — Página del panel con `requirePagePermission('orders.read')`,
      `metadata` y encabezado · archivo:
      `src/app/(admin)/admin/orders/page.tsx` · verificación: `npm run build`
- [x] **T28** — Entrada «Pedidos» en `NAV_ITEMS` con `permission: 'orders.read'` ·
      archivo: `src/app/(admin)/admin/layout.tsx` · verificación: `npm run typecheck`
- [x] **T29** — Bitácora: etiquetas de `order.paid`, `order.payment_failed`,
      `order.canceled`, `order.status_changed` y `order.oversold` en
      `AUDIT_ACTIONS`, `order: 'Pedido'` en `ENTITY_TYPE_LABELS`, la opción
      «Pedidos» en `AUDIT_ENTITY_OPTIONS` y `status` en `FIELD_LABELS`; actualizar
      el caso de `constants.test.ts:37`, que hoy afirma que `entityTypeLabel('order')`
      cae al código crudo · archivos: `src/modules/audit/constants.ts`,
      `src/modules/audit/constants.test.ts` · verificación: `npm test`
- [x] **T30** — Documentar en `docs/SETUP.md` §6 que el panel de pedidos queda
      construido (spec 014), con los dos permisos y el alcance de solo consulta ·
      archivo: `docs/SETUP.md` · verificación: lectura
- [x] **T31** — Cierre: `npm run typecheck && npm run lint && npm test && npm run build`
      en verde y recorrido manual de AC4, AC8, AC12, AC13 y AC14 con dos cuentas de
      distinto rol
      - [x] `npm run typecheck` — exit 0
      - [x] `npm run lint` — exit 0, 0 errores (8 warnings preexistentes de
            `react-hooks/incompatible-library`, uno por cada tabla con `useReactTable`)
      - [x] `npm test` — 685/685 en 32 archivos
      - [x] `npm run build` — exit 0, con `/admin/orders`, `/api/admin/orders` y
            `/api/admin/orders/[id]` en el manifiesto de rutas
      - [x] **Verificación humana (nelson.nc421@gmail.com, 2026-09-16):** recorrido
            manual de AC4, AC8, AC12, AC13 y AC14 con cuenta `super_admin` y cuenta
            `audit` en `/admin/orders` — los 6 pasos del checklist pasaron.

## 10. Riesgos y consideraciones

- **N+1 en el listado.** `findManyForAdmin` no carga las líneas de cada pedido: la
  tabla solo muestra el total y un contador. `itemCount` se resuelve con una
  subconsulta agregada en el mismo `SELECT`, no con una consulta por fila. Las
  líneas se cargan solo al abrir el detalle, de un pedido cada vez.
- **`ilike '%texto%'` no usa índice.** `users_email_idx` no sirve con comodín a la
  izquierda, así que la búsqueda por cliente es un scan sobre `users` unido a
  `orders`. Aceptable con el volumen actual; si crece, la salida es un índice GIN
  con `pg_trgm` o `tsvector`, no reescribir el panel.
- **Paginación por offset.** Con miles de pedidos, `offset` alto degrada. Mismo
  compromiso que ya asumen productos, usuarios y bitácora.
- **Carrera en la cancelación.** Dos administradores cancelando a la vez, o el
  webhook confirmando el pago en el mismo instante: el `UPDATE ... WHERE status =
  'pending'` hace que el segundo no encuentre fila y reciba `409`. No hay
  read-then-write sin protección.
- **Stock.** Cancelar no toca inventario y eso es correcto: el descuento ocurre en
  el webhook al pasar a `paid` (spec 007). Si algún día se permitiera cancelar un
  pedido `paid`, habría que reponer stock y reembolsar en Stripe — por eso queda
  fuera de alcance y no por olvido.
- **PII en la bitácora.** El `changes` de `order.status_changed` lleva solo
  `{ status }`. Ni la dirección de envío ni el correo del comprador entran en
  `audit_logs` (docs/SETUP.md §5.2, regla dura 3).
- **Deriva del jsonb.** `shipping_address` no tiene constraint. El parseo con
  `safeParse` convierte un cambio de forma en «sin dirección registrada» en vez de
  en un 500.
- **Datos existentes.** Hay pedidos `pending` antiguos que nunca llegaron a pago y
  seguirán apareciendo en el listado. Es deliberado (D-7): el panel es justamente
  donde se ven y se cierran.
- **Rollback.** Sin migración: revertir es revertir el código. Los dos permisos
  quedarían huérfanos en la tabla, lo cual es inocuo — `isPermissionCode()`
  descarta lo que no está en el catálogo del código.
- **Zona horaria.** Los filtros de fecha se convierten a instantes ISO en el
  navegador, igual que el historial del cliente; el servidor compara en UTC. Un
  pedido de las 23:50 puede caer en otro día para quien consulta desde otra zona.
  Aceptado: el panel lo usa un equipo en una sola zona.

## 11. Fuera de alcance / deuda aceptada

- **Fulfillment.** Estados de preparación y envío, transportista y número de
  seguimiento. Se retoma cuando exista el proceso logístico real, no antes: cada
  valor del enum tiene que corresponder a algo que alguien hace.
- **Reembolsos y cancelación de pedidos `paid`.** Necesitan llamada a Stripe,
  reposición de stock y su propia auditoría. Spec propio.
- **Exportación CSV y métricas de ventas.** Lo segundo pertenece al dashboard.
- **Índice de búsqueda por cliente (`pg_trgm`).** Se añade cuando la tabla lo pida,
  con una medición delante.
- **Filtro por importe o por producto vendido.** No se ha pedido; añadirlos ahora
  sería adivinar.
- **Vista pública `/orders/[id]`** del historial de cliente, pendiente desde el
  spec 008 y sin relación con este panel.
