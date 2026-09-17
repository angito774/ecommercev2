# Inventario de funciones testeables (unit testing)

Este documento lista las funciones del código actual que son candidatas reales a
prueba unitaria: lógica pura, cálculos, formateadores, validadores (schemas Zod),
mappers/transformadores y parsers. **Quedan fuera** a propósito:

- Componentes React (`.tsx`) y todo lo que sea presentación.
- Hooks `useXxx` que solo orquestan TanStack Query o estado de UI (`use-debounce`,
  hooks de `modules/*/hooks`, el store `storefront/store/ui.store.ts`).
- Servicios cliente de `modules/*/services/*.ts`: son wrappers directos de axios
  sin lógica propia (`fetchX`, `createX`, `updateX`, `deleteX`) — se verifican con
  pruebas de integración/E2E, no unitarias.
- Repositorios de `src/server/repositories/`: ejecutan consultas Drizzle/Postgres
  directas; se prueban contra una base de datos real, no en unitario (excepto un
  par de helpers puros señalados explícitamente).
- Route Handlers y Server Actions: son flujo/orquestación, no unidades aisladas.

Los módulos `dashboard` y `customers` no tienen código propio todavía (solo
carpetas `.gitkeep`) y no aparecen en este documento.

Cuando una función interesante no está exportada, se indica igual porque tiene
valor de negocio alto; exportarla no cambia comportamiento y facilitaría probarla
directamente en vez de solo a través del flujo completo que la contiene.

No hay framework de pruebas instalado todavía (`package.json` no declara
`vitest`/`jest`); este inventario es insumo para configurarlo.

---

## 1. `src/lib` (utilidades globales)

| Función | Archivo | Descripción |
|---|---|---|
| `cn(...inputs: ClassValue[]): string` | `lib/utils.ts` | Combina clases de Tailwind resolviendo conflictos (`clsx` + `twMerge`). |
| `slugify(input: string): string` | `lib/utils.ts` | Normaliza un texto a slug ASCII en minúsculas, sin diacríticos ni caracteres especiales. |
| `isUniqueViolation(error: unknown): boolean` | `lib/utils.ts` | Detecta si un error representa una violación de constraint único de Postgres (código `23505`), recorriendo la cadena `cause`. |
| `uniqueViolationTarget(error: unknown): string \| null` | `lib/utils.ts` | Extrae el nombre del constraint único que falló, o `null` si no se puede determinar. |
| *(privada)* `findUniqueViolation(error): PgError \| null` | `lib/utils.ts` | Recorre hasta 5 niveles de `cause` buscando el error de Postgres subyacente. |
| `escapeLikePattern(value: string): string` | `lib/utils.ts` | Escapa los comodines `%`, `_` y `\` de un término de búsqueda antes de usarlo en `ILIKE`. Movida desde `server/repositories/product.repository.ts` (spec 014, D-9) al ganar un segundo consumidor en `order.repository.ts`. |
| `can(granted, code): boolean` | `lib/permissions.ts` | Verifica si un conjunto de permisos concedidos incluye un código dado. |
| `isPermissionCode(value: string): boolean` | `lib/permissions.ts` | Type guard: valida que un string sea un código de permiso existente en el catálogo. |
| `isRoleSlug(value: string): boolean` | `lib/permissions.ts` | Type guard: valida que un string sea un slug de rol existente en el catálogo. |
| `getAuditContext(request: Request): AuditContext` | `lib/audit.ts` | Extrae IP (`x-forwarded-for`, validada con `isIP`) y user-agent (truncado a 512) de una `Request`. |
| `badRequest(message, issues?): NextResponse` | `lib/api-guard.ts` | Construye una respuesta 400 uniforme, con o sin lista de issues de Zod. |
| `parseJsonBody(request, schema, invalidMessage)` | `lib/api-guard.ts` | Parsea el body como JSON y lo valida contra un schema Zod; devuelve un resultado discriminado `{ok, data}` / `{ok:false, response}`. |
| `toErrorResponse(error, options): NextResponse` | `lib/api-guard.ts` | Traduce cualquier error de dominio (`UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `UpstreamError`, violación única) al status HTTP correspondiente. |
| *(privada)* `conflictMessage(option, error): string` | `lib/api-guard.ts` | Resuelve el mensaje de un 409: texto fijo o mapa `constraint → mensaje` según qué unique chocó. |

