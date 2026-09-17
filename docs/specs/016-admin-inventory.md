---
id: 016
title: Control de inventario en administración
status: done
module: products
scope: admin
created: 2026-09-17
---

# 016 — Control de inventario en administración

## 1. Contexto

Hoy el stock solo es visible de dos formas, y ninguna sirve para trabajarlo. En
`/admin/products` es una columna más de una tabla ordenable: hay que recordar
ordenar por stock ascendente y leer los números uno a uno para saber qué está a
punto de agotarse. En `/admin` (spec 015) hay un widget de «Stock bajo», pero es
deliberadamente un aviso de un vistazo: máximo 10 filas (`LOW_STOCK_LIMIT`), sin
búsqueda, sin filtro por categoría y sin acción — su propio comentario remite a
«/admin/products ordenado por stock» a quien necesite la lista entera.

El umbral que decide qué es «poco stock» vive en
`src/modules/dashboard/constants.ts` como `LOW_STOCK_THRESHOLD = 10`, y su
comentario dice literalmente que «el spec de Inventario lo hará configurable y
esta constante será su default (D-12)». Este spec cierra la parte de visibilidad
y **no** hace configurable el umbral: lo reubica donde pertenece y deja la
configurabilidad como deuda explícita (§11).

`docs/SETUP.md` §6 no reserva ninguna sección de inventario; esta es nueva.

## 2. Objetivo

Una persona con `inventory.read` abre `/admin/inventory` y ve, en una sola
pantalla buscable por nombre o SKU y filtrable por categoría, todos los productos
activos que están agotados o por debajo del umbral de alerta, ordenados por
urgencia, y puede corregir el stock de cualquiera de ellos sin salir de la página.

## 3. Alcance

### Incluye

- Permiso nuevo `inventory.read` (`resource: 'inventory'`) en el catálogo y en la
  matriz rol × permiso, para los mismos cuatro roles que hoy abren el panel.
- Página `/admin/inventory` protegida con
  `requirePagePermission('inventory.read')`, con su entrada en la navegación.
- `GET /api/admin/inventory`: listado paginado de productos **activos** con
  `stock < LOW_STOCK_THRESHOLD`, con búsqueda de texto sobre nombre y SKU y
  filtro por categoría.
- Repositorio nuevo `inventory.repository.ts` con su función de filtros exportada
  y probada.
- Módulo `src/modules/inventory/` completo: schema Zod, tipos, constantes,
  service, hook, función pura de estado de stock, badge, columnas y tabla.
- Mudanza de `LOW_STOCK_THRESHOLD` de `src/modules/dashboard/constants.ts` a
  `src/modules/products/constants.ts`, con sus dos importadores actualizados, de
  modo que dashboard e inventario lean **la misma** constante.
- Edición rápida del stock reutilizando `ProductFormDialog` del módulo de
  productos, visible solo con `products.update`.

### No incluye (explícito)

- Tabla de movimientos de stock (entradas, salidas, ajustes) ni su historial.
- Historial auditable de quién cambió el stock y cuándo. La edición pasa por
  `PATCH /api/admin/products/[id]`, que ya escribe `product.updated` en
  `audit_logs`; este spec no añade ninguna acción de auditoría nueva.
- Umbral configurable por producto, por categoría o desde la UI. Sigue siendo una
  constante global; este spec solo la reubica.
- Cualquier mutación nueva sobre `stock`. No hay `PATCH /api/admin/inventory` ni
  edición en línea en la celda: la única escritura sigue siendo la de productos.
- Órdenes de compra, reposición, proveedores o previsión de demanda.
- Ordenación configurable por el usuario: el orden es fijo (§8, D-7).
- Exportación a CSV y notificaciones por correo de stock bajo.

## 4. Criterios de aceptación

- [x] AC1 — Dado un visitante sin sesión, cuando pide `GET /api/admin/inventory`,
      entonces recibe `401` con cuerpo `{ message }` y **no** un `307` al
      formulario de Clerk.
- [x] AC2 — Dado un usuario con sesión y sin `inventory.read`, cuando pide
      `GET /api/admin/inventory?page=abc`, entonces recibe `403` y no `400`: la
      autorización ocurre antes de mirar la query.
- [x] AC3 — Dado un usuario sin `inventory.read`, cuando abre `/admin/inventory`,
      entonces ve el `403` de `src/app/forbidden.tsx` y la entrada «Inventario» no
      aparece en la navegación del panel.
- [x] AC4 — Dado un catálogo con productos por encima y por debajo del umbral,
      cuando se pide el listado, entonces solo salen los activos con
      `stock < LOW_STOCK_THRESHOLD`.
- [x] AC5 — Dado un producto con `stock >= LOW_STOCK_THRESHOLD`, cuando se busca
      exactamente su nombre o su SKU, entonces no aparece: el filtro invariante no
      es desactivable desde la query.
