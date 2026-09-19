---
id: 020
title: Notas de ingreso y salida de inventario
status: done
module: inventory
scope: admin
created: 2026-09-18
---

# 020 — Notas de ingreso y salida de inventario

## 1. Contexto

El panel de inventario (spec 016) es hoy **solo lectura**: `/admin/inventory` lista
los productos activos por debajo de `LOW_STOCK_THRESHOLD` y la única forma de
corregir un stock es abrir `ProductFormDialog` y teclear el entero final. Esa
escritura pasa por `PATCH /api/admin/products/[id]`, que deja una entrada
`product.updated` en `audit_logs` con el `before`/`after` del campo, pero no
responde la pregunta que importa en un almacén: **por qué** ese producto pasó de
40 a 3, con qué documento y contra qué referencia.

El propio spec 016 dejó esto anotado dos veces: §3 excluye explícitamente «tabla
de movimientos de stock (entradas, salidas, ajustes) ni su historial», y §11
escribe el criterio de diseño que aquí se ejecuta — «una tabla append-only
`stock_movements` escrita en la misma transacción que la mutación, con el mismo
criterio que `audit_logs`». Este spec no corrige nada del 016: construye lo que
aquel dejó fuera a propósito.

Además, el stock hoy se mueve por dos caminos que no se parecen: el webhook de
Stripe lo descuenta dentro de su transacción (`decrementStock`, spec 007) y una
persona lo reescribe a mano desde el formulario de producto. Ninguno de los dos
deja rastro de unidades movidas ni de documento de respaldo.

## 2. Objetivo

Una persona con `inventory.move` registra desde un modal una Nota de Ingreso o
una Nota de Salida —con su tipo de transacción, su fecha de documento, su
documento de referencia y una o más líneas de producto y cantidad— y el stock de
esos productos queda actualizado y explicado: cualquiera con `inventory.read`
puede listar los documentos registrados y abrir el detalle para ver qué se movió,
cuánto y con qué stock quedó cada producto.

## 3. Alcance

### Incluye

- Tabla de catálogo **`transacciones`** (`idtrans`, `nomtrans`, `tipotrans`) con
  las 6 filas semilla del requerimiento, y su espejo en código
  (`src/lib/inventory-transactions.ts`) con el mismo criterio que `PERMISSIONS`.
- Tabla de cabecera `inventory_documents`: correlativo, tipo de transacción (FK),
  fecha de documento, documento de referencia, quién lo registró.
- Tabla de detalle `stock_movements`: producto, cantidad y stock resultante por
  línea. Append-only, es el libro mayor de movimientos que anunció el spec 016 §11.
- Migración Drizzle `0008` con las tres tablas y el enum `tipo_transaccion`.
- Permiso nuevo `inventory.move` (el catálogo pasa de 25 a 26 códigos) para
  `super_admin`, `admin` y `manager`. La lectura de documentos reutiliza
  `inventory.read`.
- `POST /api/admin/inventory/documents`: crea el documento, sus líneas y el efecto
  en stock **en una sola transacción**, con `logAudit()` dentro.
- `GET /api/admin/inventory/documents`: listado paginado con filtro por dirección
  (ingreso/salida), rango de días y búsqueda por documento de referencia.
- `GET /api/admin/inventory/documents/[id]`: detalle con sus líneas.
- `/admin/inventory` pasa a tener dos pestañas: «Alertas de stock» (la tabla del
  spec 016, intacta) y «Movimientos» (el listado nuevo).
- Modal multi-línea para registrar el documento, abierto desde dos botones —«Nota
  de ingreso» y «Nota de salida»— que filtran los tipos ofrecidos por dirección.
- Diálogo de solo lectura con el detalle de un documento.
- Dos extracciones que dispara este spec y que se justifican en §8: mover
  `isFutureReportingDay()` a `src/lib/reporting.ts` (D-16) y unificar el formateo
  de días `'AAAA-MM-DD'` en `src/lib/utils.ts` (D-17).

### No incluye (explícito)

- **Edición, borrado o anulación de un documento ya registrado.** No hay `PATCH`
  ni `DELETE` en el recurso. La corrección es un documento en sentido contrario
  (D-9, §11).
- Ajustes de inventario sin documento («ajuste por conteo», «merma»): los 6 tipos
  del catálogo son los del requerimiento y ninguno más. Añadir uno es una fila de
  seed y una entrada en el catálogo en código, no un cambio de diseño.
- Vincular la salida por venta con el pedido que la originó. El webhook de Stripe
  sigue descontando stock por su cuenta y **no** escribe en `stock_movements`
  (D-13, §11).
- Correlativo por serie o por tipo de documento. El número es único y compartido
  entre ingresos y salidas (D-6).
- Historial de movimientos por producto como vista propia (`/admin/products/[id]`
  con su pestaña de kardex). Los datos quedan, la pantalla no se construye aquí.
- Valorización del inventario (costo, PEPS/UEPS, costo promedio). `products` no
  tiene columna de costo y el spec 017 ya dejó escrito que el resultado financiero
  no incluye costo de mercadería.
- Almacenes o ubicaciones múltiples. El stock sigue siendo un entero por producto.
- Filtro del listado por tipo concreto (`salida por préstamo`), búsqueda por número
  de documento, exportación a CSV e impresión de la nota.
- Cambios en la tabla de alertas del spec 016 más allá de invalidar su caché
  cuando un documento mueve stock.

## 4. Criterios de aceptación

- [ ] AC1 — Dado un visitante sin sesión, cuando pide `GET` o `POST` sobre
      `/api/admin/inventory/documents`, entonces recibe `401` con `{ message }` y
      **no** un `307` al formulario de Clerk.
- [ ] AC2 — Dado un usuario con sesión y sin `inventory.read`, cuando pide
      `GET /api/admin/inventory/documents?page=abc`, entonces recibe `403` y no
      `400`: la autorización ocurre antes de mirar la query.
- [ ] AC3 — Dado un usuario con `inventory.read` y sin `inventory.move` (rol
      `audit`), entonces `meta.canMove` es `false`, la pestaña «Movimientos» no
      pinta los botones de nota, y un `POST` directo responde `403`.
- [ ] AC4 — Dada una nota de ingreso por compra de 5 unidades de un producto con
      `stock = 3`, cuando se registra, entonces el producto queda en `8`, existe
      una fila en `inventory_documents`, una en `stock_movements` con
      `quantity = 5` y `stock_after = 8`, y una entrada
      `inventory_document.created` en `audit_logs` — las cuatro escrituras en la
      misma transacción.
- [ ] AC5 — Dada una nota de salida de 5 unidades de un producto con `stock = 3`,
      entonces la respuesta es `409` nombrando el producto, su stock actual y lo
      solicitado; y no queda ni documento, ni movimiento, ni cambio de stock, ni
      entrada en la bitácora.
- [ ] AC6 — Dado un documento de dos líneas donde la segunda no tiene stock
      suficiente, entonces la primera **tampoco** se aplica: la transacción
      revierte entera.
- [ ] AC7 — Dado un `transaccionId` que no es uno de los 6 códigos del catálogo,
      entonces la respuesta es `400` de Zod y nunca un `500` por violación de
      clave foránea.
- [ ] AC8 — Dado un cuerpo con `items: []`, entonces `400`; dado el mismo
      `productId` repetido en dos líneas, entonces `400` con un mensaje propio y
      no una violación de índice único.
- [ ] AC9 — Dada una `docDate` posterior a hoy **en `America/Lima`**, entonces
      `400`. Entre las 19:00 y medianoche de Lima, un documento fechado hoy sigue
      siendo válido aunque en UTC ya sea mañana.
- [ ] AC10 — Dado un `productId` que no existe, entonces `404` y no `500`.
- [ ] AC11 — Dado un documento registrado, cuando se le manda `PATCH` o `DELETE`,
      entonces Next responde `405`: el recurso no expone esos verbos y la tabla no
      tiene columna de anulación.
- [ ] AC12 — Dado el listado, entonces los documentos llegan ordenados por
      `doc_date desc, doc_number desc` y se pueden filtrar por dirección
      (`all | ingreso | salida`) y por rango de días con ambos extremos inclusivos.
- [ ] AC13 — Dado `search=50%_off`, entonces `%` y `_` se buscan como texto
      literal sobre el documento de referencia y no como comodines de `LIKE`.
- [ ] AC14 — Dado un rango con `from` posterior a `to`, entonces `400` con el
      error marcado en `from`.