> `authorize()` (`lib/api-guard.ts`) y las funciones de `lib/auth.ts` quedan fuera: dependen de la sesión de Clerk y de la base de datos en tiempo real, son de integración.

---

## 2. `account`

| Función | Archivo | Descripción |
|---|---|---|
| `toAccountProfile(user: User): AccountProfile` | `modules/account/lib/profile.ts` | Mapea un `User` de Clerk al modelo de perfil de cuenta (nombre, email, verificación, teléfono, iniciales, fechas ISO). |
| *(privada)* `toInitials(user): string` | `modules/account/lib/profile.ts` | Calcula las iniciales del usuario a partir de nombre/apellido o, en su defecto, la primera letra del correo. |
| *(privada)* `toIsoDate(unixMs): string \| null` | `modules/account/lib/profile.ts` | Convierte un timestamp Unix en milisegundos (o `null`) a ISO string. |

---

## 3. `audit`

| Función | Archivo | Descripción |
|---|---|---|
| `auditActionLabel(code: string): string` | `modules/audit/constants.ts` | Traduce el código de una acción de auditoría a su etiqueta en español, o devuelve el código si no está en el catálogo. |
| `entityTypeLabel(entityType: string): string` | `modules/audit/constants.ts` | Traduce el tipo de entidad auditada (`user`, `category`, `product`...) a una etiqueta legible. |
| `auditFieldLabel(field: string): string` | `modules/audit/constants.ts` | Traduce el nombre técnico de un campo modificado a su etiqueta visible. |
| `auditLogQuerySchema` (Zod) | `modules/audit/schemas/audit-log.schema.ts` | Valida los filtros de consulta de la bitácora: actor, entidad, acción, severidad, rango de fechas y paginación. |

---

## 4. `cart`

| Función | Archivo | Descripción |
|---|---|---|
| `selectItemCount(state): number` | `modules/cart/store/cart.store.ts` | Selector puro: suma las cantidades de todas las líneas del carrito. |
| `selectSubtotalCents(state): number` | `modules/cart/store/cart.store.ts` | Selector puro: calcula el subtotal en céntimos sumando precio × cantidad de cada línea. |
| `selectQuantityForProduct(productId)`  → `(state) => number` | `modules/cart/store/cart.store.ts` | Factoría de selector: devuelve la cantidad de un producto específico en el carrito, o 0 si no está. |
| *(privada)* `clampQuantity(quantity: number): number` | `modules/cart/store/cart.store.ts` | Acota una cantidad entre 1 y `MAX_LINE_QUANTITY`, truncando decimales. Usada por las acciones `add`/`setQuantity` del store. |

---

## 5. `categories`

| Función / Schema | Archivo | Descripción |
|---|---|---|
| `categorySlugSchema` (Zod) | `modules/categories/schemas/category.schema.ts` | Valida formato de slug: 2-140 caracteres, minúsculas/números/guiones. |
| `createCategorySchema` (Zod) | `modules/categories/schemas/category.schema.ts` | Valida el payload de creación de categoría con defaults (`description`, `imageUrl`, `isActive`). |
| `updateCategorySchema` (Zod) | `modules/categories/schemas/category.schema.ts` | Valida un PATCH parcial; `.refine()` exige al menos un campo presente. |
| `categoryQuerySchema` (Zod) | `modules/categories/schemas/category.schema.ts` | Valida filtros de listado: búsqueda, estado, paginación y orden. |
| `categoryIdSchema` (Zod) | `modules/categories/schemas/category.schema.ts` | Valida que el id sea un UUID. |

---

## 6. `orders`

Módulo extenso — dividido por submódulo.

### 6.1 `orders/lib` (cálculos y fechas)