- [x] AC6 — Dado un producto inactivo con `stock = 0`, cuando se pide el listado,
      entonces no aparece: lo retirado del catálogo no se repone.
- [x] AC7 — Dado un producto con `stock = 0`, entonces su fila muestra el badge
      «Agotado» en tono destructivo con icono; dado uno con
      `0 < stock < umbral`, muestra «Stock bajo» en ámbar con icono. En ambos
      casos la diferencia se comunica con texto además de con color.
- [x] AC8 — Dado el listado, entonces las filas llegan ordenadas por `stock`
      ascendente y, a igual stock, por nombre ascendente.
- [x] AC9 — Dado `search=50%_off`, entonces `%` y `_` se buscan como texto
      literal y no como comodines de `LIKE`; la búsqueda cubre nombre y SKU y es
      insensible a mayúsculas.
- [x] AC10 — Dado `categoryId` con el uuid de una categoría, entonces solo salen
      los productos de esa categoría; con el valor `all`, no se filtra.
- [x] AC11 — Dado `page=0` o `pageSize=500`, entonces la respuesta es `400` con
      `{ message, issues }`.
- [x] AC12 — Dado que ningún producto activo está bajo el umbral y no hay filtros
      aplicados, entonces la tabla muestra un estado vacío afirmativo («Todo el
      inventario está en orden»), no un hueco en blanco ni un mensaje de error.
      Con filtros aplicados y cero coincidencias, muestra «Sin resultados» y un
      botón para limpiarlos.
- [x] AC13 — Dado un usuario con `inventory.read` y sin `products.update` (rol
      `audit`), entonces `meta.canUpdateProduct` es `false` y la tabla no pinta ni
      el botón «Editar» ni la columna de acciones.
- [x] AC14 — Dado un producto en la lista, cuando se edita su stock por encima
      del umbral desde el diálogo y se guarda, entonces la fila desaparece del
      listado sin recargar la página.
- [x] AC15 — Dada la primera carga, entonces la tabla muestra el esqueleto de
      `DataTable`; ante un fallo de red, el mensaje de error con «Reintentar».

## 5. Modelo de datos

**Sin cambios de esquema.** No hay tabla nueva, ni columna nueva, ni migración.
Se lee `products` y `categories` tal y como están.

| Tabla | Archivo | Columnas que se usan |
|---|---|---|
| `products` | `src/server/db/schema/product.ts` | `id`, `sku`, `name`, `slug`, `description`, `image_url`, `price_cents`, `compare_at_price_cents`, `stock`, `specs`, `category_id`, `is_active`, `created_at`, `updated_at` |
| `categories` | `src/server/db/schema/category.ts` | `id`, `name`, `slug` — vía join, para la columna «Categoría» |

Índices existentes que sostienen la consulta: `products_is_active_idx` y
`products_category_id_idx`. No se añade ningún índice; el compromiso está en §10.

Lo único que cambia como **dato semilla** es el catálogo de permisos, que no es
migración sino `npm run db:seed` (idempotente: `seedPermissions` hace
`onConflictDoUpdate` por `code` y `seedRolePermissions`, `onConflictDoNothing`).

```ts
// src/lib/permissions.ts — una entrada nueva en PERMISSIONS (pasa de 18 a 19)
{
  code: 'inventory.read',
  resource: 'inventory',
  action: 'read',
  description: 'Ver el control de inventario y las alertas de stock.',
},
```

Matriz rol × permiso resultante. Verificado contra el `ROLE_PERMISSION_MATRIX`
real: los cuatro roles que hoy abren el panel son exactamente `super_admin`,
`admin`, `manager` y `audit`; `employee` y `customer` tienen el conjunto vacío.

| Rol | `inventory.read` | `products.update` (edición desde la fila) |
|---|---|---|
| `super_admin` | sí | sí |
| `admin` | sí | sí |
| `manager` | sí | sí |
| `audit` | sí | **no** — ve la tabla y ninguna acción |
| `employee`, `customer` | no | no |

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/inventory` | `inventory.read` | query: `search?`, `categoryId?`, `page?`, `pageSize?` | `InventoryListResponse` | 400, 401, 403, 500 |

No se añade ningún verbo de escritura. La corrección de stock sigue siendo
`PATCH /api/admin/products/[id]` bajo `products.update`, ya construido en el
spec 003 y con su entrada en `audit_logs`.

Errores con el contrato ya vigente: `toErrorResponse()` y `badRequest()` de
`src/lib/api-guard.ts`, cuerpo `{ message }` y `{ message, issues }` en el `400`
de validación, que es lo que espera el interceptor de `src/lib/axios.ts`.

Cero filas es `200` con `data: []`, nunca `404`: «ningún producto bajo el umbral»
es una respuesta legítima —y la buena— del recurso (AC12).

### Zod de entrada — `src/modules/inventory/schemas/inventory.schema.ts`

```ts
import { z } from 'zod';