- [ ] AC15 — Dado el botón «Nota de ingreso», entonces el modal solo ofrece los
      tres tipos con `tipotrans = ingreso`; con «Nota de salida», los tres de
      `salida`. El servidor no recibe la dirección: la deriva del catálogo.
- [ ] AC16 — Dado un documento guardado desde el modal, entonces el diálogo se
      cierra, la tabla de movimientos muestra la fila nueva y la pestaña «Alertas
      de stock» refleja el stock nuevo **sin recargar la página**.
- [ ] AC17 — Dada la primera carga del listado, entonces se ve el esqueleto de
      `DataTable`; ante un fallo de red, el mensaje con «Reintentar»; sin
      documentos y sin filtros, un estado vacío que invita a registrar el primero;
      con filtros y cero coincidencias, «Sin resultados» y un botón para limpiar.
- [ ] AC18 — Dado `npm run db:seed` ejecutado dos veces seguidas, entonces
      `transacciones` tiene exactamente 6 filas y la segunda ejecución no falla.
- [ ] AC19 — Dado un documento del listado, cuando se abre su detalle, entonces se
      ven sus líneas con producto, SKU, cantidad y el stock con el que quedó cada
      producto.

## 5. Modelo de datos

**Requiere migración.** Tres tablas nuevas y un enum nuevo, generados con
`npm run db:generate` y aplicados con `npm run db:migrate` (migración `0008`).
`products` no cambia de forma: solo se le añade una función de escritura en su
repositorio.

### 5.1 Nomenclatura: lo que pide el requerimiento y lo que escribe Drizzle

El requerimiento nombra la tabla y sus tres campos de forma literal. La convención
del proyecto (`docs/SETUP.md` §3) es snake_case plural en inglés. Se resuelve
**dando la razón a las dos**: los nombres físicos en Postgres son exactamente los
pedidos, y las propiedades de TypeScript son las idiomáticas, que es justo para lo
que existe el mapeo de Drizzle (D-2).

| Requerimiento | Columna en Postgres | Propiedad Drizzle/TS |
|---|---|---|
| tabla `transacciones` | `transacciones` | `transacciones` |
| `idtrans` | `idtrans` | `id` |
| `nomtrans` | `nomtrans` | `name` |
| `tipotrans` | `tipotrans` | `direction` |

`direction` y no `type`: los dos valores son `ingreso` y `salida`, que describen
un sentido, y `type` compite visualmente con la palabra reservada de TypeScript en
cada `type X = …` del mismo archivo.

### 5.2 `transacciones` — catálogo semilla

Es un catálogo de 6 filas fijas, no datos de usuario: se comporta exactamente como
`permissions` (fuente de verdad en código, `db:seed` idempotente, la tabla existe
para dar integridad referencial y para que la base sea legible sin el repo).

```ts
// src/server/db/schema/transaccion.ts — firma propuesta
import { pgEnum, pgTable, varchar } from 'drizzle-orm/pg-core';

// Enum de Postgres y no varchar con CHECK: mismo criterio que `expense_category`
// (spec 017, D-4). Dos valores que no van a crecer y que Drizzle entrega como
// unión literal en TypeScript.
export const tipoTransaccion = pgEnum('tipo_transaccion', ['ingreso', 'salida']);

export const transacciones = pgTable('transacciones', {
  // PK de texto y no uuid (D-3): es un catálogo cerrado, el código es estable y
  // legible en un JOIN a mano, y hace el seed idempotente sin una columna `code`
  // adicional que el requerimiento no pide.
  id: varchar('idtrans', { length: 40 }).primaryKey(),
  name: varchar('nomtrans', { length: 60 }).notNull(),
  direction: tipoTransaccion('tipotrans').notNull(),
});
```

Filas semilla (las seis del requerimiento, sin ninguna más):

| `idtrans` | `nomtrans` | `tipotrans` |
|---|---|---|
| `salida_venta` | Salida por venta | `salida` |
| `salida_cambio` | Salida por cambio | `salida` |
| `salida_prestamo` | Salida por préstamo | `salida` |
| `ingreso_devolucion` | Ingreso por devolución | `ingreso` |
| `ingreso_compra` | Ingreso por compra | `ingreso` |
| `ingreso_cambio` | Ingreso por cambio | `ingreso` |

Espejo en código, módulo puro sin Drizzle ni React, leído por el seed, por Zod,
por el repositorio y por la UI:

```ts
// src/lib/inventory-transactions.ts — firma propuesta
export const TRANSACTION_TYPES = [
  { id: 'salida_venta', name: 'Salida por venta', direction: 'salida' },
  // … las seis
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionTypeCode = TransactionType['id'];
export type TransactionDirection = TransactionType['direction'];

export const TRANSACTION_TYPE_CODES: readonly TransactionTypeCode[];
export function isTransactionTypeCode(value: string): value is TransactionTypeCode;
export function transactionTypesByDirection(d: TransactionDirection): readonly TransactionType[];
export function transactionDirection(code: TransactionTypeCode): TransactionDirection;
```

### 5.3 `inventory_documents` — cabecera

```ts
// src/server/db/schema/inventory-document.ts — firma propuesta
export const inventoryDocuments = pgTable(
  'inventory_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Correlativo legible para quien archiva la nota. Identidad de Postgres y no
    // un MAX()+1 en la aplicación: la secuencia es lo único que aguanta dos
    // registros simultáneos sin carrera (D-6). Deja huecos si una transacción
    // revierte, y es aceptable.
    docNumber: integer('doc_number').generatedAlwaysAsIdentity(),
    // "Tipo de transacción" de la cabecera del requerimiento. `restrict`: el
    // catálogo no se borra, y deja escrito que un documento no puede quedar sin
    // tipo.
    transaccionId: varchar('transaccion_id', { length: 40 })
      .notNull()
      .references(() => transacciones.id, { onDelete: 'restrict' }),
    // "Fecha doc". `date` con `mode: 'string'` y no `timestamptz`: un documento
    // se emite un día, no en un instante, y una columna sin hora no se desplaza
    // de día al cruzar el huso (mismo criterio que `expenses.incurred_on` y
    // `payroll_payments.paid_at`).
    docDate: date('doc_date', { mode: 'string' }).notNull(),
    // "Documento de referencia": factura, guía de remisión, orden de compra, ticket
    // de préstamo. Nullable a propósito (D-8): no toda salida tiene papel detrás.
    reference: varchar('reference', { length: 120 }),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('inventory_documents_doc_number_idx').on(t.docNumber),
    // Sostiene el orden del listado y el filtro por rango.
    index('inventory_documents_doc_date_idx').on(t.docDate.desc()),
    index('inventory_documents_transaccion_id_idx').on(t.transaccionId),
  ],
);
```

**Sin `updated_at`, sin `voided_at`, sin `is_active`.** La tabla es append-only
igual que `audit_logs`: no hay camino de `UPDATE` ni de `DELETE` desde la
aplicación (D-9).

### 5.4 `stock_movements` — detalle

Es la tabla que el spec 016 §11 anunció. Cada línea es un movimiento: qué producto,
cuántas unidades y con qué stock quedó.

```ts
// src/server/db/schema/stock-movement.ts — firma propuesta
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `restrict` y no `cascade` como en `order_items` (D-10): nada se borra aquí,
    // y la cláusula deja escrito que un documento con movimientos es indestructible.
    documentId: uuid('document_id')
      .notNull()
      .references(() => inventoryDocuments.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    // Siempre positiva. El signo lo pone la dirección del documento (D-5).
    quantity: integer('quantity').notNull(),
    // Stock con el que quedó el producto tras aplicar esta línea, tal y como lo
    // devolvió el `RETURNING` del UPDATE (D-11).
    stockAfter: integer('stock_after').notNull(),
  },
  (t) => [
    index('stock_movements_document_id_idx').on(t.documentId),
    // El índice que sostiene el kardex por producto del día que se construya (§11).
    index('stock_movements_product_id_idx').on(t.productId),
    // Un producto no puede aparecer dos veces en el mismo documento: sumar dos
    // líneas del mismo SKU es un error de captura, no un caso de negocio (AC8).
    uniqueIndex('stock_movements_document_product_idx').on(t.documentId, t.productId),
    // El invariante en la base y no solo en Zod, como `expenses_amount_cents_positive`:
    // ningún camino de escritura —seed, migración de datos o un `psql` a mano— debe
    // poder crear una línea de cero o negativa.
    check('stock_movements_quantity_positive', sql`${t.quantity} > 0`),
  ],
);
```