| Función | Archivo | Descripción |
|---|---|---|
| `calculateSubtotalCents(lines): number` | `modules/orders/lib/totals.ts` | Suma precio × cantidad de todas las líneas de checkout. |
| `calculateShippingCents(subtotalCents): number` | `modules/orders/lib/totals.ts` | Determina el costo de envío según el umbral de envío gratis. |
| `calculateOrderTotals(lines): OrderTotals` | `modules/orders/lib/totals.ts` | Compone subtotal, envío y total — es la única fuente del importe que ven cliente y Stripe. |
| `currentMonthRange(now?: Date): OrderHistoryRange` | `modules/orders/lib/order-history-range.ts` | Calcula el rango ISO (inicio/fin) del mes actual en hora local, con reloj inyectable. |
| `dayRange(fromDay, toDay): OrderHistoryRange` | `modules/orders/lib/order-history-range.ts` | Convierte dos strings `YYYY-MM-DD` en un rango ISO de inicio/fin de día en hora local. |
| `toDayInputValue(date: Date): string` | `modules/orders/lib/order-history-range.ts` | Formatea una fecha a `YYYY-MM-DD` en hora local (para `<input type="date">`). |
| *(privada)* `parseDay(day: string)` | `modules/orders/lib/order-history-range.ts` | Parsea `YYYY-MM-DD` a `[año, mes, día]` numéricos. |
| *(privada)* `startOfDay` / `endOfDay(year, month, date)` | `modules/orders/lib/order-history-range.ts` | Construyen el `Date` de las 00:00:00.000 y 23:59:59.999 locales de un día. |
| `groupOrdersByDay(entries): OrderDayGroup[]` | `modules/orders/lib/group-orders-by-day.ts` | Agrupa pedidos por día local, con etiqueta formateada en español (respeta el orden de entrada). |

### 6.2 `orders/constants` (mensajes)

| Función | Archivo | Descripción |
|---|---|---|
| `productUnavailableMessage(name: string): string` | `modules/orders/constants.ts` | Genera el mensaje de conflicto cuando un producto del carrito ya no está activo. |
| `productOutOfStockMessage(name, available): string` | `modules/orders/constants.ts` | Genera el mensaje de conflicto por stock insuficiente o agotado, variando el texto según cantidad disponible. |

### 6.3 `orders/schemas`

| Schema | Archivo | Descripción |
|---|---|---|
| `checkoutLineSchema` (Zod) | `modules/orders/schemas/checkout.schema.ts` | Valida una línea de checkout: `productId` (UUID) y cantidad dentro del máximo permitido. |
| `checkoutSchema` (Zod) | `modules/orders/schemas/checkout.schema.ts` | Valida el carrito completo del checkout; `.refine()` rechaza productos duplicados. |
| `orderHistoryQuerySchema` (Zod) | `modules/orders/schemas/order-history.schema.ts` | Valida el rango de fechas del historial; `.refine()` rechaza `from` posterior a `to`. |
| `orderIdParamSchema` (Zod) | `modules/orders/schemas/order-history.schema.ts` | Valida que el id de pedido sea un UUID. |

### 6.4 `orders` — lógica de negocio en `server/services` (requiere mocks de Stripe/Drizzle)

| Función | Archivo | Descripción |
|---|---|---|
| *(privada)* `buildOrderItems(input, catalog)` | `server/services/checkout.service.ts` | Cruza las líneas del carrito con el catálogo recién leído; lanza conflicto si el producto no existe, está inactivo o no hay stock suficiente. Lógica crítica de bloqueo de stock. |
| *(privada)* `toLineItems(order): Stripe.LineItem[]` | `server/services/checkout.service.ts` | Mapea una orden preparada a los `line_items` que espera la API de Stripe Checkout. |
| *(privada)* `toShippingOptions(order): Stripe.ShippingOption[]` | `server/services/checkout.service.ts` | Construye la opción de envío de Stripe (gratis o estándar) según el total calculado. |
| *(privada)* `readOrderId(session): string \| null` | `server/services/order-fulfillment.service.ts` | Extrae el `orderId` desde `metadata` de una sesión de Stripe Checkout. |
| *(privada)* `readPaymentIntentId(session): string \| null` | `server/services/order-fulfillment.service.ts` | Extrae el id del PaymentIntent de una sesión, soportando el campo como string u objeto expandido. |
| *(privada)* `readShippingAddress(session)` | `server/services/order-fulfillment.service.ts` | Extrae y remapea la dirección de envío recolectada por Stripe. |
| *(privada)* `auditMetadata(session, eventId)` | `server/services/order-fulfillment.service.ts` | Construye los metadatos mínimos (sin PII) que acompañan cada entrada de auditoría generada por el webhook. |

---

## 7. `payments`