export const inventoryQuerySchema = z.object({
  // Texto libre sobre nombre y SKU. `trim()` aquí para que un `search` de solo
  // espacios llegue al repositorio como cadena vacía y no filtre nada.
  search: z.string().trim().max(160).optional(),
  // Centinela `all` en vez de omitir el parámetro: el `Select` de shadcn no admite
  // un item con valor vacío, y `products` ya usa esta misma forma (D-4).
  categoryId: z.union([z.literal('all'), z.uuid()]).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type InventoryQueryParams = z.output<typeof inventoryQuerySchema>;
```

### Tipos de salida — `src/modules/inventory/types/inventory.types.ts`

```ts
import type { ProductWithCategory } from '@/modules/products/types/product.types';

// `'in'` no aparece nunca en una respuesta de este endpoint —el WHERE lo excluye—
// pero la función pura lo devuelve igualmente y el badge lo mapea: estrechar el
// tipo a 'out' | 'low' obligaría a un cast en el repositorio (D-6).
export type StockStatus = 'out' | 'low' | 'in';

// La fila es el producto entero con su categoría, no una proyección corta: es lo
// que `ProductFormDialog` recibe por props sin una segunda petición (D-5).
export type InventoryRow = ProductWithCategory & { status: StockStatus };

export type InventoryListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  // El umbral que usó la consulta, no el que el cliente supone: el rótulo tiene
  // que decir el mismo número que filtró. Mismo criterio que `lowStockThreshold`
  // en el `meta` del dashboard.
  threshold: number;
  // Resuelto en el servidor; la UI solo oculta controles. La frontera real es el
  // 403 del PATCH de productos (AC13).
  canUpdateProduct: boolean;
};

export type InventoryListResponse = {
  data: InventoryRow[];
  meta: InventoryListMeta;
};
```

### Forma del handler — `src/app/api/admin/inventory/route.ts`

```ts
export async function GET(request: Request) {
  try {
    // Antes de tocar la query (AC2), igual que orders (spec 014) y metrics (015).
    const { granted } = await authorize('inventory.read');

    const { searchParams } = new URL(request.url);
    const parsed = inventoryQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const { data, total } = await inventoryRepository.findLowStock(
      parsed.data,
      LOW_STOCK_THRESHOLD,
    );
    const { page, pageSize } = parsed.data;

    const body: InventoryListResponse = {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        threshold: LOW_STOCK_THRESHOLD,
        canUpdateProduct: can(granted, 'products.update'),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/inventory',
      fallback: 'No se pudo obtener el inventario',
    });
  }
}
```

### Consulta del repositorio

`WHERE is_active = true AND stock < $threshold`, más `ilike` sobre
`name`/`sku` con el patrón escapado y `category_id` si no es `all`.
`ORDER BY stock asc, name asc, id asc`. `LIMIT/OFFSET` como orders y products.

```ts
// src/server/repositories/inventory.repository.ts — firma propuesta
export function buildInventoryFilters(
  params: Pick<InventoryQueryParams, 'search' | 'categoryId'>,
  threshold: number,
): SQL;