### 5.5 Permisos (dato semilla, no migración)

```ts
// src/lib/permissions.ts — una entrada nueva en PERMISSIONS (pasa de 25 a 26)
{
  code: 'inventory.move',
  resource: 'inventory',
  action: 'move',
  description: 'Registrar notas de ingreso y de salida de inventario.',
},
```

| Rol | `inventory.read` | `inventory.move` |
|---|---|---|
| `super_admin` | sí (ya) | **sí** |
| `admin` | sí (ya) | **sí** |
| `manager` | sí (ya) | **sí** |
| `audit` | sí (ya) | **no** — ve los documentos, no registra ninguno |
| `employee`, `customer` | no | no |

Verificado contra `ROLE_PERMISSION_MATRIX`: los tres roles que reciben
`inventory.move` son exactamente los que ya tienen `products.update`, es decir, los
que hoy ya pueden cambiar un stock desde el formulario de producto. El permiso no
concede nada que esos roles no pudieran hacer ya peor.

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/inventory/documents` | `inventory.read` | query: `direction?`, `from?`, `to?`, `search?`, `page?`, `pageSize?` | `InventoryDocumentListResponse` | 400, 401, 403, 500 |
| POST | `/api/admin/inventory/documents` | `inventory.move` | body: `CreateInventoryDocumentInput` | `InventoryDocumentDetail` (201) | 400, 401, 403, 404, 409, 500 |
| GET | `/api/admin/inventory/documents/[id]` | `inventory.read` | — | `InventoryDocumentDetail` | 401, 403, 404, 500 |

No hay `PATCH` ni `DELETE` (AC11). No hay endpoint para el catálogo de
`transacciones`: los 6 tipos los conoce el cliente por `src/lib/inventory-transactions.ts`,
que es un módulo puro, igual que la UI de roles conoce `PERMISSIONS` (D-4).

Errores con el contrato vigente: `toErrorResponse()` y `badRequest()` de
`src/lib/api-guard.ts`, cuerpos `{ message }` y `{ message, issues }`, que es lo
que espera el interceptor de `src/lib/axios.ts`. El 409 por stock insuficiente
añade el `productId` de la línea culpable —`{ message, productId }`, igual que el
400 añade `issues`— para que el formulario marque esa línea por id y no buscando el
nombre del producto dentro del mensaje (§12, R3).

Cero documentos es `200` con `data: []`, nunca `404`.

### Zod de entrada — `src/modules/inventory/schemas/inventory-document.schema.ts`

```ts
import { z } from 'zod';

import { isFutureReportingDay } from '@/lib/reporting';
import { TRANSACTION_TYPE_CODES } from '@/lib/inventory-transactions';

// Tope de cordura: una nota con más de 50 líneas se captura en un ERP, no aquí, y
// cada línea es un UPDATE dentro de la transacción (§10).
export const MAX_DOCUMENT_ITEMS = 50;

export const documentItemSchema = z.object({
  productId: z.uuid('Elige un producto'),
  quantity: z
    .number()
    .int('La cantidad debe ser un número entero')
    .min(1, 'La cantidad debe ser mayor que cero')
    .max(1_000_000, 'La cantidad supera el máximo admitido'),
});

export const DUPLICATE_ITEM_MESSAGE = 'Un producto no puede repetirse en el mismo documento';

export const createInventoryDocumentSchema = z.object({
  // `z.enum` sobre el catálogo en código: un tipo desconocido es 400 en el borde y
  // no un 500 por violación de clave foránea (AC7).
  transaccionId: z.enum(TRANSACTION_TYPE_CODES),
  docDate: z.iso
    .date('Usa el formato AAAA-MM-DD')
    // Mismo criterio que `expenses.incurredOn` (spec 017): hoy es el día en Lima,
    // no el del servidor en UTC (AC9).
    .refine((day) => !isFutureReportingDay(day, new Date()), {
      message: 'La fecha del documento no puede ser futura',
    }),
  reference: z.string().trim().max(120).optional(),
  items: z
    .array(documentItemSchema)
    .min(1, 'El documento debe tener al menos una línea')
    .max(MAX_DOCUMENT_ITEMS)
    // El duplicado se rechaza aquí con un mensaje que nombra el problema; el índice
    // único de §5.4 es la red que aguanta la concurrencia (AC8).
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
      message: DUPLICATE_ITEM_MESSAGE,
    }),
});

export const inventoryDocumentQuerySchema = z
  .object({
    // Centinela `all`, como `categoryId` en inventario y `category` en finanzas: el
    // Select de shadcn/Radix no admite un item con valor vacío.
    direction: z.union([z.literal('all'), z.enum(['ingreso', 'salida'])]).default('all'),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['from'],
  });

export type CreateInventoryDocumentInput = z.input<typeof createInventoryDocumentSchema>;
export type CreateInventoryDocumentValues = z.output<typeof createInventoryDocumentSchema>;
export type InventoryDocumentQueryParams = z.output<typeof inventoryDocumentQuerySchema>;
```

El schema del formulario es otro (`inventoryDocumentFormSchema`): la cantidad viaja
como texto mientras se teclea y las líneas se editan como array de React Hook Form,
igual que `productFormSchema` hace con el precio y con `specs`.

### Tipos de salida — `src/modules/inventory/types/inventory-document.types.ts`

```ts
import type { TransactionDirection, TransactionTypeCode } from '@/lib/inventory-transactions';

export type InventoryDocumentRow = {
  id: string;
  docNumber: number;
  transaccionId: TransactionTypeCode;
  // Se publican los dos para que la tabla no tenga que resolver el catálogo, y
  // porque `direction` decide el color del badge.
  transaccionName: string;
  direction: TransactionDirection;
  /** 'AAAA-MM-DD'. */
  docDate: string;
  reference: string | null;
  /** Nombre completo de quien lo registró, o su correo si no tiene nombre. */
  createdByName: string;
  itemCount: number;
  totalQuantity: number;
};

export type InventoryDocumentItemRow = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  stockAfter: number;
};

export type InventoryDocumentDetail = InventoryDocumentRow & {
  items: InventoryDocumentItemRow[];
};

export type InventoryDocumentListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  // Resuelto en el servidor; la UI solo oculta controles. La frontera real es el
  // 403 del POST (AC3).
  canMove: boolean;
};

export type InventoryDocumentListResponse = {
  data: InventoryDocumentRow[];
  meta: InventoryDocumentListMeta;
};
```

**Ningún campo `Date` viaja en las respuestas de este módulo** (no se publica
`createdAt`): el documento se identifica por su número y su `docDate`, que es una
cadena `'AAAA-MM-DD'`. Así no hereda la deuda de `ProductWithCategory`, que declara
`Date` en dos campos que JSON entrega como `string` (spec 016 §11).

### Forma del `POST` — `src/app/api/admin/inventory/documents/route.ts`

```ts
export async function POST(request: Request) {
  try {
    const { actor } = await authorize('inventory.move');

    const body = await parseJsonBody(
      request,
      createInventoryDocumentSchema,
      'Datos del documento inválidos',
    );
    if (!body.ok) return body.response;

    // El service cruza tres repositorios (producto, documento, bitácora) y corre en
    // una sola transacción. Lanza NotFoundError/ConflictError, que `toErrorResponse`
    // traduce a 404 y 409 (D-12).
    const document = await inventoryDocumentService.createDocument({
      actor,
      context: getAuditContext(request),
      input: body.data,
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/admin/inventory/documents',
      fallback: 'No se pudo registrar el documento',
      // Red del índice único de (document_id, product_id): si algo burlase el
      // refine de Zod, cae como 409 y no como 500.
      uniqueViolationMessage: DUPLICATE_ITEM_MESSAGE,
    });
  }
}
```

### Firmas de servidor

```ts
// src/server/repositories/product.repository.ts — función nueva
export type StockChange = { productId: string; delta: number };

// Devuelve el stock resultante, o `null` si el producto no existe o —cuando
// `delta` es negativo— si ya no queda suficiente. El guard va DENTRO del WHERE:
// leer y luego escribir dejaría una carrera entre las dos sentencias (D-7).
export async function applyStockChange(
  tx: Tx,
  change: StockChange,
): Promise<{ stock: number } | null>;
```

```ts
// src/server/repositories/inventory-document.repository.ts — firmas propuestas
export function buildDocumentFilters(
  params: Pick<InventoryDocumentQueryParams, 'direction' | 'from' | 'to' | 'search'>,
): SQL | undefined;