| Función / Schema | Archivo | Descripción |
|---|---|---|
| `cardBrandLabel(brand: string): string` | `modules/payments/lib/card-display.ts` | Resuelve el nombre visible de una marca de tarjeta; si no está en el mapa, capitaliza cada palabra separada por `_`. |
| `formatCardExpiry(month, year): string` | `modules/payments/lib/card-display.ts` | Formatea la caducidad como `MM/AAAA` con el mes a dos dígitos. |
| `isCardExpired(month, year, now?: Date): boolean` | `modules/payments/lib/card-display.ts` | Determina si una tarjeta venció (al final de su mes de caducidad), con reloj inyectable para pruebas. |
| `paymentMethodIdParamSchema` (Zod) | `modules/payments/schemas/payment-method.schema.ts` | Valida que el id de tarjeta guardada sea un UUID propio (no un id de Stripe). |
| *(privada)* `readSetupIntentId(session): string \| null` | `server/services/payment-method.service.ts` | Extrae el id del SetupIntent de una sesión de Stripe, soportando string u objeto expandido. |
| *(privada)* `readBrand(card): string` | `server/services/payment-method.service.ts` | Resuelve la marca a persistir priorizando `display_brand` sobre `brand`, normalizada a minúsculas. |

---

## 8. `products`

Módulo extenso — dividido por submódulo.

### 8.1 `products/lib` (precio)

| Función | Archivo | Descripción |
|---|---|---|
| `toCents(value: string): number` | `modules/products/lib/price.ts` | Convierte un precio decimal en texto (ej. `"1299.90"`) a céntimos enteros usando aritmética de cadenas, evitando errores de coma flotante. |
| `fromCents(cents: number): string` | `modules/products/lib/price.ts` | Inversa exacta de `toCents`: convierte céntimos a texto decimal para rellenar formularios. |
| `formatPrice(cents: number): string` | `modules/products/lib/price.ts` | Formatea céntimos como moneda peruana (`Intl.NumberFormat`, `es-PE`/`PEN`). |

### 8.2 `products/schemas`

| Función / Schema | Archivo | Descripción |
|---|---|---|
| `isValidComparePrice(priceCents, compareAtPriceCents): boolean` | `modules/products/schemas/product.schema.ts` | Valida que el precio anterior (tachado) sea mayor que el precio actual, o sea `null`/`undefined`. |
| `productSlugSchema` (Zod) | `modules/products/schemas/product.schema.ts` | Valida formato de slug de producto (2-180 caracteres, minúsculas/números/guiones). |
| `skuSchema` (Zod) | `modules/products/schemas/product.schema.ts` | Valida formato de SKU (mayúsculas, números y guiones). |
| `createProductSchema` (Zod) | `modules/products/schemas/product.schema.ts` | Valida el payload de creación con defaults y `.refine()` de `isValidComparePrice`. |
| `updateProductSchema` (Zod) | `modules/products/schemas/product.schema.ts` | Valida un PATCH parcial; exige al menos un campo. |
| `productQuerySchema` (Zod) | `modules/products/schemas/product.schema.ts` | Valida filtros de listado admin: búsqueda, estado, categoría, paginación y orden. |
| `productIdSchema` (Zod) | `modules/products/schemas/product.schema.ts` | Valida que el id sea un UUID. |
| `productFormSchema` (Zod) | `modules/products/schemas/product.schema.ts` | Valida el formulario de producto (precio como texto); `.refine()` reutiliza `isValidComparePrice` sobre los valores convertidos con `toCents`. |
| `catalogQuerySchema` (Zod) | `modules/products/schemas/catalog.schema.ts` | Valida el contrato público de `GET /api/products`: búsqueda, categoría, orden cerrado, descuento y paginación acotada. |
| `catalogSlugParamSchema` (Zod) | `modules/products/schemas/catalog.schema.ts` | Valida el slug de producto en la ruta pública, reutilizando el patrón de `productSlugSchema`. |

> `buildFilters` y `buildCatalogFilters` del mismo archivo son puras en el sentido de no hacer I/O, pero devuelven fragmentos `SQL` de Drizzle: solo se pueden aserear inspeccionando el SQL generado, por lo que rinden más como prueba de integración.

---

## 9. `roles`

| Función | Archivo | Descripción |
|---|---|---|
| `roleLabel(slug: RoleSlug): string` | `modules/roles/constants.ts` | Traduce el slug de un rol a su nombre visible, o devuelve el slug si no está en el catálogo. |
| `roleOrder(slug: string): number` | `modules/roles/constants.ts` | Devuelve el índice de presentación de un rol en la matriz (orden fijo, no alfabético). |
| `roleDescription(slug: RoleSlug): string` | `modules/roles/constants.ts` | Devuelve la descripción larga de un rol. |
| `resourceLabel(resource: string): string` | `modules/roles/constants.ts` | Traduce el nombre técnico de un recurso (`categories`, `users`...) a su etiqueta visible. |
| `actionLabel(action: string): string` | `modules/roles/constants.ts` | Traduce el nombre técnico de una acción (`read`, `assign_elevated_roles`...) a su etiqueta visible. |