export async function findLowStock(
  params: InventoryQueryParams,
  threshold: number,
  reader: Reader = db,
): Promise<{ data: InventoryRow[]; total: number }>;
```

## 7. Arquitectura y archivos afectados

- `src/server/db/schema/` — sin cambios.
- `src/lib/permissions.ts` — `inventory.read` en `PERMISSIONS` y en los cuatro
  roles de `ROLE_PERMISSION_MATRIX`.
- `src/modules/dashboard/constants.ts` — **sale** `LOW_STOCK_THRESHOLD`.
- `src/modules/products/constants.ts` — **entra** `LOW_STOCK_THRESHOLD = 10` con
  su comentario de procedencia.
- `src/app/api/admin/metrics/route.ts` — importa el umbral desde productos
  (importador 1 de 2, verificado).
- `src/modules/dashboard/components/dashboard-overview.tsx` — importa el umbral
  desde productos (importador 2 de 2, verificado: lo usa como respaldo del
  `meta.lowStockThreshold`).
- `src/server/repositories/product.repository.ts` — renombrar el
  `const LOW_STOCK_THRESHOLD = 5` local del catálogo público a
  `CATALOG_LOW_STOCK_THRESHOLD` (D-3). Sin cambio de valor ni de comportamiento.
- `src/server/repositories/inventory.repository.ts` + `.test.ts` — **nuevo**:
  `buildInventoryFilters()` y `findLowStock()`.
- `src/app/api/admin/inventory/route.ts` — **nuevo**: `GET`.
- `src/modules/inventory/schemas/inventory.schema.ts` + `.test.ts` — **nuevo**.
- `src/modules/inventory/types/inventory.types.ts` — **nuevo**.
- `src/modules/inventory/lib/stock-status.ts` + `.test.ts` — **nuevo**:
  `resolveStockStatus()`, pura.
- `src/modules/inventory/constants.ts` — **nuevo**: `inventoryKeys`,
  `INVENTORY_PAGE_SIZE`, `INVENTORY_SEARCH_DEBOUNCE_MS`, `STOCK_STATUS_LABELS` y
  los copys de los dos estados vacíos.
- `src/modules/inventory/services/inventory.service.ts` — **nuevo**:
  `fetchInventory()` con axios. Único punto que habla con la API.
- `src/modules/inventory/hooks/use-inventory.ts` — **nuevo**: `useInventory()`
  sobre TanStack Query con `keepPreviousData`.
- `src/modules/inventory/components/stock-status-badge.tsx` — **nuevo**.
- `src/modules/inventory/components/inventory-columns.tsx` — **nuevo**:
  `getInventoryColumns()`.
- `src/modules/inventory/components/inventory-table.tsx` — **nuevo**: contenedor
  `"use client"` con buscador, select de categoría, `DataTable` y el
  `ProductFormDialog` importado del módulo de productos.
- `src/modules/products/hooks/use-product-mutations.ts` — `useUpdateProduct()`
  invalida además `inventoryKeys.lists()` (D-8, AC14).
- `src/app/(admin)/admin/inventory/page.tsx` — **nuevo**: Server Component con
  `requirePagePermission('inventory.read')`.
- `src/app/(admin)/admin/layout.tsx` — entrada «Inventario» en `NAV_ITEMS`.
- `docs/SETUP.md` — §6: sección de inventario construida.

Flujo, capa por capa, sin saltos:

```
InventoryTable ("use client")
  → useInventory (TanStack Query)
    → fetchInventory (axios)
      → GET /api/admin/inventory (authorize + Zod)
        → inventory.repository (Drizzle) → Neon