export async function findMany(
  params: InventoryDocumentQueryParams,
): Promise<{ data: InventoryDocumentRow[]; total: number }>;

export async function findById(
  id: string,
  reader?: Reader,
): Promise<InventoryDocumentDetail | null>;

export async function insertDocument(tx: Tx, values: NewInventoryDocument): Promise<{ id: string; docNumber: number }>;

export async function insertMovements(tx: Tx, rows: NewStockMovement[]): Promise<void>;
```

`findMany` resuelve los agregados por documento (`itemCount`, `totalQuantity`) con
una **segunda consulta** sobre los ids de la página —
`select document_id, count(*), sum(quantity) … where document_id in (…) group by document_id` —
y los cruza en TypeScript, en vez de con un join agregado sobre la consulta
principal (D-14).

## 7. Arquitectura y archivos afectados

- `src/lib/inventory-transactions.ts` — **nuevo**: catálogo puro de los 6 tipos.
- `src/lib/permissions.ts` — `inventory.move` en `PERMISSIONS` y en tres roles.
- `src/lib/reporting.ts` + `.test.ts` — **entra** `isFutureReportingDay()` (D-16).
- `src/modules/finance/lib/finance-range.ts` + `.test.ts` — **sale**
  `isFutureReportingDay()`.
- `src/modules/finance/schemas/finance.schema.ts` — importa de `@/lib/reporting`.
- `src/lib/utils.ts` + `.test.ts` — **entra** `formatDayKey()` (D-17).
- `src/modules/payroll/lib/payroll-dates.ts` + `.test.ts` — **sale**
  `formatIsoDate()`; sus dos consumidores (`employee-columns.tsx`,
  `payroll-payment-columns.tsx`) pasan a `formatDayKey()`.
- `src/modules/finance/components/expense-columns.tsx` — borra su `formatDay()`
  local y usa `formatDayKey()`.
- `src/server/db/schema/transaccion.ts` — **nuevo**: `transacciones` +
  `tipoTransaccion`.
- `src/server/db/schema/inventory-document.ts` — **nuevo**.
- `src/server/db/schema/stock-movement.ts` — **nuevo**.
- `src/server/db/schema/index.ts` — tres exports nuevos en el barrel.
- `drizzle/0008_*.sql` — **nueva** migración generada.
- `src/server/db/seed.ts` — `seedTransacciones()` y su llamada en `main()`.
- `src/server/repositories/product.repository.ts` + `.test.ts` —
  `applyStockChange()`.
- `src/server/repositories/inventory-document.repository.ts` + `.test.ts` — **nuevo**.
- `src/server/services/inventory-document.service.ts` + `.test.ts` — **nuevo**:
  `createDocument()`, única pieza con la regla de negocio y la transacción.
- `src/app/api/admin/inventory/documents/route.ts` — **nuevo**: `GET` y `POST`.
- `src/app/api/admin/inventory/documents/[id]/route.ts` — **nuevo**: `GET`.
- `src/modules/inventory/schemas/inventory-document.schema.ts` + `.test.ts` — **nuevo**.
- `src/modules/inventory/types/inventory-document.types.ts` — **nuevo**.
- `src/modules/inventory/constants.ts` — `inventoryDocumentKeys`, tamaños de página,
  copys de estado vacío y mensajes de conflicto del módulo.
- `src/modules/inventory/services/inventory-document.service.ts` — **nuevo**: axios.
- `src/modules/inventory/hooks/use-inventory-documents.ts` — **nuevo**:
  `useInventoryDocuments()` y `useInventoryDocument(id)`.
- `src/modules/inventory/hooks/use-inventory-document-mutations.ts` — **nuevo**:
  `useCreateInventoryDocument()` con sus tres invalidaciones.
- `src/modules/inventory/components/transaction-direction-badge.tsx` — **nuevo**.
- `src/modules/inventory/components/inventory-document-columns.tsx` — **nuevo**.
- `src/modules/inventory/components/document-lines-field.tsx` — **nuevo**: buscador
  de producto y edición de líneas dentro del modal.
- `src/modules/inventory/components/inventory-document-dialog.tsx` — **nuevo**: el
  modal de alta.
- `src/modules/inventory/components/inventory-document-detail-dialog.tsx` — **nuevo**.
- `src/modules/inventory/components/inventory-documents-table.tsx` — **nuevo**.
- `src/modules/inventory/components/inventory-tabs.tsx` — **nuevo**: «Alertas de
  stock» + «Movimientos», patrón de `payroll-tabs.tsx`.
- `src/app/(admin)/admin/inventory/page.tsx` — renderiza `<InventoryTabs />` en vez
  de `<InventoryTable />`. Sin cambio de permiso ni de ruta.
- `docs/SETUP.md` — §5.3/§5.6 (tablas nuevas) y §6 (módulo construido).

Flujo, capa por capa, sin saltos:

```
InventoryDocumentDialog ("use client")
  → useCreateInventoryDocument (TanStack Query)
    → createInventoryDocument (axios)
      → POST /api/admin/inventory/documents (authorize + Zod)
        → inventory-document.service (db.transaction)
          → product.repository.applyStockChange
          → inventory-document.repository.insertDocument / insertMovements
          → logAudit
            → Drizzle → Neon