---

## 10. `storefront`

| Función | Archivo | Descripción |
|---|---|---|
| `getCategoryIcon(slug: string): LucideIcon` | `modules/storefront/constants.ts` | Resuelve el ícono de una categoría por slug, con ícono por defecto (`Package`) si no está mapeada. |
| `getBrandImage(slug: string): string \| null` | `modules/storefront/constants.ts` | Resuelve la ruta de imagen de marca por slug de categoría, o `null` si no existe el asset. |

> `prefersReducedMotion` / `scrollBehavior` (`modules/storefront/lib/motion.ts`) quedan fuera: dependen de `window.matchMedia` del navegador, no son lógica de negocio pura.

---

## 11. `users`

| Schema | Archivo | Descripción |
|---|---|---|
| `roleSlugSchema` (Zod) | `modules/users/schemas/user.schema.ts` | Enum derivado del catálogo de roles (`ROLE_DEFINITIONS`), evita duplicar los slugs a mano. |
| `inviteUserSchema` (Zod) | `modules/users/schemas/user.schema.ts` | Valida el payload de invitación: correo válido y al menos un rol. |
| `assignRolesSchema` (Zod) | `modules/users/schemas/user.schema.ts` | Valida el reemplazo total de roles de un usuario. |
| `updateUserSchema` (Zod) | `modules/users/schemas/user.schema.ts` | Valida el cambio de `isActive`. |
| `userQuerySchema` (Zod) | `modules/users/schemas/user.schema.ts` | Valida filtros de listado: búsqueda, estado, rol, paginación y orden. |

---

## 12. `server/services` (lógica de negocio de servidor — requiere mocks de Clerk/Stripe/Drizzle)

Estas funciones concentran reglas de negocio críticas (protección de roles
elevados, sincronización con Clerk). Hoy son privadas y solo se ejercitan
indirectamente a través del flujo completo del servicio.

| Función | Archivo | Descripción |
|---|---|---|
| *(privada)* `assertMayTouch(roles, granted): void` | `server/services/user-access.service.ts` | Lanza `ForbiddenError` si alguno de los roles afectados es elevado y el actor no tiene `users.assign_elevated_roles`. Regla de seguridad central del módulo de usuarios. |
| *(privada)* `sameSlugs(before, after): boolean` | `server/services/user-access.service.ts` | Compara dos listas de slugs de rol ignorando el orden, para evitar auditar un "cambio" que no cambió nada. |
| *(privada)* `clerkStatusOf(error): number \| null` | `server/services/user-access.service.ts` | Extrae el status HTTP de un error lanzado por la Backend API de Clerk. |
| *(privada)* `readRoleSlugs(publicMetadata): RoleSlug[]` | `server/services/user-sync.service.ts` | Parsea y sanea (con `.catch({})`) los `roleSlugs` de los metadatos públicos de un evento de Clerk. |
| *(privada)* `readPrimaryEmail(data): string \| null` | `server/services/user-sync.service.ts` | Extrae el correo primario (no cualquiera de la lista) de un evento `user.created`/`user.updated`. |
| *(privada)* `toUpsertValues(data)` | `server/services/user-sync.service.ts` | Mapea el payload del webhook de Clerk a los valores de upsert de `users`; devuelve `null` si no hay correo. |

---

## Resumen de cobertura por módulo

| Módulo | Funciones puras/testeables encontradas |
|---|---|
| `lib` (global) | 11 exportadas + 2 privadas de apoyo |
| `account` | 1 exportada + 2 privadas |
| `audit` | 3 exportadas + 1 schema |
| `cart` | 3 selectores + 1 privada |
| `categories` | 5 schemas |
| `orders` | 6 exportadas + 4 privadas (lib) + 2 mensajes + 4 schemas + 7 privadas (services) |
| `payments` | 3 exportadas + 1 schema + 2 privadas (services) |
| `products` | 3 exportadas (precio) + 8 schemas + 1 privada (repository) |
| `roles` | 5 exportadas |
| `storefront` | 2 exportadas |
| `users` | 5 schemas |
| `server/services` | 6 privadas de alto valor |
| `dashboard`, `customers` | Sin código propio (solo `.gitkeep`) |