```

Ningún componente importa `db`, Drizzle ni el repositorio, y ninguno llama a
axios directo.

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1**: Permiso propio `inventory.read` con `resource: 'inventory'` | Reutilizar `products.read` | Mismo criterio que `dashboard.read` (spec 015, D-2): un permiso por recurso es la regla del catálogo desde el spec 002. Además deja la puerta abierta a un rol de almacén que vea inventario sin ver precios ni poder crear productos, sin tener que partir `products.read` después |
| **D-2**: `LOW_STOCK_THRESHOLD` se muda a `src/modules/products/constants.ts` | Dejarlo en `dashboard/constants.ts` e importarlo desde inventario; o duplicarlo | «Menos de N unidades» es una propiedad del producto, no del dashboard: que el módulo de inventario importe de `dashboard` para saber qué es poco stock invierte la dependencia. Duplicarlo garantiza que un día el widget y la página digan números distintos |
| **D-3**: Renombrar a `CATALOG_LOW_STOCK_THRESHOLD` el `const` local de `product.repository.ts` | Dejar los dos nombres iguales con valores distintos (5 y 10) | Verificado en el código: `product.repository.ts` ya define su propio `LOW_STOCK_THRESHOLD = 5` para el `STOCK_LEVEL` del catálogo público, que es otra cosa —información comercial para el comprador— y con otro valor. Tras la mudanza habría dos identificadores homónimos con valores distintos a un import de distancia; el primero que importe el compartido en ese archivo lo sombrea sin querer. El renombrado cuesta dos líneas y elimina la trampa |
| **D-4**: `categoryId` con centinela `'all'` en vez de parámetro omitido | `categoryId: z.uuid().optional()` | El `Select` de shadcn/Radix no admite un item con `value=""`, así que el «todas» necesita un valor real; `productQuerySchema` ya resuelve esto con `z.union([z.literal('all'), z.uuid()])` y copiar ese contrato evita dos convenciones para el mismo filtro. Semánticamente equivale al opcional del diseño aprobado |
| **D-5**: La fila del listado es `ProductWithCategory` completo | Fila corta (`id`, `sku`, `name`, `categoryName`, `stock`) y un `GET /api/admin/products/[id]` al pulsar «Editar» | `ProductFormDialog` recibe `product: ProductWithCategory \| null` y usa hasta `categoryName` para el caso de la categoría desactivada. Con la fila corta haría falta una segunda petición y un estado de carga dentro del diálogo. No hay fuga de privilegio: los cuatro roles con `inventory.read` son exactamente los que ya tienen `products.read`, y una página de 20 filas es un payload menor que el del listado de productos |
| **D-6**: `StockStatus` incluye `'in'` aunque el endpoint no lo devuelva nunca | `type StockStatus = 'out' \| 'low'` | El WHERE excluye `'in'`, pero TypeScript no lo sabe: estrechar el tipo obligaría a un cast en el mapeo del repositorio. Un mapa total en el badge cuesta una línea y `resolveStockStatus` queda probada en sus tres ramas, incluida la que hoy no se alcanza |
| **D-7**: Tipo `StockStatus` propio y no reutilizar `StockLevel` de `catalog.types.ts` | Importar `StockLevel` del catálogo público | Tienen los mismos tres valores y significados distintos: `StockLevel` lo deriva un `CASE` de SQL con umbral 5 para el comprador y nunca publica el entero; este se deriva en TypeScript con umbral 10 para quien repone y sí publica el entero. Acoplarlos haría que subir el umbral del panel cambiase lo que ve la tienda |
| **D-8**: Orden fijo `stock asc, name asc, id asc`, sin `sortBy` en la query | Cabeceras ordenables como en `/admin/products` | La pantalla existe para responder «qué atiendo primero»; un orden elegible permite justamente ocultar lo urgente. `id` cierra el desempate para que la paginación sea estable: sin él, dos productos con el mismo stock y el mismo nombre pueden repetirse entre páginas |
| **D-9**: El `status` lo deriva el servidor con `resolveStockStatus(stock, threshold)` y viaja en la fila; el umbral viaja en `meta` | Que el cliente calcule el estado leyendo la constante | El número que rotula la pantalla tiene que ser el que usó la consulta. Es el mismo criterio que ya aplica `LowStockWidget`, que recibe `threshold` por props y no lo lee de la constante |
| **D-10**: `useUpdateProduct()` invalida también `inventoryKeys.lists()` | Invalidar desde el contenedor de inventario al cerrar el diálogo | La mutación es la única escritora de stock y es quien sabe que acaba de cambiarlo; hacerlo al cerrar el diálogo lo ataría a un gesto de UI y fallaría si el diálogo se cierra con Escape tras guardar. El import es de constantes, sin ciclo: `inventory/constants.ts` solo depende de su propio schema |
| **D-11**: Reutilizar `ProductFormDialog` por import cross-módulo | Un `StockEditDialog` propio de inventario con un solo campo | El formulario de producto ya valida stock, ya gestiona los dos `409` de SKU/slug, ya resuelve categorías y ya invalida el caché. Duplicarlo solo para cambiar un entero sería una segunda definición del mismo formulario que se desincroniza al primer campo nuevo. Se acepta a cambio el acoplamiento `inventory → products`, que es el sentido natural de la dependencia (el inventario es una vista de productos, no al revés) |
| **D-12**: Buscador y select de categoría dentro de `inventory-table.tsx`, sin componente de filtros aparte | Un `InventoryFilters` como el `AdminOrderFilters` de orders | Son dos controles sin estado derivado ni validación cruzada, igual que en `products-table.tsx`, que los tiene inline. El componente aparte de orders existe porque allí hay un rango de fechas con borrador, aplicación diferida y validación de rango invertido |
| **D-13**: Badge «Agotado» destructivo y «Stock bajo» ámbar, ambos con icono y texto | Distinguir solo por color | Verificado: `badge.tsx` no tiene variante `warning`, así que el ámbar se compone con `variant="outline"` más clases de color, como `kpi-card.tsx` compone su `text-emerald-600 dark:text-emerald-400`. El texto y el icono son obligatorios por el mismo motivo que en el spec 015 (D-16): solo color es inaccesible para daltonismo y en impresión |
| **D-14**: Ninguna plantilla `sql` ad hoc reutilizada entre `select`, `groupBy` y `orderBy` | Derivar el `status` con un `CASE` en SQL, como hace `STOCK_LEVEL` en el catálogo | Esta consulta no agrupa y ordena solo por columnas reales de Drizzle (`products.stock`, `products.name`, `products.id`), así que la clase de bug del spec 015 —Drizzle cualificando la misma expresión de dos formas y Postgres exigiendo coincidencia textual, error `42803`— no puede darse aquí. Derivar el estado en TypeScript además lo hace comprobable sin base de datos |
| **D-15**: `authorize('inventory.read')` en la primera línea del handler | Validar la query primero | Sin permiso no se debe poder enumerar el contrato a base de `400` antes de recibir el `403` (AC2). Mismo criterio que orders (spec 014) y metrics (spec 015, D-21) |

## 9. Tareas

- [x] **T1** — Añadir `inventory.read` a `PERMISSIONS` (pasa de 18 a 19 entradas)
      y repartirlo a `super_admin`, `admin`, `manager` y `audit` en
      `ROLE_PERMISSION_MATRIX` · archivo: `src/lib/permissions.ts` ·
      verificación: `npm run typecheck && npm test`
- [x] **T2** — Ejecutar el seed y comprobar que el catálogo queda en 19 permisos y
      que los cuatro roles resuelven `inventory.read` · comando: `npm run db:seed`
      · verificación: salida del seed + `npm run db:studio`
- [x] **T3** — Mover `LOW_STOCK_THRESHOLD = 10` con su comentario de
      `src/modules/dashboard/constants.ts` a `src/modules/products/constants.ts`
      y actualizar sus dos importadores
      (`src/app/api/admin/metrics/route.ts` y
      `src/modules/dashboard/components/dashboard-overview.tsx`) · archivos: los
      cuatro · verificación: `npm run typecheck && npm test`
      · nota: no se parte en dos tareas porque borrar la constante sin mover los
      importadores deja el árbol sin compilar; es un solo cambio atómico
- [x] **T4** — Renombrar el `const LOW_STOCK_THRESHOLD = 5` local a
      `CATALOG_LOW_STOCK_THRESHOLD` y actualizar su único uso en `STOCK_LEVEL`,
      sin cambiar el valor · archivo:
      `src/server/repositories/product.repository.ts` · verificación:
      `npm run typecheck && npm test`
- [x] **T5** — `inventoryQuerySchema` con `search`, `categoryId`, `page` y
      `pageSize` según §6 · archivo:
      `src/modules/inventory/schemas/inventory.schema.ts` · verificación:
      `npm run typecheck`
- [x] **T6** — Tests del schema (patrón de `admin-order.schema.test.ts`): query
      vacía → `{ categoryId: 'all', page: 1, pageSize: 20 }`; `search` de solo
      espacios queda en cadena vacía; `categoryId` que no es uuid ni `all` →
      error; `page=0` → error; `pageSize=500` → error; `page='3'` se coacciona a
      número · archivo: `src/modules/inventory/schemas/inventory.schema.test.ts` ·
      verificación: `npm test`
- [x] **T7** — Tipos `StockStatus`, `InventoryRow`, `InventoryListMeta` e
      `InventoryListResponse`, derivando la fila de `ProductWithCategory` con
      `import type` · archivo: `src/modules/inventory/types/inventory.types.ts` ·
      verificación: `npm run typecheck`
- [x] **T8** — `resolveStockStatus(stock: number, threshold: number): StockStatus`
      — `'out'` si `stock <= 0`, `'low'` si `stock < threshold`, `'in'` en otro
      caso · archivo: `src/modules/inventory/lib/stock-status.ts` · verificación:
      `npm run typecheck`
- [x] **T9** — Tests de `resolveStockStatus`: `0` → `'out'`; `1` y
      `threshold - 1` → `'low'`; `threshold` y `threshold + 1` → `'in'` (caso que
      el endpoint no devuelve pero la función pura debe cubrir); un negativo
      —posible por la sobreventa sin clamp de `decrementStock`— → `'out'` ·
      archivo: `src/modules/inventory/lib/stock-status.test.ts` · verificación:
      `npm test`
- [x] **T10** — Repositorio: `buildInventoryFilters()` exportada (invariantes
      `is_active = true` y `stock < threshold`, más `search` con
      `escapeLikePattern` de `@/lib/utils` sobre `name`/`sku` y `categoryId`
      cuando no es `all`) y `findLowStock()` con el join a `categories`, el orden
      `stock asc, name asc, id asc`, `limit/offset` y el conteo en paralelo ·
      archivo: `src/server/repositories/inventory.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T11** — Tests del repositorio con `PgDialect` (patrón exacto de
      `order.repository.test.ts`): los dos invariantes aparecen siempre en el
      `WHERE` aunque no haya filtros; `search` genera `ilike` sobre `name` y `sku`
      con dos parámetros `%texto%`; `50%_off` llega escapado como
      `%50\%\_off%`; `categoryId: 'all'` no añade `"category_id"`; un uuid sí; el
      umbral viaja como parámetro · archivo:
      `src/server/repositories/inventory.repository.test.ts` · verificación:
      `npm test`