```

Ningún componente importa `db`, Drizzle ni un repositorio, y ninguno llama a axios
directo.

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1**: `transacciones` es un **catálogo semilla de 6 filas** referenciado por FK desde la cabecera, con su fuente de verdad en código (`src/lib/inventory-transactions.ts`) | Un `pgEnum` sin tabla; o una tabla editable desde el panel con su CRUD | El requerimiento pide la tabla explícitamente y la FK hace que la base sea legible sin el repo. Que el catálogo viva además en código es lo que permite validar con `z.enum` en el borde (400 en vez de 500 por FK, AC7) y pintar el `Select` sin una petición extra. Es exactamente el reparto que ya tienen `permissions`: catálogo en código, filas en la base, seed idempotente, y `isPermissionCode()` descartando lo que no está en el código |
| **D-2**: Nombres físicos literales (`transacciones`, `idtrans`, `nomtrans`, `tipotrans`) con propiedades Drizzle idiomáticas (`id`, `name`, `direction`) | (a) Renombrar todo a inglés (`transaction_types`); (b) llamar `idtrans` también a la propiedad TypeScript | (a) rompería el requerimiento, que nombra la tabla y sus campos de forma explícita; (b) metería `nomtrans` en cada componente y en cada tipo de respuesta, contaminando una convención que el resto del repo respeta. El mapeo columna↔propiedad es para lo que existe el primer argumento de `varchar('idtrans')`. La excepción queda confinada a un archivo de schema y documentada en §5.1 |
| **D-3**: PK de `transacciones` de texto (`varchar(40)`) con el código estable | `uuid` con una columna `code` única, como `permissions` | Son 6 filas inmutables. El texto hace el seed idempotente con `onConflictDoUpdate` sobre la propia PK sin añadir una cuarta columna que el requerimiento no lista, deja `inventory_documents.transaccion_id` legible en cualquier `SELECT` a mano, y permite que el tipo de TypeScript sea la unión literal de los 6 códigos en vez de `string` |
| **D-4**: Sin endpoint para el catálogo de tipos | `GET /api/admin/inventory/transactions` | El catálogo es constante, lo conoce el cliente por un módulo puro y una petición para 6 filas fijas es latencia sin información. Si alguna vez se añade un tipo, el despliegue lo trae; el riesgo de deriva es el mismo que ya acepta `PERMISSIONS` |
| **D-5**: `stock_movements.quantity` siempre positiva; el signo lo pone `tipotrans` del documento | `quantity_delta` con signo (+5 / −5) y sumable directamente | La cantidad positiva es lo que una persona teclea y lo que dice el papel; un `-5` en la tabla obliga a recordar quién puso el signo al escribir y al leer. La dirección está a un `JOIN` de 6 filas, y toda consulta de historial necesita ya la cabecera para la fecha y la referencia. El coste es que `sum(quantity)` sin el join no significa nada, y por eso la suma siempre va con él |
| **D-6**: Correlativo único y compartido con `generatedAlwaysAsIdentity()` | (a) Sin número, identificando por uuid; (b) una serie por tipo de documento («Ingreso 001», «Salida 001») | (a) deja al usuario sin forma de referirse a una nota en voz alta o en un archivador. (b) exige un contador por serie, es decir, un `MAX()+1` con bloqueo o una secuencia por tipo, y eso es infraestructura para un problema que aquí no existe. Una secuencia sola resuelve la concurrencia sin una línea de aplicación; el precio son huecos cuando una transacción revierte, que es cosmético |
| **D-7**: El efecto en stock es un `UPDATE … SET stock = stock + $delta WHERE id = $id AND stock >= $qty` (el guard solo en salidas), con `RETURNING` | Leer el stock, comprobar en TypeScript y luego actualizar | Leer-comprobar-escribir deja una ventana entre las dos sentencias: dos salidas simultáneas del último producto pasarían las dos comprobaciones. El guard dentro del `WHERE` hace que la segunda no afecte ninguna fila. Es el mismo patrón que ya sostiene la idempotencia del webhook de Stripe (`UPDATE … WHERE status = 'pending'`, spec 007) |
| **D-8**: Una salida sin stock suficiente es `409` y **bloquea**; el stock nunca queda negativo por esta vía | Permitir el negativo como hace `decrementStock` (spec 007, D-10) | Los dos casos no se parecen: allí el stock ya se cobró en Stripe y el negativo es evidencia de una sobreventa real que no se puede deshacer. Aquí hay una persona tecleando y una salida mayor que el stock es, casi siempre, un dígito de más. El módulo existe para que el stock sea confiable; dejar que un error de captura lo hunda a negativo lo contradice |
| **D-9**: Los documentos no se editan, ni se borran, ni se anulan. La corrección es un documento en sentido contrario | Un `voided_at` como `payroll_payments`, o un `PATCH` sobre la cabecera | Anular un documento obligaría a revertir su efecto en stock, y ese revertido es exactamente un movimiento nuevo: la anulación no ahorra nada y además crea un estado («documento anulado pero con stock ya devuelto») que hay que mantener consistente. Un libro de inventario se corrige asentando el contrario, no tachando. `audit_logs` marcó el precedente: append-only y sin `UPDATE` desde la aplicación |
| **D-10**: FK del detalle a la cabecera con `restrict`, no `cascade` como `order_items` | `onDelete: 'cascade'` por simetría con `order_items` | En `orders` el `cascade` documenta que una línea no significa nada sin su pedido, y los pedidos sí podrían borrarse algún día. Aquí la propiedad que hay que dejar escrita es la contraria: un documento con movimientos **no se puede borrar**, y `restrict` lo dice en la definición en vez de confiarlo a que nadie escriba el `DELETE` |
| **D-11**: Cada línea guarda `stock_after` | Recalcular el historial sumando movimientos desde cero | El valor ya viene gratis en el `RETURNING` del `UPDATE`, así que no cuesta ni una consulta. A cambio, la línea se lee sola («salieron 5, quedaron 3») sin replicar la aritmética, y una divergencia entre `sum(movimientos)` y `products.stock` —posible, porque el webhook de Stripe descuenta sin pasar por aquí (D-13)— queda a la vista en vez de propagarse |
| **D-12**: La lógica vive en `src/server/services/inventory-document.service.ts`, no en el Route Handler | Orquestar en el handler, como el CRUD de productos o de gastos | La operación cruza tres repositorios (`product`, `inventory-document`, `audit-log`) y tiene reglas —stock suficiente, existencia del producto, orden de bloqueo—, que es justo la frontera que `docs/SETUP.md` §3 marca para `server/services/` y la misma razón por la que los pagos de nómina tienen service y el alta de empleados no (spec 018, D-9) |
| **D-13**: El webhook de Stripe **no** escribe en `stock_movements` en este spec | Reescribir `order-fulfillment.service.ts` para que toda venta emita su nota de salida | Es la tentación evidente y se rechaza a conciencia: tocar el camino del cobro —idempotente, probado y con dinero real detrás— para estrenar tres tablas es cambiar lo que funciona por lo que aún no. La consecuencia declarada es que `sum(stock_movements)` no explica el stock entero, solo los movimientos manuales, y que «salida por venta» se registra a mano mientras tanto. El enganche natural está documentado en §11 |
| **D-14**: `itemCount` y `totalQuantity` salen de una segunda consulta agrupada sobre los ids de la página | Un `LEFT JOIN … GROUP BY` sobre la consulta principal paginada | El spec 015 documenta un bug de `GROUP BY` mal renderizado que pasó typecheck, lint y 731 tests. Una consulta agrupada sobre 20 ids, por una columna real y sin plantillas `sql` compartidas entre cláusulas, no entra en esa clase de error; además mantiene el `count()` del total intacto y no multiplica filas de la cabecera |
| **D-15**: El modal es **multi-línea** y las líneas se añaden desde un buscador de producto dentro del diálogo | (a) Una línea por documento; (b) un `Select` con todos los productos | (a) contradice la palabra «documento»: una nota de ingreso por compra lista lo que trajo el proveedor, y forzar un documento por SKU multiplicaría por diez los registros y las referencias repetidas. (b) no escala: el catálogo crece y un desplegable de cientos de opciones es inutilizable — mismo problema que el spec 018 evitó registrando el pago desde la fila del empleado. El buscador usa `Command` **en línea** dentro del diálogo, sin `Popover`, así que no hay componente de shadcn nuevo que instalar |
| **D-16**: `isFutureReportingDay()` se muda de `src/modules/finance/lib/finance-range.ts` a `src/lib/reporting.ts` | Importarla desde inventario (`inventory → finance`); o duplicar la comprobación | «Hoy en la zona con la que el negocio corta sus días» no es una propiedad de finanzas, igual que no lo era del dashboard cuando el spec 017 (D-9) mudó allí las otras cinco primitivas. Que inventario importara de finanzas acoplaría dos dominios que no se conocen, y duplicarla garantiza que un día discrepen |
| **D-17**: El formateo de un día `'AAAA-MM-DD'` se unifica en `formatDayKey()` dentro de `src/lib/utils.ts` | Escribir una tercera copia local en inventario | Verificado: ya existen dos implementaciones distintas de lo mismo —`formatIsoDate()` en `payroll/lib/payroll-dates.ts`, que parte la cadena, y `formatDay()` en `finance/components/expense-columns.tsx`, que construye un `Date` a mediodía UTC—. Inventario sería la tercera, que es exactamente el umbral que fija CLAUDE.md §6 para extraer. Se conserva la implementación de nómina (sin construir ningún `Date`: `new Date('2026-09-01')` es medianoche UTC y en Lima se pinta como 31 de agosto). Consecuencia visible y aceptada: la columna de fecha de gastos pasa a decir `01 sep 2026` en vez de `01 sept 2026` |
| **D-18**: Las líneas se aplican **ordenadas por `productId`** dentro de la transacción | Aplicarlas en el orden en que llegaron del formulario | Dos documentos simultáneos que tocan los mismos dos productos en orden inverso se bloquean mutuamente hasta que Postgres mata a uno por deadlock. Ordenar por un criterio total y estable hace que todas las transacciones tomen los bloqueos en la misma secuencia, y cuesta un `toSorted()`. El orden de las líneas que ve el usuario no cambia: se ordena la aplicación, no la respuesta |
| **D-19**: En `audit_logs` se registra el documento (número, tipo, fecha, nº de líneas), no las cantidades por producto | Volcar las líneas completas en `changes` | El detalle vive en `stock_movements`, que es append-only y permanente, mientras que la bitácora `info` se purga a los 180 días: duplicar allí el detalle sería la copia que caduca. `severity: 'info'` y no `warning` como nómina, justo porque aquí la fuente de verdad no es el log. No hay dato sensible en juego —cantidades y SKU, sin importes—, así que no aplica la restricción del spec 018 (D-8) |
| **D-20**: Dos pestañas en `/admin/inventory` y ninguna ruta nueva | `/admin/inventory/documents` como página propia con su entrada en la navegación | Son dos vistas del mismo dominio y del mismo permiso de lectura, igual que Personal y Pagos en nómina (spec 018, D-18). Una entrada más en el sidebar para algo que se consulta desde la misma pantalla en la que se detecta la falta de stock separa dos gestos que en la práctica son uno. La pestaña activa es estado local, sin Zustand y sin parámetro en la URL |

## 9. Tareas

Ordenadas por dependencia. Dos puntos de control naturales: al terminar **T9** la
base y los permisos están listos y verificables en `db:studio`; al terminar **T22**
la API completa es probable sin UI.

- [x] **T1** — Catálogo puro de los 6 tipos: `TRANSACTION_TYPES`,
      `TRANSACTION_TYPE_CODES`, los tipos derivados y los tres helpers de §5.2 ·
      archivo: `src/lib/inventory-transactions.ts` · verificación:
      `npm run typecheck`
- [x] **T2** — Tests del catálogo: 6 entradas, 3 por dirección,
      `isTransactionTypeCode()` rechaza un código inventado,
      `transactionDirection('salida_venta') === 'salida'` · archivo:
      `src/lib/inventory-transactions.test.ts` · verificación: `npm test`
- [x] **T3** — Schema `transacciones` y enum `tipoTransaccion` según §5.2, con el
      comentario del mapeo columna↔propiedad · archivo:
      `src/server/db/schema/transaccion.ts` · verificación: `npm run typecheck`
- [x] **T4** — Schema `inventory_documents` según §5.3, con sus tres índices y sin
      ninguna columna de mutación · archivo:
      `src/server/db/schema/inventory-document.ts` · verificación:
      `npm run typecheck`
- [x] **T5** — Schema `stock_movements` según §5.4, con el único de
      `(document_id, product_id)` y el `CHECK` de cantidad positiva · archivo:
      `src/server/db/schema/stock-movement.ts` · verificación: `npm run typecheck`
- [x] **T6** — Exportar las tres tablas y el enum desde el barrel · archivo:
      `src/server/db/schema/index.ts` · verificación: `npm run typecheck`
- [x] **T7** — Generar y aplicar la migración; revisar el SQL antes de aplicarlo
      (que la identidad, el `CHECK` y los dos únicos estén) · comandos:
      `npm run db:generate && npm run db:migrate` · archivo: `drizzle/0008_*.sql` ·
      verificación: `npm run db:studio` — las tres tablas existen y `transacciones`
      está vacía
- [x] **T8** — `seedTransacciones()` con `onConflictDoUpdate` sobre `idtrans`
      (misma forma que `seedPermissions`), leyendo `TRANSACTION_TYPES`, más su
      llamada en `main()` antes de `bootstrapSuperAdmin` · archivo:
      `src/server/db/seed.ts` · verificación: `npm run typecheck`
- [x] **T9** — Añadir `inventory.move` a `PERMISSIONS` (pasa de 25 a 26) y
      repartirlo a `super_admin`, `admin` y `manager` · archivo:
      `src/lib/permissions.ts` · verificación: `npm run typecheck && npm test`
- [x] **T10** — Ejecutar el seed **dos veces** y comprobar 26 permisos y 6 filas en
      `transacciones` tras la segunda (AC18) · comando: `npm run db:seed` ·
      verificación: salida del seed + `npm run db:studio`
- [x] **T11** — Mover `isFutureReportingDay()` de
      `src/modules/finance/lib/finance-range.ts` a `src/lib/reporting.ts`, con su
      bloque de tests, y actualizar su único importador
      (`src/modules/finance/schemas/finance.schema.ts`) · archivos: los cuatro ·
      verificación: `npm run typecheck && npm test` · nota: es un solo cambio
      atómico — borrar la función sin mover el importador deja el árbol sin
      compilar (D-16)
- [x] **T12** — Extraer `formatDayKey()` a `src/lib/utils.ts` con la
      implementación de `formatIsoDate()` (sin construir ningún `Date`) y su test;
      borrar `formatIsoDate()` de `payroll-dates.ts` y `formatDay()` de
      `expense-columns.tsx`, y apuntar sus tres consumidores al helper · archivos:
      `src/lib/utils.ts`, `src/lib/utils.test.ts`,
      `src/modules/payroll/lib/payroll-dates.ts` (+ test),
      `src/modules/payroll/components/employee-columns.tsx`,
      `src/modules/payroll/components/payroll-payment-columns.tsx`,
      `src/modules/finance/components/expense-columns.tsx` · verificación:
      `npm run typecheck && npm test` · nota: igual que T11, indivisible (D-17)
- [x] **T13** — Schemas Zod del módulo según §6:
      `createInventoryDocumentSchema`, `inventoryDocumentQuerySchema`,
      `documentItemSchema` y el `inventoryDocumentFormSchema` del modal · archivo:
      `src/modules/inventory/schemas/inventory-document.schema.ts` · verificación:
      `npm run typecheck`
- [x] **T14** — Tests del schema: tipo fuera del catálogo → error; `items: []` →
      error; `productId` repetido → error con `DUPLICATE_ITEM_MESSAGE`; cantidad
      `0` y `-1` → error; `docDate` de mañana en Lima → error y la de hoy a las
      23:00 de Lima → válida; query vacía → `{ direction: 'all', page: 1,
      pageSize: 20 }`; rango invertido → error con `path: ['from']` · archivo:
      `src/modules/inventory/schemas/inventory-document.schema.test.ts` ·
      verificación: `npm test`
- [x] **T15** — Tipos de salida de §6 · archivo:
      `src/modules/inventory/types/inventory-document.types.ts` · verificación:
      `npm run typecheck`
- [x] **T16** — `applyStockChange(tx, change)` en el repositorio de productos,
      con el guard `stock >= qty` dentro del `WHERE` solo cuando `delta < 0` y
      `RETURNING { stock }` · archivo:
      `src/server/repositories/product.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T17** — Tests de `applyStockChange` con `PgDialect` (patrón de
      `order.repository.test.ts`): un `delta` positivo no añade la condición de
      stock; uno negativo sí y con el valor absoluto como parámetro; el `SET` usa
      `"stock" + $n` y no un literal interpolado · archivo:
      `src/server/repositories/product.repository.test.ts` · verificación:
      `npm test`