- [x] **T12** — Route Handler `GET` según §6: `authorize('inventory.read')`
      primero (D-15), `safeParse` de la query → `badRequest` con `issues`,
      repositorio con `LOW_STOCK_THRESHOLD` importado de
      `@/modules/products/constants`, `meta` con `threshold` y
      `canUpdateProduct`, y `toErrorResponse` en el `catch` · archivo:
      `src/app/api/admin/inventory/route.ts` · verificación: `npm run build`
- [x] **T13** — Constantes del módulo: `INVENTORY_PAGE_SIZE = 20`,
      `INVENTORY_SEARCH_DEBOUNCE_MS = 300`, `STOCK_STATUS_LABELS`
      (`out: 'Agotado'`, `low: 'Stock bajo'`, `in: 'En stock'`), los dos copys de
      estado vacío (afirmativo y de «sin resultados») e `inventoryKeys`
      (`all` / `lists()` / `list(params)`) · archivo:
      `src/modules/inventory/constants.ts` · verificación: `npm run typecheck`
- [x] **T14** — `fetchInventory(params): Promise<InventoryListResponse>` con
      `api.get('/admin/inventory', { params })` · archivo:
      `src/modules/inventory/services/inventory.service.ts` · verificación:
      `npm run typecheck`
- [x] **T15** — `useInventory(params)` con `inventoryKeys.list(params)` y
      `placeholderData: keepPreviousData` · archivo:
      `src/modules/inventory/hooks/use-inventory.ts` · verificación:
      `npm run typecheck`
- [x] **T16** — `StockStatusBadge`: mapa total `Record<StockStatus, …>` con
      variante, clases e icono; «Agotado» destructivo y «Stock bajo» ámbar
      (`variant="outline"` + `text-amber-700 dark:text-amber-400`), ambos con
      icono `aria-hidden` y texto visible (D-13) · archivo:
      `src/modules/inventory/components/stock-status-badge.tsx` · verificación:
      `npm run typecheck`
- [x] **T17** — `getInventoryColumns({ canUpdateProduct, onEdit })`: producto,
      SKU (`font-mono`), categoría, stock (`tabular-nums`), badge de estado y —solo
      si `canUpdateProduct`— la columna de acciones con «Editar» (AC13) ·
      archivo: `src/modules/inventory/components/inventory-columns.tsx` ·
      verificación: `npm run typecheck`
- [x] **T18** — `InventoryTable`: `"use client"`, buscador con `useDebounce`,
      `Select` de categoría alimentado por `useCategories` (mismos parámetros que
      `products-table.tsx` para compartir entrada de caché), reinicio de `page` al
      cambiar filtros, `useReactTable` con `manualPagination`/`manualFiltering`,
      `DataTable` con `isLoading`/`isError`/`onRetry`, los dos estados vacíos
      (AC12) y el `ProductFormDialog` importado de
      `@/modules/products/components/product-form-dialog` · archivo:
      `src/modules/inventory/components/inventory-table.tsx` · verificación:
      `npm run typecheck`
- [x] **T19** — `useUpdateProduct()` invalida también `inventoryKeys.lists()`
      además de `productKeys.lists()` (D-10, AC14) · archivo:
      `src/modules/products/hooks/use-product-mutations.ts` · verificación:
      `npm run typecheck`
- [x] **T20** — Página `/admin/inventory` con
      `requirePagePermission('inventory.read')`, `metadata`, encabezado que
      explica el umbral y `<InventoryTable />` · archivo:
      `src/app/(admin)/admin/inventory/page.tsx` · verificación: `npm run build`
- [x] **T21** — Entrada «Inventario» en `NAV_ITEMS` justo detrás de «Productos»,
      con `href: '/admin/inventory'`, icono `Boxes` de lucide y
      `permission: 'inventory.read'` · archivo:
      `src/app/(admin)/admin/layout.tsx` · verificación: `npm run typecheck`
- [x] **T22** — Documentar en `docs/SETUP.md` §6 la sección de inventario
      (spec 016): permiso, endpoint, umbral compartido con el dashboard y ahora
      residente en `src/modules/products/constants.ts`, y que la única escritura
      de stock sigue siendo el `PATCH` de productos · archivo: `docs/SETUP.md` ·
      verificación: lectura
- [x] **T23** — Cierre:
      `npm run typecheck && npm run lint && npm test && npm run build` en verde y
      recorrido manual en navegador de AC3, AC5, AC7, AC12, AC13 y AC14 con una
      cuenta `super_admin` y otra con rol `audit`. El recorrido manual no es
      opcional: el spec 015 documenta que un bug de SQL pasó typecheck, lint y 731
      tests y solo lo atrapó abrir la página (§10)
      · estado a 2026-09-17: la puerta automática está en verde —typecheck exit 0,
      lint 0 errores, 775/775 tests en 39 archivos, build exit 0—. AC1, AC5, AC7,
      AC12 y AC14 se comprobaron contra el servidor real con la cuenta
      `super_admin` (`nelsonnina`); AC3 y AC13 se comprobaron con una segunda
      cuenta (sin `inventory.read` y con rol `audit`, respectivamente); AC2, AC4,
      AC6, AC8, AC9, AC10, AC11 y AC15 quedaron demostrados por lectura de código
      y tests unitarios en la revisión. Recorrido manual completo

## 10. Riesgos y consideraciones

- **Sin tests de integración contra Postgres.** Es el riesgo principal y está
  documentado en el spec 015 §10: los repositorios no se prueban contra una base
  real, y un `GROUP BY` mal renderizado pasó typecheck, lint y 731 tests. Aquí la
  mitigación es doble: la consulta no agrupa ni reutiliza ninguna plantilla
  `sql` entre cláusulas —ordena por columnas reales de Drizzle (D-14)— y T23
  exige el recorrido manual. Si alguien añade después un `CASE` en el `SELECT`
  para derivar el estado en SQL, vuelve a entrar en la clase de bug y hay que
  agrupar u ordenar por posición ordinal.