- [x] **T18** — Repositorio de documentos: `buildDocumentFilters()` exportada
      (dirección vía join con `transacciones`, rango inclusivo sobre `doc_date`,
      `search` sobre `reference` con `escapeLikePattern`), `findMany()` con el
      orden `doc_date desc, doc_number desc`, la segunda consulta agregada de D-14,
      `findById()` con sus líneas, `insertDocument()` e `insertMovements()`
      (ambas exigen `Tx`) · archivo:
      `src/server/repositories/inventory-document.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T19** — Tests del repositorio con `PgDialect`: sin filtros el `WHERE` es
      `undefined`; `direction` filtra por `tipotrans`; el rango usa `>=`/`<=` sobre
      `doc_date`; `50%_off` llega escapado como `%50\%\_off%`; el orden incluye
      `doc_number desc`; los mutadores no aceptan el `db` global · archivo:
      `src/server/repositories/inventory-document.repository.test.ts` ·
      verificación: `npm test`
- [x] **T20** — Service `createDocument()`: una sola `db.transaction` con
      (1) lectura de los productos por id con el `tx` → `NotFoundError` si falta
      alguno; (2) líneas ordenadas por `productId` (D-18); (3) `applyStockChange`
      por línea con el signo de la dirección → `ConflictError` nombrando producto,
      stock y cantidad cuando devuelve `null`; (4) `insertDocument` +
      `insertMovements` con el `stockAfter` del `RETURNING`; (5) `logAudit` con
      `inventory_document.created`, `severity: 'info'` y el `changes` de D-19 ·
      archivo: `src/server/services/inventory-document.service.ts` ·
      verificación: `npm run typecheck`
- [x] **T21** — Tests del service con los repositorios mockeados (patrón de
      `payroll.service.test.ts`): producto inexistente → `NotFoundError`;
      `applyStockChange` que devuelve `null` en la segunda línea → `ConflictError`
      y ningún insert; ingreso → delta positivo y salida → delta negativo; las
      líneas se aplican ordenadas por `productId`; `logAudit` recibe el `tx` y no
      lleva ninguna cantidad por producto · archivo:
      `src/server/services/inventory-document.service.test.ts` · verificación:
      `npm test`
- [x] **T22** — Route Handler `GET` + `POST` de `/api/admin/inventory/documents`
      según §6: `authorize()` en la primera línea de cada verbo —`inventory.read`
      y `inventory.move`—, `safeParse`/`parseJsonBody`, `meta.canMove` con
      `can(granted, 'inventory.move')` y `toErrorResponse` en ambos `catch` ·
      archivo: `src/app/api/admin/inventory/documents/route.ts` · verificación:
      `npm run build`
- [x] **T23** — Route Handler `GET` de `/api/admin/inventory/documents/[id]` con
      `authorize('inventory.read')`, id validado con `z.uuid()` → `400`, y `404`
      cuando el repositorio devuelve `null` · archivo:
      `src/app/api/admin/inventory/documents/[id]/route.ts` · verificación:
      `npm run build`
- [x] **T24** — Constantes del módulo: `inventoryDocumentKeys`
      (`all`/`lists()`/`list(params)`/`detail(id)`),
      `INVENTORY_DOCUMENTS_PAGE_SIZE = 20`, los copys de los dos estados vacíos y
      los rótulos de dirección · archivo: `src/modules/inventory/constants.ts` ·
      verificación: `npm run typecheck`
- [x] **T25** — Service de cliente: `fetchInventoryDocuments(params)`,
      `fetchInventoryDocument(id)` y `createInventoryDocument(input)` con la
      instancia de `@/lib/axios` · archivo:
      `src/modules/inventory/services/inventory-document.service.ts` ·
      verificación: `npm run typecheck`
- [x] **T26** — Hooks de lectura: `useInventoryDocuments(params)` con
      `placeholderData: keepPreviousData` y `useInventoryDocument(id)` con
      `enabled: Boolean(id)` · archivo:
      `src/modules/inventory/hooks/use-inventory-documents.ts` · verificación:
      `npm run typecheck`
- [x] **T27** — `useCreateInventoryDocument()` invalidando
      `inventoryDocumentKeys.lists()`, `inventoryKeys.lists()` y
      `productKeys.lists()` — el documento mueve stock y las tres vistas lo leen
      (AC16) · archivo:
      `src/modules/inventory/hooks/use-inventory-document-mutations.ts` ·
      verificación: `npm run typecheck`
- [x] **T28** — `TransactionDirectionBadge`: mapa total
      `Record<TransactionDirection, …>` con icono y texto —entrada en verde,
      salida en ámbar, ambas con `variant="outline"` porque `badge.tsx` no tiene
      variante `warning`—, nunca solo color · archivo:
      `src/modules/inventory/components/transaction-direction-badge.tsx` ·
      verificación: `npm run typecheck`
- [x] **T29** — `getInventoryDocumentColumns({ onView })`: nº (`font-mono`),
      fecha (`formatDayKey`, `tabular-nums`), tipo con su badge de dirección,
      referencia (`—` cuando es `null`), ítems y unidades (`tabular-nums`),
      registrado por, y la acción «Ver» · archivo:
      `src/modules/inventory/components/inventory-document-columns.tsx` ·
      verificación: `npm run typecheck`
- [x] **T30** — `DocumentLinesField`: buscador de producto con `Command` en línea
      (sin `Popover`) alimentado por `useProducts({ q, status: 'active', page: 1,
      pageSize: 10 })` con `useDebounce`, lista de líneas añadidas con su cantidad
      editable, stock actual a la vista, botón de quitar, y bloqueo de añadir dos
      veces el mismo producto (D-15, AC8) · archivo:
      `src/modules/inventory/components/document-lines-field.tsx` ·
      verificación: `npm run typecheck`
- [x] **T31** — `InventoryDocumentDialog({ open, onOpenChange, direction })`:
      `Dialog` + React Hook Form con `zodResolver`, `Select` de tipo filtrado por
      `transactionTypesByDirection(direction)` (AC15), fecha del documento con
      hoy por defecto, referencia opcional, `<DocumentLinesField />`, y el error
      del `409` de stock pintado sobre la línea culpable · archivo:
      `src/modules/inventory/components/inventory-document-dialog.tsx` ·
      verificación: `npm run typecheck`
- [x] **T32** — `InventoryDocumentDetailDialog`: solo lectura, cabecera del
      documento y tabla de líneas con producto, SKU, cantidad y stock resultante,
      con sus estados de carga y error (AC19) · archivo:
      `src/modules/inventory/components/inventory-document-detail-dialog.tsx` ·
      verificación: `npm run typecheck`
- [x] **T33** — `InventoryDocumentsTable`: `"use client"`, `Select` de dirección,
      rango de días, buscador de referencia con debounce, reinicio de `page` al
      cambiar filtros, `useReactTable` con `manualPagination`/`manualFiltering`,
      `DataTable` con `isLoading`/`isError`/`onRetry`, los dos estados vacíos
      (AC17) y —solo con `meta.canMove`— los botones «Nota de ingreso» y «Nota de
      salida» que abren el diálogo con su dirección · archivo:
      `src/modules/inventory/components/inventory-documents-table.tsx` ·
      verificación: `npm run typecheck`
- [x] **T34** — `InventoryTabs` con «Alertas de stock» (`<InventoryTable />`, sin
      tocarlo) y «Movimientos» (`<InventoryDocumentsTable />`), pestaña activa en
      `useState` (D-20) · archivo:
      `src/modules/inventory/components/inventory-tabs.tsx` · verificación:
      `npm run typecheck`
- [x] **T35** — La página renderiza `<InventoryTabs />` y su encabezado explica
      las dos vistas; se mantiene `requirePagePermission('inventory.read')` ·
      archivo: `src/app/(admin)/admin/inventory/page.tsx` · verificación:
      `npm run build`
- [x] **T36** — Documentar en `docs/SETUP.md`: las tres tablas nuevas en §5 (con
      la nota de nomenclatura de §5.1 de este spec) y el módulo construido en §6
      —permiso nuevo, endpoints, append-only, el 409 de stock y que el webhook de
      Stripe sigue sin escribir movimientos (D-13)— · archivo: `docs/SETUP.md` ·
      verificación: lectura
- [x] **T37** — Cierre:
      `npm run typecheck && npm run lint && npm test && npm run build` en verde y
      recorrido manual en navegador de AC3, AC4, AC5, AC9, AC15, AC16, AC17 y AC19
      con una cuenta `super_admin` y otra con rol `audit`. El recorrido manual no
      es opcional: el spec 015 documenta un bug de SQL que pasó typecheck, lint y
      731 tests y solo lo atrapó abrir la página · verificación: salida de los
      cuatro comandos + recorrido
  - **Recorrido manual confirmado por el usuario** el 2026-09-18: verificado en
    navegador con cuenta `super_admin` y cuenta `audit`.
  - **Hecho**: `npm run typecheck`, `npm run lint` (0 errores, 13 avisos —todos el
    mismo `useReactTable` que ya arrastran las otras diez tablas del panel—),
    `npm test` (1077 pruebas) y `npm run build` en verde.
  - **Hecho**: recorrido del camino de escritura **contra la base real** con un
    script desechable sobre el service y el repositorio —AC4, AC5, AC6, AC8, AC10,
    AC12, AC13 y AC19, más el `CHECK` de cantidad positiva, el único de
    `(document_id, product_id)` y la identidad del correlativo ejercitados en
    Postgres—, con limpieza posterior: `inventory_documents` y `stock_movements`
    quedaron en 0 filas y el stock restaurado. Es justo el riesgo estructural que
    §10 declara como no cubierto por los tests.
  - **Hecho**: AC1 y AC11 contra el servidor de desarrollo — `GET` y `POST` sin
    sesión devuelven `401` con `{ message }` y no un `307`; `PATCH` y `DELETE`
    sobre el detalle devuelven `405`.
  - **Pendiente**: el recorrido **en navegador** de AC3, AC9, AC15, AC16 y AC17 con
    una cuenta `super_admin` y otra con rol `audit`. Es lo único que falta para
    cerrar esta tarea; quedó fuera de lo que el agente pudo ejecutar, sin
    herramientas de navegador ni sesión de Clerk.

## 10. Riesgos y consideraciones

- **Dos escritores de stock que no se hablan.** `products.stock` lo mueven ahora el
  webhook de Stripe (`decrementStock`), el `PATCH` de productos y este módulo. Solo
  el tercero deja movimiento, así que `sum(stock_movements)` **no** reconstruye el
  stock actual y nadie debe programar como si lo hiciera. `stock_after` (D-11) hace
  visible la divergencia en la propia línea. Unificarlo es §11.
- **Deadlocks entre documentos simultáneos.** Dos transacciones que actualizan los
  mismos productos en orden inverso se bloquean. Mitigado ordenando las líneas por
  `productId` (D-18); si aun así aparece un `40P01` en los logs, el siguiente paso
  es reintentar la transacción una vez, no ampliar el bloqueo.
- **Un `UPDATE` por línea.** Con el tope de 50 líneas y dentro de una transacción ya
  abierta es aceptable, igual que en `decrementStock`. Si el tope creciera, la
  salida es `UPDATE … FROM (VALUES …)` en una sola sentencia.
- **Sin tests de integración contra Postgres.** El riesgo estructural que arrastran
  los specs 015, 016 y 017. Aquí es mayor que en el 016 porque hay escrituras: el
  `CHECK`, el índice único parcial de `(document_id, product_id)`, la identidad del
  correlativo y el guard `stock >= qty` solo se ejercitan de verdad contra la base.
  Por eso T7 exige leer el SQL generado y T37 el recorrido manual.
- **Huecos en el correlativo.** Una secuencia de Postgres no revierte con la
  transacción: una nota que falla por stock insuficiente consume su número. Es
  correcto y esperado; si alguien audita esperando una serie sin saltos, la
  respuesta es que el documento no existió.
- **`ilike '%texto%'` sobre `reference` no usa índice.** Mismo umbral de dolor y
  misma salida futura (`pg_trgm`) que las búsquedas de productos, clientes e
  inventario.
- **Escape de comodines obligatorio.** Sin `escapeLikePattern`, `search=%` devuelve
  todos los documentos como si fuera un resultado (AC13). La función existe desde el
  spec 014; no se reimplementa.
- **Productos inactivos.** El documento acepta cualquier producto existente, activo
  o no: una devolución de algo ya retirado del catálogo es un movimiento legítimo.
  El buscador del modal solo ofrece activos, así que el caso entra por API, no por
  UI. Queda escrito para que nadie lo lea como un olvido.
- **Rollback de la migración.** Deshacer es borrar las tres tablas y el enum, en
  orden inverso a las FK (`stock_movements` → `inventory_documents` →
  `transacciones` → `tipo_transaccion`). El stock ya movido **no** se revierte solo:
  los `UPDATE` sobre `products` no viven en las tablas nuevas. Antes de revertir hay
  que decidir si se compensa a mano.
- **Ventana entre permiso y seed.** Hasta que T10 corre, `inventory.move` no existe
  en la tabla `permissions` y nadie —ni `super_admin`— puede registrar un documento:
  `getEffectivePermissions()` resuelve contra la base. T10 va inmediatamente detrás
  de T9 por eso.
- **Las dos extracciones (T11 y T12) tocan módulos ajenos.** Finanzas y nómina
  quedan con importes y fechas idénticos, pero es código que este spec no estrena.
  Los tests existentes de ambos módulos son la red; si alguno se pone rojo, el
  problema es de la extracción y no de inventario.
- **Sin caché de servidor.** Vista de administración autenticada: nada de
  `revalidate` ni `s-maxage`, y sin `refetchInterval`. El refresco lo da la
  invalidación de la mutación y el retorno a la pestaña.

## 11. Fuera de alcance / deuda aceptada

- **La venta no emite su nota de salida.** Es la deuda principal (D-13). El enganche
  natural es `order-fulfillment.service.ts`, que ya corre en una transacción y ya
  llama a `decrementStock`: allí mismo se emitiría un `inventory_documents` de tipo
  `salida_venta`, con el número de pedido como documento de referencia y `actor_id`
  nulo porque el actor es el webhook. Se retoma cuando el módulo manual lleve tiempo
  en uso y su forma esté asentada; hacerlo ahora tocaría el camino del cobro para
  estrenar tablas sin rodaje.
- **Kardex por producto.** Los datos están (`stock_movements` con su índice por
  `product_id`) y la pantalla no. Cuando se construya, el sitio es una pestaña en la
  ficha de producto del panel y la consulta es un join con la cabecera ordenado por
  `doc_date desc, doc_number desc`.
- **Anulación de documentos.** No existe y no se echará en falta mientras el
  contra-documento sea el camino (D-9). Si alguna vez hiciera falta marcar «esta
  nota fue un error» sin emitir otra, lo correcto es una columna
  `reversed_by_document_id` que apunte al contrario, no un `voided_at` que deje el
  stock desalineado.
- **Ajustes de inventario y conteo físico.** Los 6 tipos del catálogo no cubren
  «ajuste por merma» ni «ajuste por conteo». Añadirlos es una fila de seed y una
  entrada en `TRANSACTION_TYPES`, pero un conteo físico de verdad necesita además
  una pantalla de captura masiva, y eso sí es otro spec.
- **Correlativo por serie.** Un solo contador compartido (D-6). El día que
  contabilidad exija «NI-000123» y «NS-000045» por separado, hace falta una columna
  `series` y una secuencia por serie.
- **Filtro por tipo concreto y búsqueda por número.** El listado filtra por
  dirección; afinar a «salida por préstamo» o buscar la nota 137 se difiere hasta
  que el volumen lo pida. Ambos son un parámetro más en
  `inventoryDocumentQuerySchema` y una condición más en `buildDocumentFilters()`.
- **Impresión y exportación.** No hay PDF de la nota ni CSV del listado. La nota
  impresa es el uso más probable del correlativo; se difiere junto con el resto de
  la exportación del panel, que ya está pendiente en los specs 014, 016 y 017.
- **Valorización.** Sin costo en `products` no hay valor de inventario, y por tanto
  este módulo no alimenta el resumen financiero del spec 017. Si algún día se añade
  `cost_cents`, el movimiento tendría que congelar el costo unitario como
  `order_items` congela el precio, y solo entonces tendría sentido hablar de costo
  de mercadería vendida.

## 12. Hallazgos de revisión

Auditoría del `reviewer` sobre la implementación: sin hallazgos bloqueantes ni
mayores, y cuatro menores. **Los cuatro quedaron resueltos** (iteración 2 del bucle
developer ⇄ reviewer):

- [x] **R1 — La acción no estaba en el catálogo de la bitácora.**
      `inventory_document.created` y el `entityType` `inventory_document` se pintaban
      con su código crudo en `/admin/audit-logs` y no aparecían en los desplegables de
      filtro. Se registran ahora en `AUDIT_ACTIONS`, `ENTITY_TYPE_LABELS`,
      `AUDIT_ENTITY_OPTIONS` y, en `FIELD_LABELS`, los cuatro campos que escribe el
      `after` de D-19 (`docNumber`, `transaccionId`, `docDate`, `itemCount`), con sus
      tests · archivos: `src/modules/audit/constants.ts` (+ `.test.ts`)
- [x] **R2 — `transactionName()` sin consumidor.** La única llamada era la de su
      propio test, es decir, una abstracción con un solo consumidor (CLAUDE.md §6).
      Borrada junto con su bloque de test. `isTransactionTypeCode()` se mantiene: el
      spec la pide como espejo de `isPermissionCode()` (§5.2, D-1) · archivos:
      `src/lib/inventory-transactions.ts` (+ `.test.ts`)
- [x] **R3 — El 409 de stock se atribuía a la línea por substring del nombre.** Dos
      productos donde uno fuese prefijo del otro marcaban la línea equivocada. Ahora
      el conflicto viaja con el id: `ConflictError` acepta `details`, el cuerpo del
      409 es `{ message, productId }`, el interceptor de axios rechaza con un
      `ApiError` que conserva status y cuerpo —antes los colapsaba a
      `new Error(message)`— y el diálogo localiza la línea comparando `productId` ·
      archivos: `src/lib/errors.ts`, `src/lib/api-guard.ts`, `src/lib/axios.ts`,
      `src/server/services/inventory-document.service.ts` (+ `.test.ts`),
      `src/modules/inventory/constants.ts` (+ `.test.ts`),
      `src/modules/inventory/components/inventory-document-dialog.tsx`
- [x] **R4 — Aserción de tipo evitable en el hook de detalle.**
      `fetchInventoryDocument(id as string)` con `enabled: Boolean(id)` pasa a
      `queryFn: id ? () => fetchInventoryDocument(id) : skipToken`: misma consulta
      inactiva y el tipo estrechado por el propio `if` · archivo:
      `src/modules/inventory/hooks/use-inventory-documents.ts`

Verificación tras las correcciones: `npm run typecheck` ✓, `npm run lint` ✓ (0
errores, los 13 avisos de siempre por `useReactTable`), `npm test` ✓ (1086 pruebas)
y `npm run build` ✓.