- **Sin índice sobre `stock`.** El filtro `stock < 10` no lo cubre ningún índice:
  Postgres usará `products_is_active_idx` y descartará el resto por filtro. Con un
  catálogo de miles de filas es irrelevante; a partir de decenas de miles, el
  candidato es un índice parcial `on products (stock) where is_active`. No se
  añade ahora porque sería optimizar sin medida.
- **`ilike '%texto%'` no usa índice.** Igual que la búsqueda de productos y la de
  clientes en orders. Mismo umbral de dolor y misma salida futura (`pg_trgm`).
- **Escape de comodines.** `escapeLikePattern` es obligatorio: sin él, `search=%`
  devuelve toda la tabla como si fuera un resultado (AC9). Ya existe en
  `src/lib/utils.ts` desde el spec 014; no se reimplementa.
- **Carrera entre listar y editar.** Dos personas pueden abrir el diálogo del
  mismo producto y guardar; gana la última. Es el comportamiento que ya tiene
  `/admin/products` y no se cambia aquí: sin tabla de movimientos no hay nada que
  reconciliar. El stock real lo sigue descontando el webhook de Stripe dentro de
  su transacción.
- **Stock negativo.** `decrementStock` no hace clamp a propósito (spec 007, D-10),
  así que una sobreventa deja el entero en negativo. `resolveStockStatus` lo mapea
  a `'out'` y la fila aparece la primera del listado, que es justo donde debe
  estar. Cubierto por T9.
- **Ventana entre permiso concedido y seed.** Hasta que T2 corre, `inventory.read`
  no existe en la tabla `permissions` y **nadie** —ni `super_admin`— puede abrir
  la página: `getEffectivePermissions()` resuelve contra la base, no contra el
  catálogo en código. T2 va inmediatamente detrás de T1 por eso.
- **Rollback.** No hay migración que revertir. Deshacer es retirar la entrada del
  catálogo y borrar el módulo; la fila de `permissions` quedaría huérfana en la
  base, lo cual es inocuo: `isPermissionCode()` descarta lo que no está en el
  código.
- **Acoplamiento `inventory → products`.** Es unidireccional salvo por T19, donde
  un hook de productos importa constantes de inventario. No hay ciclo de módulos
  —`inventory/constants.ts` solo depende de su propio schema— pero conviene no
  crecer esa arista: si aparece una segunda invalidación cruzada, toca un
  `queryKey` compartido en `src/lib`.
- **Sin caché de servidor.** Es una vista de administración autenticada y por
  usuario: nada de `revalidate` ni `s-maxage`. El refresco es el de TanStack Query
  al volver a la pestaña. No se añade `refetchInterval` como el dashboard: aquí
  quien mira está trabajando la lista, y una recarga automática que hace saltar
  filas mientras se decide cuál editar molesta más de lo que informa.

## 11. Fuera de alcance / deuda aceptada

- **Umbral configurable.** El comentario del spec 015 anunciaba que este spec lo
  haría configurable; no lo hace. Sigue siendo una constante global, ahora en
  `src/modules/products/constants.ts`. Se retoma cuando exista un dato de
  reposición o de rotación por SKU que justifique un umbral por producto o por
  categoría: antes de eso, cualquier valor por producto sería inventado. El
  siguiente paso natural es una columna `low_stock_threshold` nullable en
  `products` con la constante como default.
- **Movimientos de stock.** No hay tabla de entradas y salidas, así que no se
  puede responder «¿por qué este producto pasó de 40 a 3?». Cuando haga falta,
  es una tabla append-only `stock_movements` escrita en la misma transacción que
  la mutación, con el mismo criterio que `audit_logs`.
- **Edición en línea de la celda de stock.** Reutilizar el formulario completo
  obliga a rellenar un diálogo grande para cambiar un entero. Se acepta a cambio
  de no duplicar el formulario (D-11). Si el gesto se vuelve frecuente, lo
  correcto es un `PATCH /api/admin/products/[id]` con solo `{ stock }` desde un
  popover, no un formulario nuevo.
- **`createdAt`/`updatedAt` como `Date` en el tipo de la fila.** `InventoryRow`
  hereda de `ProductWithCategory`, que declara `Date` en dos campos que JSON
  entrega como `string`. Es la deuda que ya arrastra `ProductListResponse` desde
  el spec 003; no se corrige aquí para no cambiar el contrato de productos de
  paso, pero ningún componente de inventario lee esos dos campos.
- **Recuento total con `count()` y `OFFSET`.** Igual que orders y products. Con
  decenas de miles de filas bajo el umbral —escenario que significaría un problema
  de negocio mucho mayor— habría que pasar a paginación por cursor.
- **Sin notificación.** Nadie se entera de que un producto se agotó salvo que
  abra la página. Correo o webhook queda fuera; el enganche natural sería el
  mismo punto donde el webhook de Stripe descuenta stock.
