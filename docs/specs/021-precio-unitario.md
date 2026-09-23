---
id: 021
title: Precio unitario — costo promedio ponderado y margen por producto
status: done
module: finance
scope: admin
created: 2026-09-21
---

# 021 — Precio unitario: costo promedio ponderado y margen por producto

## 1. Contexto

El panel sabe a cuánto vende y no sabe a cuánto compra. Verificado contra
`src/server/db/schema/`: **ninguna de las catorce tablas tiene una columna de
costo** —`products` guarda `price_cents`, `compare_at_price_cents` y `stock`, y
nada más— y `stock_movements` registra unidades y `stock_after` sin importe. La
consecuencia está escrita en dos sitios del propio repo: el spec 017 advierte que
su «resultado» **no es utilidad contable** porque no descuenta el costo de la
mercadería vendida, y el spec 020 anota la valorización de inventario como fuera
de alcance «porque `products` no tiene columna de costo».

Este spec es el sub-proyecto **#1 del roadmap del módulo de Finanzas**
(`docs/superpowers/specs/2026-09-21-modulo-finanzas-design.md`, §2). Se eligió
como primero porque es el único que no depende de la facturación electrónica y
porque responde una pregunta que hoy no tiene respuesta en ningún sitio: **qué
margen deja cada producto**. Los sub-proyectos #0 y #2–#6 (facturación, egresos
v2, ingresos v2, impuestos, ganancias v2, contabilidad) quedan fuera y cada uno
tiene su propio documento de diseño.

El módulo de inventario del spec 020 ya aporta el hecho económico que faltaba:
las notas de ingreso de tipo `ingreso_compra` son, literalmente, «entró
mercadería comprada». Lo único que no capturan es a cuánto. Este spec añade ese
dato y lo convierte en un costo promedio ponderado por producto.

## 2. Objetivo

Una persona con `finance.read` abre `/admin/finance/pricing` y ve, producto a
producto, su precio de venta, su costo promedio ponderado y el margen que deja
en soles y en porcentaje; el costo se alimenta solo de las notas de
`ingreso_compra` y, para el stock que ya existía antes de este spec, de un costo
inicial que se carga a mano una única vez.

## 3. Alcance

### Incluye

- Columna `products.average_cost_cents` (`integer`, nullable): el costo promedio
  ponderado vigente. `null` significa «sin costo registrado», nunca `0`.
- Columna `stock_movements.unit_cost_cents` (`integer`, nullable): el costo
  unitario pagado, exigido **solo** cuando el documento es `ingreso_compra`.
- Recálculo del promedio ponderado **en la misma transacción** que registra la
  nota de `ingreso_compra`, dentro del mismo `UPDATE` que mueve el stock.
- Un permiso nuevo: `pricing.set_initial_cost` (el catálogo pasa de 26 a 27
  códigos), solo para `super_admin` y `admin`.
- Página `/admin/finance/pricing` protegida con
  `requirePagePermission('finance.read')` y su entrada en la navegación.
- `GET /api/admin/pricing`: listado paginado de productos activos con precio,
  costo, margen en céntimos y margen en porcentaje.
- `POST /api/admin/pricing/[id]/initial-cost`: carga del costo inicial, una sola
  vez por producto, con su entrada en `audit_logs` en la misma transacción.
- Campo de costo unitario por línea en el formulario de nota de inventario,
  visible solo cuando el tipo elegido es «Ingreso por compra».
- Migración Drizzle `0009` (verificado: el último journal es `0008`).
- Corrección acoplada: `average_cost_cents` **no** puede aparecer en las
  proyecciones ni en la bitácora del módulo de productos (§8, D-8 y D-9).

### No incluye (explícito)

- **FIFO, LIFO y costeo por lote.** Se eligió promedio ponderado (D-1).
- **Margen realizado histórico por venta.** Exige congelar el costo en
  `order_items`, que hoy solo congela `price_cents_snapshot`; es el
  sub-proyecto #5 del roadmap (Ganancias v2).
- **Integración con el resumen financiero del spec 017.** El costo de la
  mercadería vendida no entra en `netCents` y `/admin/finance` sigue diciendo
  exactamente lo que dice hoy. También es Ganancias v2.
- **Si el costo registrado incluye IGV o no.** Se registra el importe tal y como
  se pagó, sin desagregar impuesto (D-12). El crédito fiscal es el
  sub-proyecto #4.
- Alertas, umbrales y semáforos de margen bajo.
- Edición o corrección del costo promedio una vez tiene valor, y anulación de
  una nota de compra para deshacer su efecto en el costo (las notas siguen sin
  `PATCH` ni `DELETE`, spec 020 D-9).
- Valorización del inventario (`stock × costo`) como cifra de la pantalla,
  kardex valorizado y consulta del costo unitario por línea de documento.
- Backfill del costo de las notas de `ingreso_compra` ya registradas: no se
  inventa ningún importe retroactivo (§10).
- Proveedores como entidad, precio de compra por proveedor, multimoneda y
  descuentos de compra.
- Gráficos y exportación, mismo criterio que el resto del módulo financiero
  (spec 017, D-13).
- Ordenación configurable y filtro por categoría en la tabla: el orden es fijo
  (§6).

## 4. Criterios de aceptación

- [ ] AC1 — Dado un visitante sin sesión, cuando pide cualquiera de los dos
      endpoints nuevos, entonces recibe `401` con cuerpo `{ message }` y no un
      `307` al formulario de Clerk.
- [ ] AC2 — Dado un usuario con sesión y sin `finance.read`, cuando pide
      `GET /api/admin/pricing?page=abc`, entonces recibe `403` y no `400`: la
      autorización ocurre antes de mirar la query.
- [ ] AC3 — Dado un usuario con rol `manager` o `audit`, cuando abre
      `/admin/finance/pricing`, entonces ve el `403` de `src/app/forbidden.tsx` y
      la entrada «Precio unitario» no aparece en la navegación del panel.
- [ ] AC4 — Dado un usuario con `finance.read` y sin `pricing.set_initial_cost`,
      entonces `meta.canSetInitialCost` es `false`, la tabla no pinta la acción
      «Establecer costo inicial» y un `POST` directo responde `403`.
- [ ] AC5 — Dado un producto sin costo registrado, entonces su fila publica
      `averageCostCents: null`, `marginCents: null` y `marginPercent: null`, y la
      UI muestra «Sin costo registrado»; nunca `S/ 0.00` ni `0 %`.
- [ ] AC6 — Dada una nota de `ingreso_compra` en la que alguna línea llega sin
      `unitCostCents`, entonces la respuesta es `400` con `issues` y **no** se
      inserta el documento ni se mueve ningún stock.
- [ ] AC7 — Dada una nota de cualquier otro tipo (`ingreso_devolucion`,
      `ingreso_cambio` o cualquier `salida_*`) que traiga `unitCostCents` en una
      línea, entonces la respuesta es `400`: el costo solo existe en una compra.
- [ ] AC8 — Dado un producto con `average_cost_cents = null` y `stock = 40`,
      cuando se registra una compra de 10 unidades a `10000` céntimos, entonces
      su costo promedio queda en `10000`: el stock que ya existía se valoriza al
      precio de esa compra, no se pondera contra un costo inventado.
- [ ] AC9 — Dado un producto con `stock = 10` y costo `10000`, cuando se registra
      una compra de 10 unidades a `12000`, entonces su costo promedio queda en
      `11000`; y si la transacción de la nota revierte por cualquier motivo, el
      costo sigue en `10000`.
- [ ] AC10 — Dado un producto con `stock = -3` (sobreventa por el webhook de
      Stripe, spec 007 D-10) y costo `null`, cuando se registra una compra de 5
      unidades a `8000`, entonces el costo queda en `8000`: el stock negativo se
      trata como `0` y nunca pondera en negativo.
- [ ] AC11 — Dada una nota de `ingreso_devolucion`, `ingreso_cambio` o cualquier
      `salida_*` sobre un producto con costo registrado, entonces
      `average_cost_cents` queda **intacto**.
- [ ] AC12 — Dada una compra cuyo promedio exacto no es un número entero de
      céntimos, entonces el valor almacenado es un entero (redondeo al céntimo
      más cercano) y nunca un decimal, un `NaN` ni un error de la base.
- [ ] AC13 — Dado un `unitCostCents` igual a `0`, negativo, con decimales o mayor
      que `99_999_999`, entonces la respuesta es `400`, tanto en la nota de
      compra como en el costo inicial.
- [ ] AC14 — Dado un producto que **ya** tiene `average_cost_cents`, cuando llega
      un `POST .../initial-cost`, entonces la respuesta es `409`, el valor no
      cambia y la bitácora no registra nada; dos peticiones simultáneas sobre un
      producto sin costo resuelven una en `200` y la otra en `409`.
- [ ] AC15 — Dado un `POST .../initial-cost` sobre un id inexistente, entonces la
      respuesta es `404`; sobre un id que no es uuid, `400`.
- [ ] AC16 — Dado un `POST .../initial-cost` válido, entonces la fila se
      actualiza **y** queda `product.cost_initialized` en `audit_logs` dentro de
      la misma transacción, **sin el importe** en `changes` ni en `metadata`
      (D-10).
- [ ] AC17 — Dado un `POST` o un `PATCH /api/admin/products/[id]`, entonces
      `averageCostCents` no aparece en la respuesta ni en el `changes` de
      `product.created` / `product.updated`.
- [ ] AC18 — Dado `GET /api/admin/products`, `GET /api/admin/inventory` o
      cualquier endpoint público del catálogo, entonces el JSON **no** contiene
      `averageCostCents`.
- [ ] AC19 — Dado `GET /api/admin/inventory/documents/[id]`, entonces las líneas
      **no** publican `unitCostCents`.
- [ ] AC20 — Dado el listado de precio unitario, entonces ordena por «sin costo
      primero», luego por nombre y por id, pagina de 20 en 20 y la paginación es
      estable.
- [ ] AC21 — Dado un producto con `is_active = false`, entonces no aparece en el
      listado.
- [ ] AC22 — Dada una búsqueda, entonces filtra por nombre y por SKU, y un
      término que contiene `%` o `_` no devuelve la tabla entera.
- [ ] AC23 — Dado un producto cuyo costo supera su precio, entonces el margen es
      negativo y la UI lo comunica con signo, icono y texto además del color,
      nunca solo con color.
- [ ] AC24 — Dado un catálogo sin productos activos, o una búsqueda sin
      resultados, entonces la respuesta es `200` con `data: []` y la tabla
      muestra su estado vacío: no es un error ni un estado de carga.
- [ ] AC25 — Dada la primera carga, entonces la tabla muestra el esqueleto de
      `DataTable`; ante un fallo de red, el mensaje de error con «Reintentar».
- [ ] AC26 — Dado un costo inicial recién registrado, entonces la fila se
      actualiza sin recargar la página.
- [ ] AC27 — Dado cualquier importe del JSON de cualquiera de los endpoints
      tocados, entonces es un entero en céntimos; la división por 100 solo ocurre
      en el formateo de la vista.
- [ ] AC28 — Dado el formulario de nota de ingreso, entonces la columna de costo
      unitario aparece solo con «Ingreso por compra» seleccionado; al cambiar a
      otro tipo desaparece y los valores tecleados **no** viajan en el cuerpo.

## 5. Modelo de datos

**Requiere migración.** Dos columnas nuevas y dos `CHECK`; ninguna tabla nueva.
La migración generada será `drizzle/0009_*.sql` (verificado: el último journal es
`0008`).

### 5.1 `products.average_cost_cents`

| Columna | Tipo | Nota |
|---|---|---|
| `average_cost_cents` | `integer` **nullable** | Costo promedio ponderado vigente, en céntimos. `null` = sin costo registrado |

`CHECK (average_cost_cents IS NULL OR average_cost_cents > 0)` — tercer `CHECK`
del esquema, mismo criterio que `expenses_amount_cents_positive` y
`stock_movements_quantity_positive`: el promedio de valores positivos nunca cae
por debajo del menor de ellos, así que un `0` o un negativo en esta columna solo
puede venir de un `psql` a mano o de una migración de datos, y ninguno de los dos
pasa por Zod.

Sin índice: la columna no filtra ni ordena por sí sola. El orden del listado usa
`average_cost_cents IS NULL`, que en un catálogo de este tamaño se resuelve con
el mismo recorrido que ya hace `products_is_active_idx`. Si el catálogo creciera,
el índice parcial está anotado en §11.

```ts
// src/server/db/schema/product.ts — añadido a la tabla existente
    // Costo promedio ponderado vigente, en céntimos. **Nullable a propósito**: `null`
    // significa «sin costo registrado» y es lo que apaga el margen en la pantalla de
    // precio unitario (spec 021, AC5). Un `0` diría «me costó gratis», que es una
    // afirmación distinta y falsa. Solo lo escriben dos caminos: el recálculo de una
    // nota de `ingreso_compra` y la carga del costo inicial, que exige que esté en
    // `null` (D-4).
    averageCostCents: integer('average_cost_cents'),
```

```ts
// (t) => [ … ] de products, entrada nueva
    check(
      'products_average_cost_cents_positive',
      sql`${t.averageCostCents} is null or ${t.averageCostCents} > 0`,
    ),
```

### 5.2 `stock_movements.unit_cost_cents`

| Columna | Tipo | Nota |
|---|---|---|
| `unit_cost_cents` | `integer` **nullable** | Costo unitario pagado por esa línea. Presente solo en documentos `ingreso_compra` |

`CHECK (unit_cost_cents IS NULL OR unit_cost_cents > 0)`.

**El invariante «si el documento es `ingreso_compra` la línea lleva costo» no
puede ser un `CHECK`**, y hay que dejarlo escrito: el tipo de transacción vive en
la cabecera (`inventory_documents.transaccion_id`) y un `CHECK` de fila no puede
mirar otra tabla. Lo sostienen el `superRefine` de
`createInventoryDocumentSchema` (§6) y el propio service, que es el único camino
de escritura. La alternativa —un trigger o una FK compuesta— se descarta en D-3.

Consecuencia declarada: las líneas de `ingreso_compra` **anteriores** a la
migración se quedan en `null` para siempre. No se hace backfill (§10), y es
exactamente el hueco que cubre el costo inicial manual.

```ts
// src/server/db/schema/stock-movement.ts — añadido a la tabla existente
    // Costo unitario pagado, en céntimos. Solo lo llevan las líneas de un documento
    // `ingreso_compra`: una devolución o un cambio devuelven mercadería que ya se
    // compró a su precio, no una compra nueva (spec 021, D-2). Nullable también por
    // historia: las líneas anteriores a la migración `0009` no tienen importe y no se
    // inventa ninguno.
    unitCostCents: integer('unit_cost_cents'),
```

```ts
// (t) => [ … ] de stockMovements, entrada nueva
    check(
      'stock_movements_unit_cost_cents_positive',
      sql`${t.unitCostCents} is null or ${t.unitCostCents} > 0`,
    ),
```

### 5.3 Consecuencia en los tipos inferidos (no es opcional)

`src/modules/products/types/product.types.ts` define
`Product = InferSelectModel<typeof products>` y
`ProductWithCategory = Product & { categoryName; categorySlug }`. Verificado:
`PRODUCT_COLUMNS` de `product.repository.ts` e `INVENTORY_COLUMNS` de
`inventory.repository.ts` enumeran columnas **positivamente**, así que la nueva
columna no se publica sola —bien— pero el tipo del `select` deja de satisfacer
`ProductWithCategory` y **el typecheck rompe** en `findMany`,
`findByIdWithCategory` y `findLowStock`.

Se arregla en el tipo, no en las proyecciones:

```ts
// src/modules/products/types/product.types.ts
// `averageCostCents` queda fuera a propósito y el `Omit` es la frontera: el costo es
// dato financiero (`finance.read`) y este tipo lo consumen el listado de productos y
// el de inventario, que se abren con `products.read` / `inventory.read` —permisos que
// `manager` y `audit` sí tienen y que no incluyen finanzas (spec 021, D-8)—.
export type AdminProduct = Omit<Product, 'averageCostCents'>;

export type ProductWithCategory = AdminProduct & {
  categoryName: string;
  categorySlug: string;
};
```

`CatalogProduct` y `CatalogProductDetail` se construyen por `Pick` sobre
`Product`, así que el catálogo público no se ve afectado (verificado).

### 5.4 Catálogo de permisos

No es migración sino `npm run db:seed` (idempotente). El catálogo pasa de **26 a
27** códigos.

```ts
// src/lib/permissions.ts — una entrada nueva en PERMISSIONS
{
  code: 'pricing.set_initial_cost',
  resource: 'pricing',
  action: 'set_initial_cost',
  description: 'Cargar el costo inicial de un producto que aún no tiene costo registrado.',
},
```

| Rol | `finance.read` | `pricing.set_initial_cost` | `inventory.move` |
|---|---|---|---|
| `super_admin` | sí | **sí** | sí |
| `admin` | sí | **sí** | sí |
| `manager` | no | **no** | sí |
| `audit` | no | **no** | no |
| `employee`, `customer` | no | no | no |

Las tres columnas juntas son la separación de funciones que pide el diseño:
`manager` **anota** cuánto se pagó (`inventory.move`, sin permiso nuevo) y **no
ve** el margen resultante ni puede fijar un costo fuera de una compra.

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/pricing` | `finance.read` | query: `search?`, `page?`, `pageSize?` | `PricingListResponse` | 400, 401, 403, 500 |
| POST | `/api/admin/pricing/[id]/initial-cost` | `pricing.set_initial_cost` | body: `SetInitialCostInput` | `InitialCostSet` (200) | 400, 401, 403, 404, 409, 500 |
| POST | `/api/admin/inventory/documents` | `inventory.move` | **modificado**: cada línea admite `unitCostCents` | `InventoryDocumentDetail` (201) | 400, 401, 403, 404, 409, 500 |

`[id]` es el **id de producto**: las filas de `GET /api/admin/pricing` son
productos, así que el path espeja la fila que se está tocando, igual que
`/api/admin/expenses/[id]`. `POST` y no `PATCH`, y `200` y no `201`: no se crea
ninguna fila y la operación no es idempotente-por-repetición sino
**irrepetible** —el segundo intento es `409`, no un no-op— (D-5).

Errores con el contrato vigente: `toErrorResponse()` y `badRequest()` de
`src/lib/api-guard.ts`, cuerpo `{ message }` y `{ message, issues }`, que es lo
que espera el interceptor de `src/lib/axios.ts`.

### 6.1 Zod — nota de inventario (modificado)

```ts
// src/modules/inventory/schemas/inventory-document.schema.ts
import { MAX_PRICE_CENTS } from '@/modules/products/lib/price';

export const COST_REQUIRED_MESSAGE =
  'Una compra necesita el costo unitario de cada línea';

export const COST_NOT_ALLOWED_MESSAGE =
  'Solo una nota de ingreso por compra registra costo unitario';

export const documentItemSchema = z.object({
  productId: z.uuid('Elige un producto'),
  quantity: z
    .number()
    .int('La cantidad debe ser un número entero')
    .min(1, 'La cantidad debe ser mayor que cero')
    .max(MAX_ITEM_QUANTITY, 'La cantidad supera el máximo admitido'),
  // Opcional en la línea y condicionado en el documento: el tipo de transacción vive
  // en la cabecera, así que la regla es cruzada por naturaleza y no cabe aquí.
  unitCostCents: z
    .number()
    .int('El costo debe expresarse en céntimos enteros')
    .positive('El costo debe ser mayor que cero')
    .max(MAX_PRICE_CENTS, 'El costo supera el máximo admitido')
    .optional(),
});

export const createInventoryDocumentSchema = z
  .object({
    transaccionId: z.enum(TRANSACTION_TYPE_CODES),
    docDate: /* … sin cambios … */,
    reference: z.string().trim().max(120).optional(),
    items: z
      .array(documentItemSchema)
      .min(1, 'El documento debe tener al menos una línea')
      .max(MAX_DOCUMENT_ITEMS, `Como máximo ${MAX_DOCUMENT_ITEMS} líneas por documento`)
      .refine(hasNoDuplicates, { message: DUPLICATE_ITEM_MESSAGE }),
  })
  // `superRefine` y no `refine`: el error tiene que colgar de la línea concreta a la
  // que le falta el costo, para que el formulario lo marque donde se corrige (mismo
  // criterio que el 409 de stock, spec 020 AC5).
  .superRefine((value, ctx) => {
    const requiresCost = value.transaccionId === 'ingreso_compra';

    value.items.forEach((item, index) => {
      const hasCost = item.unitCostCents !== undefined;
      if (requiresCost === hasCost) return;

      ctx.addIssue({
        code: 'custom',
        path: ['items', index, 'unitCostCents'],
        message: requiresCost ? COST_REQUIRED_MESSAGE : COST_NOT_ALLOWED_MESSAGE,
      });
    });
  });
```

El schema del **formulario** captura el costo en soles, como el precio del
producto:

```ts
// mismo archivo — schema del formulario
export const inventoryDocumentLineSchema = z.object({
  productId: z.uuid('Elige un producto'),
  quantity: z
    .string()
    .trim()
    .regex(QUANTITY_INPUT_PATTERN, 'Usa un número entero de unidades')
    .refine((value) => Number(value) >= 1, 'La cantidad debe ser mayor que cero'),
  // Cadena vacía mientras no se teclea: el campo solo se exige —y solo se pinta—
  // cuando el tipo es `ingreso_compra` (AC28).
  unitCost: z.string().trim(),
});

export const inventoryDocumentFormSchema = z
  .object({ /* … transaccionId, docDate, reference, items … */ })
  .superRefine((value, ctx) => {
    if (value.transaccionId !== 'ingreso_compra') return;

    value.items.forEach((item, index) => {
      if (PRICE_INPUT_PATTERN.test(item.unitCost) && toCents(item.unitCost) > 0) return;

      ctx.addIssue({
        code: 'custom',
        path: ['items', index, 'unitCost'],
        message: 'Usa un importe mayor que cero, con hasta 2 decimales',
      });
    });
  });
```

### 6.2 Zod — precio unitario (nuevo)

```ts
// src/modules/finance/schemas/pricing.schema.ts
import { z } from 'zod';

import { MAX_PRICE_CENTS, PRICE_INPUT_PATTERN } from '@/modules/products/lib/price';

export const pricingQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const setInitialCostSchema = z.object({
  unitCostCents: z
    .number()
    .int('El costo debe expresarse en céntimos enteros')
    .positive('El costo debe ser mayor que cero')
    .max(MAX_PRICE_CENTS, 'El costo supera el máximo admitido'),
});

// El diálogo teclea soles, como el resto del panel.
export const initialCostFormSchema = z.object({
  unitCost: z
    .string()
    .trim()
    .regex(PRICE_INPUT_PATTERN, 'Usa hasta 2 decimales, por ejemplo 899.90')
    .refine((value) => toCents(value) > 0, 'El costo debe ser mayor que cero'),
});

export const pricingProductIdSchema = z.uuid();

export type PricingQueryParams = z.output<typeof pricingQuerySchema>;
export type SetInitialCostInput = z.output<typeof setInitialCostSchema>;
export type InitialCostFormValues = z.output<typeof initialCostFormSchema>;
```

### 6.3 Tipos de salida

```ts
// src/modules/finance/types/pricing.types.ts
export type PricingRow = {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  /** A la vista porque es lo que pondera el promedio y lo que el costo inicial valoriza. */
  stock: number;
  /** null = sin costo registrado. Nunca 0 (AC5). */
  averageCostCents: number | null;
  /** priceCents − averageCostCents. null sin costo; negativo si se vende bajo costo. */
  marginCents: number | null;
  /** (margen / precio) × 100, un decimal. null sin costo o con precio 0 (D-7). */
  marginPercent: number | null;
};

export type PricingListResponse = {
  data: PricingRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    // Resuelto en el servidor; la UI solo oculta la acción. La frontera real es el
    // 403 del POST (AC4).
    canSetInitialCost: boolean;
  };
};

// Proyección estrecha a propósito: no devuelve la fila entera del producto para no
// publicar por la puerta de atrás lo que las proyecciones de productos excluyen (D-8).
export type InitialCostSet = {
  id: string;
  sku: string;
  name: string;
  averageCostCents: number;
};
```

### 6.4 Reglas de cálculo (normativas)

**Promedio ponderado.** Con `S` = stock previo, `C` = costo promedio previo,
`q` = unidades ingresadas y `c` = costo unitario de la compra:

```
nuevo = round( ( max(S, 0) × coalesce(C, c) + q × c ) / ( max(S, 0) + q ) )
```

Tres reglas que el diseño dejaba abiertas y que aquí son normativas:

1. `coalesce(C, c)`: sin costo previo, el stock que había se valoriza al precio de
   esta compra y el resultado colapsa exactamente a `c` (AC8). La alternativa
   —valorizar solo las unidades entrantes— es imposible con un solo número por
   producto.
2. `max(S, 0)`: `products.stock` **puede ser negativo** (verificado:
   `decrementStock` del webhook de Stripe no lleva clamp, spec 007 D-10). Un
   stock negativo ponderando en el numerador daría un costo por debajo del
   pagado, y en el denominador podría anularlo. Tratarlo como `0` significa «no
   hay existencias que promediar» (AC10).
3. El denominador es siempre `> 0` porque `q ≥ 1`: **no hay división por cero
   posible**.

**Solo `ingreso_compra` mueve el promedio.** Ningún `salida_*` lo toca —el
promedio es propiedad del inventario que queda, no de lo que sale— y ni
`ingreso_devolucion` ni `ingreso_cambio` lo mueven: devuelven mercadería que ya
se compró a su precio (AC11).

**Margen.** Sobre precio de venta, no markup sobre costo:

```
marginCents   = priceCents − averageCostCents
marginPercent = redondeo1( marginCents / priceCents × 100 )
```

Sin costo → los dos en `null`. Con `priceCents = 0` —valor que
`createProductSchema` **admite** (verificado: `.min(0)`)— `marginPercent` es
`null`, nunca `Infinity`.

## 7. Arquitectura y archivos afectados

- `src/lib/permissions.ts` — `pricing.set_initial_cost` en `PERMISSIONS` (26 → 27)
  y en `ROLE_PERMISSION_MATRIX` para `super_admin` y `admin`.
- `src/server/db/schema/product.ts` — columna `average_cost_cents` + `CHECK`.
- `src/server/db/schema/stock-movement.ts` — columna `unit_cost_cents` + `CHECK`.
- `drizzle/0009_*.sql` — **nuevo**: migración generada.
- `src/modules/products/types/product.types.ts` — `AdminProduct` y
  `ProductWithCategory` sin `averageCostCents` (§5.3).
- `src/modules/products/lib/price.ts` — **nuevo export** `MAX_PRICE_CENTS`.
- `src/modules/products/schemas/product.schema.ts` — usa `MAX_PRICE_CENTS` en
  lugar de los dos literales `99_999_999`.
- `src/modules/products/lib/product-audit.ts` + `.test.ts` — **nuevo**:
  `toAuditableProduct()`, la proyección de la fila que entra en la bitácora.
- `src/app/api/admin/products/route.ts` — `changes.after` pasa por
  `toAuditableProduct()`.
- `src/app/api/admin/products/[id]/route.ts` — `changes.before` y `changes.after`
  pasan por `toAuditableProduct()`.
- `src/server/repositories/product.repository.ts` — **nuevo**:
  `buildAverageCostExpression()`, `applyPurchaseStockChange()`,
  `setInitialCost()`.
- `src/server/repositories/product.repository.test.ts` — casos nuevos de los dos
  constructores de SQL.
- `src/server/repositories/pricing.repository.ts` + `.test.ts` — **nuevo**:
  `buildPricingFilters()`, `findPricingRows()`.
- `src/server/repositories/inventory-document.repository.ts` — `unitCostCents`
  entra en `NewStockMovement` por inferencia; `findItems` **no** lo publica
  (AC19), y eso es una no-modificación deliberada.
- `src/server/services/inventory-document.service.ts` — elige mutador por línea y
  propaga `unitCostCents` al movimiento.
- `src/server/services/inventory-document.service.test.ts` — casos nuevos.
- `src/modules/inventory/schemas/inventory-document.schema.ts` + `.test.ts` —
  `unitCostCents` en la línea de API, `unitCost` en la del formulario y los dos
  `superRefine` (§6.1).
- `src/modules/inventory/components/document-lines-field.tsx` — campo de costo por
  línea, condicionado por prop.
- `src/modules/inventory/components/inventory-document-dialog.tsx` — `useWatch`
  del tipo, prop al campo de líneas y mapeo del cuerpo.
- `src/modules/finance/lib/pricing-math.ts` + `.test.ts` — **nuevo**:
  `unitMargin()`, que reutiliza `marginPercent()` de `finance-math.ts`.
- `src/modules/finance/schemas/pricing.schema.ts` + `.test.ts` — **nuevo** (§6.2).
- `src/modules/finance/types/pricing.types.ts` — **nuevo** (§6.3).
- `src/modules/finance/constants.ts` — `pricingKeys`, `PRICING_PAGE_SIZE` y los
  copys de estados vacíos, de error y del diálogo.
- `src/modules/finance/services/pricing.service.ts` — **nuevo**:
  `fetchPricing()`, `setInitialCost()`. Único punto que habla con la API.
- `src/modules/finance/hooks/use-pricing.ts` — **nuevo**.
- `src/modules/finance/hooks/use-initial-cost-mutation.ts` — **nuevo**.
- `src/modules/finance/components/pricing-columns.tsx` — **nuevo**.
- `src/modules/finance/components/initial-cost-dialog.tsx` — **nuevo**.
- `src/modules/finance/components/pricing-table.tsx` — **nuevo**: contenedor
  `"use client"`.
- `src/app/api/admin/pricing/route.ts` — **nuevo**: `GET`.
- `src/app/api/admin/pricing/[id]/initial-cost/route.ts` — **nuevo**: `POST`.
- `src/app/(admin)/admin/finance/pricing/page.tsx` — **nuevo**: Server Component
  con `requirePagePermission('finance.read')`.
- `src/app/(admin)/admin/layout.tsx` — entrada «Precio unitario» en `NAV_ITEMS`.
- `docs/SETUP.md` — §5.3 y §5.5 (columnas nuevas) y §6 (módulo construido).

Componentes shadcn: `dialog`, `field`, `input`, `button`, `badge`, `table` y
`skeleton` **ya están** en `src/components/ui/` (verificado), igual que
`DataTable` en `src/components/shared/`. No hace falta añadir ninguno.

Flujo, capa por capa, sin saltos:

```
PricingTable ("use client")
  → usePricing / useSetInitialCost (TanStack Query)
    → pricing.service (axios)
      → /api/admin/pricing · /api/admin/pricing/[id]/initial-cost  (authorize + Zod)
        → pricing.repository · product.repository (Drizzle) → Neon

InventoryDocumentDialog → useCreateInventoryDocument → inventory-document.service
  → POST /api/admin/inventory/documents → inventory-document.service (servidor)
    → product.repository.applyPurchaseStockChange (UPDATE stock + promedio)
```

### 7.1 Firmas del repositorio

```ts
// src/server/repositories/product.repository.ts — añadidos

// El promedio se recalcula **dentro del mismo UPDATE** que mueve el stock, como
// expresión sobre las columnas y no como literal calculado en TypeScript: en un UPDATE
// todas las referencias del SET ven los valores **previos** de la fila, así que
// `stock` y `average_cost_cents` de esta expresión son los de antes del ingreso, leídos
// y escritos sin ventana entre medias. Es el mismo criterio que
// `buildStockChangeExpression` (spec 020, D-7), y aquí importa más: leer, promediar en
// TypeScript y volver a escribir dejaría que dos compras simultáneas del mismo producto
// perdieran una de las dos.
//
// `::numeric` no es decorativo: el numerador llega a 1e6 unidades × 1e8 céntimos = 1e14,
// que desborda `int4` y también `float` con pérdida. El `round(...)::integer` final
// devuelve el céntimo entero que la columna acepta. Exportada para compilarla con
// `PgDialect` en el test, igual que los otros constructores.
export function buildAverageCostExpression(quantity: number, unitCostCents: number): SQL;

export type PurchaseStockChange = {
  productId: string;
  quantity: number;
  unitCostCents: number;
};

// Sin guard de stock en el WHERE: una compra es un ingreso y un ingreso nunca se queda
// sin existencias. Devuelve `null` solo si el producto no existe, caso que el service ya
// descartó antes de escribir. Función aparte y no un parámetro opcional de
// `applyStockChange`: los otros cinco tipos de transacción no tienen costo y meter un
// `if` dentro del mutador compartido haría que el camino de la venta cargara con la
// aritmética del promedio (CLAUDE.md §6).
export async function applyPurchaseStockChange(
  tx: Tx,
  change: PurchaseStockChange,
): Promise<{ stock: number; averageCostCents: number | null } | null>;

// El guard `average_cost_cents IS NULL` va **dentro del WHERE**, no en un `if` previo:
// es lo único que impide que dos peticiones simultáneas fijen dos costos iniciales
// distintos sobre el mismo producto (AC14). `null` significa «no se escribió»; el
// handler distingue 404 de 409 releyendo con el mismo `tx`.
export async function setInitialCost(
  tx: Tx,
  values: { productId: string; unitCostCents: number },
): Promise<{ averageCostCents: number | null } | null>;
```

```ts
// src/server/repositories/pricing.repository.ts — nuevo

// **Única proyección del repositorio que publica `average_cost_cents`**, y vive en su
// propio archivo justamente por eso: si esta consulta compartiera `PRODUCT_COLUMNS` con
// el listado de productos y el de inventario, añadir el costo allí para reutilizarlo
// sería un cambio de una línea que se lo entregaría a `products.read` e
// `inventory.read` —permisos que `manager` y `audit` tienen y que no incluyen finanzas—
// (D-8). El margen lo deriva el servidor con `unitMargin()`, para que dos columnas de la
// misma fila no puedan discrepar (mismo criterio que `resolveStockStatus`, spec 016 D-9).
export function buildPricingFilters(params: Pick<PricingQueryParams, 'search'>): SQL;

export async function findPricingRows(
  params: PricingQueryParams,
  reader?: Reader,
): Promise<{ data: PricingRow[]; total: number }>;
```

### 7.2 Forma del handler del costo inicial

```ts
// src/app/api/admin/pricing/[id]/initial-cost/route.ts
type Outcome =
  | { kind: 'ok'; product: InitialCostSet }
  | { kind: 'not-found' }
  | { kind: 'already-set' };

export async function POST(request: Request, context: Context) {
  try {
    const { actor } = await authorize('pricing.set_initial_cost');

    const { id } = await context.params;
    const parsedId = pricingProductIdSchema.safeParse(id);
    if (!parsedId.success) return badRequest(INVALID_ID_MESSAGE);

    const body = await parseJsonBody(request, setInitialCostSchema, 'Costo inválido');
    if (!body.ok) return body.response;

    const outcome = await db.transaction(async (tx): Promise<Outcome> => {
      // Con el `tx`: distingue «no existe» de «ya tiene costo» viendo el mismo estado
      // sobre el que corre el UPDATE.
      const before = await productRepository.findById(parsedId.data, tx);
      if (!before) return { kind: 'not-found' };

      const updated = await productRepository.setInitialCost(tx, {
        productId: parsedId.data,
        unitCostCents: body.data.unitCostCents,
      });
      // `null` con el producto existiendo solo puede ser el guard `IS NULL` del WHERE.
      if (!updated) return { kind: 'already-set' };

      await logAudit(tx, {
        actorId: actor.id,
        action: 'product.cost_initialized',
        entityType: 'product',
        entityId: before.id,
        // `warning`: es irrepetible por diseño y no queda registrada en ninguna otra
        // tabla, a diferencia del costo de una compra, que vive en `stock_movements`.
        severity: 'warning',
        // **Sin el importe, ni aquí ni en `metadata`** (D-10): `audit` lee la bitácora
        // y no tiene `finance.read`.
        metadata: { sku: before.sku },
        context: getAuditContext(request),
      });

      return {
        kind: 'ok',
        product: {
          id: before.id,
          sku: before.sku,
          name: before.name,
          averageCostCents: body.data.unitCostCents,
        },
      };
    });

    if (outcome.kind === 'not-found') return NextResponse.json(NOT_FOUND, { status: 404 });
    if (outcome.kind === 'already-set') {
      return NextResponse.json({ message: COST_ALREADY_SET_MESSAGE }, { status: 409 });
    }

    return NextResponse.json(outcome.product);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/admin/pricing/[id]/initial-cost',
      fallback: 'No se pudo registrar el costo inicial',
    });
  }
}
```

Sin service dedicado: la operación cruza **un** repositorio y la bitácora, que es
el caso del `PATCH` de productos, no el de la nota de inventario —que cruza tres
y por eso tiene service (spec 020, D-12)—.

### 7.3 Cambio en el service de la nota

```ts
// src/server/services/inventory-document.service.ts — dentro del bucle de líneas
      // Una rama y dos funciones con nombre, en vez de un mutador con un parámetro
      // opcional: la compra es el único tipo que además de mover stock recalcula un
      // promedio, y `unitCostCents` solo puede venir presente si Zod validó que el
      // documento es `ingreso_compra` (§6.1).
      const applied =
        item.unitCostCents === undefined
          ? await productRepository.applyStockChange(tx, {
              productId: item.productId,
              delta: sign * item.quantity,
            })
          : await productRepository.applyPurchaseStockChange(tx, {
              productId: item.productId,
              quantity: item.quantity,
              unitCostCents: item.unitCostCents,
            });

      if (!applied) { /* … 409 de stock, sin cambios … */ }

      movements.push({
        productId: item.productId,
        quantity: item.quantity,
        stockAfter: applied.stock,
        unitCostCents: item.unitCostCents ?? null,
      });
```

La entrada de bitácora del documento **no cambia**: sigue registrando número,
tipo, fecha y nº de líneas, sin importes (spec 020, D-19). El costo vive en
`stock_movements`, que es permanente, y publicarlo en un log que `audit` lee
sería la misma fuga que D-10.

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1**: Costo **promedio ponderado** en una columna de `products` | FIFO o costeo por lote, con una tabla de lotes (`purchase_lots`) y consumo por antigüedad | Decisión cerrada con el usuario en el brainstorming. El promedio ponderado responde «cuánto me cuesta hoy una unidad» con un entero por producto y sin tabla nueva; FIFO exige lotes, consumo de lotes en cada venta y reconstrucción cuando una venta se cancela, y además el webhook de Stripe **no** escribe hoy en `stock_movements` (spec 020, D-13), así que ni siquiera hay un evento fiable del que colgar el consumo del lote. FIFO sería construir la mitad de un ERP para afinar un número que todavía nadie usa en un estado de resultados |
| **D-2**: Solo `ingreso_compra` mueve el promedio | Recalcular en los tres tipos de ingreso; o recalcular también en las salidas | `ingreso_devolucion` e `ingreso_cambio` devuelven mercadería que ya se compró a su precio: tratarlas como compra obligaría a inventar un costo y lo diluiría. Ninguna salida lo toca porque el promedio es una propiedad del inventario que **queda**, no de lo que sale, y restar la unidad vendida al promedio no cambia el promedio de las que siguen en almacén. Los tres códigos excluidos se validan por nombre del tipo y no por dirección: `ingreso` incluye los tres |
| **D-3**: El invariante «compra ⇒ línea con costo» se sostiene en Zod (`superRefine`) y en el service | Un `CHECK` de fila, un trigger de Postgres, o exigir el costo siempre y poner `0` en los tipos que no lo tienen | El `CHECK` es **imposible**: el tipo de transacción está en la cabecera y un `CHECK` no lee otra tabla. Un trigger metería lógica de negocio en un sitio que ningún test del repo cubre y que nadie mira al leer el service. Poner `0` sería afirmar «me costó gratis», que es exactamente lo que la nulabilidad de `average_cost_cents` existe para evitar. El `superRefine` cuelga el error de `items[i].unitCostCents`, así que el formulario lo marca en la línea que hay que corregir |
| **D-4**: El costo inicial se escribe en la **misma** columna `average_cost_cents`, con el guard `IS NULL` en el WHERE | Una tabla `initial_costs`, o una columna `initial_cost_cents` separada | No hay dos conceptos: hay un costo promedio vigente, y su primer valor puede venir de una carga manual o de una compra. Una segunda columna obligaría a que cada lectura decidiera cuál de las dos mirar —la clase de bug que se olvida en la tercera consulta—. El guard dentro del WHERE, y no un `if` previo, es lo que hace imposible que dos peticiones simultáneas fijen dos costos distintos, igual que el guard de stock del spec 020 (D-7) |
| **D-5**: `POST /api/admin/pricing/[id]/initial-cost` devolviendo `200`, y `409` al repetir | `PATCH /api/admin/products/[id]` con `averageCostCents` en el cuerpo | El `PATCH` de productos se autoriza con `products.update`, que tienen `manager` y `admin`: colar el costo por ahí lo pondría al alcance de un permiso de catálogo y, peor, **permitiría reescribirlo**, que es justo lo que este spec prohíbe. Un endpoint propio lleva su permiso propio, su guard de unicidad y su 409, y su ruta cuelga de `pricing` porque `[id]` es la fila del listado de precio unitario. `200` y no `201`: no nace ninguna fila |
| **D-6**: `pricing.set_initial_cost` es un permiso nuevo; registrar el costo dentro de una compra **no** lo es | Un único permiso para las dos cosas; o ningún permiso nuevo, reutilizando `finance.read` | Son dos actos distintos. Anotar lo que se pagó en una factura es captura de almacén y ya está cubierta por `inventory.move`, que `manager` tiene: el encargado anota el importe sin ver el margen que produce. Fijar un costo **fuera** de cualquier compra es afirmar un dato financiero sin comprobante detrás, es irreversible y solo lo pueden hacer `super_admin` y `admin`, mismo criterio que el resto de finanzas (spec 017, D-3). Reutilizar `finance.read` para escribir rompería la separación read/write del catálogo entero |
| **D-7**: Se reutiliza `marginPercent()` de `finance-math.ts`; `unitMargin()` solo compone | Un `pricingMarginPercent()` propio del sub-módulo | Verificado: la firma es `marginPercent(base, parte)` con la guarda `base === 0 → null`, y el margen unitario es `marginPercent(priceCents, priceCents − costo)` sin adaptación ninguna. Un segundo cálculo de porcentaje sería la tercera copia que redondea distinto, y la guarda del cero es lo que salva el caso real de `price_cents = 0`, que `createProductSchema` admite (verificado, `.min(0)`) |
| **D-8**: `average_cost_cents` **fuera** de `ProductWithCategory` (vía `Omit`) y de toda proyección de productos e inventario; lectura solo en `pricing.repository.ts` | Añadir la columna a `PRODUCT_COLUMNS` y reutilizar el listado de productos para la pantalla de precio unitario | `manager` y `audit` tienen `products.read` e `inventory.read` y **no** tienen `finance.read`: el spec 017 (D-3) los dejó fuera del módulo financiero a propósito. Publicar el costo en el listado de productos se lo devolvería por un camino lateral. El `Omit` no es documentación, es la barrera que rompe el typecheck si alguien añade la columna a la proyección; y tener la única proyección que sí publica el costo en su propio archivo hace que reutilizarla por error sea imposible en vez de improbable |
| **D-9**: `toAuditableProduct()` retira `averageCostCents` del `changes` de `product.created` y `product.updated` | Dejar la bitácora tal cual: hoy registra la fila completa | Verificado en el código: `product.updated` escribe `changes: { before, after }` con las filas **enteras** (`findById` hace `select()` a secas y `update()` devuelve `returning()` completo). En cuanto exista la columna, cualquier edición de producto copiaría el costo a `audit_logs`, que `audit` lee con `audit_logs.read` **sin** tener `finance.read`. Es exactamente la puerta trasera que el spec 018 (D-4, D-8) documentó para los salarios, y el propio comentario del rol `audit` en `permissions.ts` advierte de ella. Además `PATCH` nunca modifica esa columna, así que en el `changes` era ruido |
| **D-10**: La bitácora del costo inicial registra **qué** producto y **quién**, nunca el importe | `changes: { before: { averageCostCents: null }, after: { averageCostCents: 1200 } }`, que es la forma habitual del resto del panel | Mismo motivo que D-9 y misma fuga: el importe en `changes` convierte `/admin/audit-logs` en la lista de costos de compra para un rol al que se le acaba de negar la pantalla. La trazabilidad que hace falta —quién fijó el costo de qué producto y cuándo— se conserva íntegra con `entityId` y `metadata.sku`; el valor vigente se consulta donde vive, en la pantalla que exige `finance.read`. `severity: 'warning'` y no `info` porque es irrepetible y no queda registrada en ninguna otra tabla |
| **D-11**: El costo unitario de la línea es **de solo escritura** en este spec: `findItems` sigue sin publicarlo | Añadirlo a `InventoryDocumentItemRow` para verlo en el detalle del documento | El detalle del documento se abre con `inventory.read`, que tienen `manager` y `audit`. Publicar el costo ahí sería la tercera versión de la misma fuga (D-8, D-9). Verificado: `findItems` enumera columnas positivamente, así que la columna nueva no se publica sola y no hay que quitar nada. Leer el costo por línea es kardex valorizado y está fuera de alcance; cuando entre, entrará con su propio permiso y su propia proyección |
| **D-12**: El costo se registra tal y como se pagó, sin decidir si incluye IGV | Capturar base imponible e IGV por separado en cada línea de compra | Era el punto que el brainstorming dejó abierto. Desagregar el IGV solo sirve para el crédito fiscal, que necesita el RUC del proveedor y el número de comprobante —sub-proyecto #2, Egresos v2— y una liquidación que los cruce —#4, Impuestos—. Capturar hoy dos importes por línea para alimentar un cálculo que no existe es inventar el formato antes de saber quién lo consume. El importe único es además el que aparece en la factura, que es lo que la persona tiene delante al teclear |
| **D-13**: Una página nueva `/admin/finance/pricing` con su entrada en `NAV_ITEMS` | Una pestaña dentro de `/admin/finance`, como hizo inventario (spec 020, D-20) | Decisión de ruta cerrada con el usuario. Las dos pestañas de inventario son dos vistas del **mismo** corte de datos; aquí el resumen financiero se mira por rango de fechas y el precio unitario es un estado actual del catálogo, sin fechas: meterlos en la misma página obligaría a que el filtro de rango de arriba no significara nada en una de las dos pestañas. La navegación del panel es plana por convención y las dos entradas comparten `finance.read`, así que aparecen y desaparecen juntas |
| **D-14**: Orden fijo «sin costo primero, luego por nombre, luego por id»; sin `sortBy` | Ordenar por margen ascendente, o permitir ordenar por cualquier columna | La pantalla existe para responder «qué margen deja cada producto», y lo primero que hay que resolver para responderla es el producto al que le falta el costo: ponerlos arriba pone la acción donde está el problema, mismo criterio que el orden por urgencia del spec 016 (D-8). Ordenar por margen en SQL exige un `NULLIF(price_cents, 0)` para no dividir por cero y un criterio para los `null`, y es una complicación que nadie ha pedido todavía (§11). El `id` cierra el desempate: sin él la paginación repite filas |
| **D-15**: `MAX_PRICE_CENTS` se extrae a `src/modules/products/lib/price.ts` | Un literal `99_999_999` en cada schema nuevo | El literal ya está **dos** veces en `product.schema.ts` (`priceCents` y `compareAtPriceCents`) y este spec añadiría dos usos más en dos módulos distintos: es la tercera repetición que la regla DRY del proyecto fija como umbral (CLAUDE.md §6). `price.ts` es el sitio donde ya viven `PRICE_INPUT_PATTERN`, `toCents` y `formatPrice`, y es de donde finanzas ya importa (spec 017, D-19), así que no se crea ninguna dependencia nueva entre módulos |
| **D-16**: Sin `refetchInterval`; el refresco es el de TanStack Query al volver a la pestaña | Polling, como el dashboard | El costo de un producto cambia cuando llega una compra, es decir, cuando alguien teclea una nota, no de minuto a minuto. Mismo criterio que el resto del módulo financiero (spec 017, D-20) y que la página de inventario |

## 9. Tareas

Cada tarea toca una sola capa y se cierra con su verificación. El orden es el de
dependencia: permisos → esquema → tipos → migración → validación → repositorio →
service → handlers → módulo → UI → documentación.

- [x] **T1** — Añadir `pricing.set_initial_cost` a `PERMISSIONS` (26 → 27
      entradas) y concederlo **solo** a `super_admin` y `admin` en
      `ROLE_PERMISSION_MATRIX`, con el comentario de por qué registrar el costo
      en una compra no necesita permiso nuevo (D-6) · archivo:
      `src/lib/permissions.ts` · verificación: `npm run typecheck && npm test`
- [x] **T2** — Columna `average_cost_cents` y su `CHECK` en `products` según §5.1
      · archivo: `src/server/db/schema/product.ts` · verificación:
      `npm run typecheck` (debe **romper** en los dos repositorios por §5.3; lo
      arregla T4)
- [x] **T3** — Columna `unit_cost_cents` y su `CHECK` en `stock_movements` según
      §5.2, con el comentario de por qué el invariante cruzado no puede ser un
      `CHECK` · archivo: `src/server/db/schema/stock-movement.ts` ·
      verificación: `npm run typecheck`
- [x] **T4** — `AdminProduct = Omit<Product, 'averageCostCents'>` y
      `ProductWithCategory` derivado de él, con el comentario de D-8 · archivo:
      `src/modules/products/types/product.types.ts` · verificación:
      `npm run typecheck` en verde, y comprobar a ojo que `PRODUCT_COLUMNS`,
      `INVENTORY_COLUMNS` y las proyecciones públicas siguen sin la columna
- [x] **T5** — Generar la migración y leer el SQL antes de aplicarlo: debe añadir
      **dos columnas nullable y dos CHECK**, y nada más —ningún `NOT NULL`,
      ningún `DEFAULT`, ninguna otra tabla— · comandos: `npm run db:generate` y
      `npm run db:migrate` · verificación: el archivo `drizzle/0009_*.sql` leído
      + `npm run db:studio` mostrando las dos columnas en `null`
- [x] **T6** — Ejecutar el seed y comprobar que el catálogo queda en 27 permisos y
      que solo `super_admin` y `admin` resuelven `pricing.set_initial_cost` ·
      comando: `npm run db:seed` · verificación: salida del seed +
      `npm run db:studio`
- [x] **T7** — Exportar `MAX_PRICE_CENTS = 99_999_999` y sustituir los dos
      literales de `product.schema.ts` por la constante (D-15) · archivos:
      `src/modules/products/lib/price.ts`,
      `src/modules/products/schemas/product.schema.ts` · verificación:
      `npm run typecheck && npm test` (los casos existentes de `99_999_999` y
      `100_000_000` deben seguir pasando sin tocarlos)
- [x] **T8** — `unitCostCents` opcional en `documentItemSchema` y el
      `superRefine` cruzado de `createInventoryDocumentSchema` según §6.1, con
      `COST_REQUIRED_MESSAGE` y `COST_NOT_ALLOWED_MESSAGE` · archivo:
      `src/modules/inventory/schemas/inventory-document.schema.ts` ·
      verificación: `npm run typecheck`
- [x] **T9** — `unitCost` en `inventoryDocumentLineSchema` y el `superRefine`
      condicionado de `inventoryDocumentFormSchema` según §6.1 · archivo:
      `src/modules/inventory/schemas/inventory-document.schema.ts` ·
      verificación: `npm run typecheck`
- [x] **T10** — Tests de los dos schemas: `ingreso_compra` sin costo en una de
      dos líneas → error con `path` en `items.1.unitCostCents` (AC6);
      `ingreso_compra` con costo en todas → válido; `ingreso_devolucion`,
      `ingreso_cambio` y `salida_venta` con costo → error (AC7); los mismos sin
      costo → válidos; `unitCostCents` en `0`, `-1`, `10.5` y `100_000_000` →
      error (AC13); formulario con tipo `ingreso_compra` y `unitCost` vacío o
      `'abc'` → error en la línea; formulario con otro tipo y `unitCost` vacío →
      válido · archivo:
      `src/modules/inventory/schemas/inventory-document.schema.test.ts` ·
      verificación: `npm test`
- [x] **T11** — `buildAverageCostExpression()`, `applyPurchaseStockChange()` y
      `setInitialCost()` según §7.1, con la fórmula de §6.4 en `numeric` y el
      `round(...)::integer` · archivo:
      `src/server/repositories/product.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T12** — Tests de los constructores de SQL compilando con `PgDialect`,
      igual que los de `buildStockChangeFilter`: la expresión del promedio
      contiene `greatest`, `coalesce` y el casteo a `numeric`; los parámetros
      salen en el orden esperado; el WHERE de `setInitialCost` lleva
      `average_cost_cents is null` **además** del `id` · archivo:
      `src/server/repositories/product.repository.test.ts` · verificación:
      `npm test`
- [x] **T13** — Verificación manual de la aritmética del promedio, que ningún
      test unitario cubre porque vive en SQL (§10): en `db:studio`, sobre un
      producto de prueba, comprobar los cuatro casos de AC8, AC9, AC10 y AC12
      registrando notas reales desde la API · verificación: los cuatro valores
      leídos en `products.average_cost_cents`
- [x] **T14** — Rama por línea hacia `applyPurchaseStockChange` y
      `unitCostCents` en el movimiento insertado, según §7.3 · archivo:
      `src/server/services/inventory-document.service.ts` · verificación:
      `npm run typecheck`
- [x] **T15** — Tests del service: una nota `ingreso_compra` llama a
      `applyPurchaseStockChange` con `{ quantity, unitCostCents }` y **no** a
      `applyStockChange`; una nota `ingreso_devolucion` llama a
      `applyStockChange` y nunca al mutador de compra (AC11); el movimiento
      insertado lleva `unitCostCents` en la compra y `null` en el resto; la
      entrada de bitácora del documento sigue **sin** importes · archivo:
      `src/server/services/inventory-document.service.test.ts` · verificación:
      `npm test`
- [x] **T16** — `toAuditableProduct()`: recibe la fila de producto y devuelve la
      misma sin `averageCostCents` (D-9) · archivo:
      `src/modules/products/lib/product-audit.ts` · verificación:
      `npm run typecheck`
- [x] **T17** — Test de `toAuditableProduct()`: la clave `averageCostCents` no
      está en el resultado ni con valor ni como `undefined` propio, y el resto de
      campos se conserva idéntico · archivo:
      `src/modules/products/lib/product-audit.test.ts` · verificación: `npm test`
- [x] **T18** — Pasar `changes.after` por `toAuditableProduct()` en el `POST` y
      `changes.before` / `changes.after` en el `PATCH` (AC17) · archivos:
      `src/app/api/admin/products/route.ts`,
      `src/app/api/admin/products/[id]/route.ts` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T19** — `unitMargin(priceCents, averageCostCents)` según §6.4,
      reutilizando `marginPercent()` (D-7) · archivo:
      `src/modules/finance/lib/pricing-math.ts` · verificación:
      `npm run typecheck`
- [x] **T20** — Tests de `unitMargin`: costo `null` → los dos campos `null`
      (AC5); margen positivo; margen exactamente 0 (costo = precio); margen
      negativo (costo > precio, AC23); `priceCents = 0` con costo > 0 →
      `marginCents` negativo y `marginPercent` `null`; redondeo a un decimal; y
      que ningún caso devuelve `NaN` ni `Infinity` · archivo:
      `src/modules/finance/lib/pricing-math.test.ts` · verificación: `npm test`
- [x] **T21** — `pricingQuerySchema`, `setInitialCostSchema`,
      `initialCostFormSchema` y `pricingProductIdSchema` según §6.2 · archivo:
      `src/modules/finance/schemas/pricing.schema.ts` · verificación:
      `npm run typecheck`
- [x] **T22** — Tests de los schemas: query vacía → `{ page: 1, pageSize: 20 }`
      sin `search`; `page = 0` y `pageSize = 500` → error; `search` de 200
      caracteres → error; `unitCostCents` en `0`, `-1`, `10.5` y
      `100_000_000` → error (AC13); `initialCostFormSchema` con `'0'`, `'0.00'`,
      `'abc'` y `'1.234'` → error, con `'899.90'` → válido · archivo:
      `src/modules/finance/schemas/pricing.schema.test.ts` · verificación:
      `npm test`
- [x] **T23** — Tipos `PricingRow`, `PricingListResponse` e `InitialCostSet`
      según §6.3 · archivo: `src/modules/finance/types/pricing.types.ts` ·
      verificación: `npm run typecheck`
- [x] **T24** — `buildPricingFilters()` y `findPricingRows()` según §7.1: solo
      `is_active = true`, búsqueda por nombre y SKU con `escapeLikePattern`,
      orden `average_cost_cents is null desc, name asc, id asc`, conteo en
      paralelo y margen derivado con `unitMargin()` · archivo:
      `src/server/repositories/pricing.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T25** — Tests de `buildPricingFilters` compilando con `PgDialect`: el
      WHERE lleva siempre `is_active = true` (AC21); sin `search` no añade
      ninguna condición más; con `search` añade el `or(name, sku)`; un `search`
      con `%` viaja escapado (AC22) · archivo:
      `src/server/repositories/pricing.repository.test.ts` · verificación:
      `npm test`
- [x] **T26** — `GET /api/admin/pricing`: `authorize('finance.read')` en la
      primera línea, `safeParse` de la query, `meta.canSetInitialCost` resuelto
      con `can(granted, 'pricing.set_initial_cost')` y `200` con `data: []`
      cuando no hay filas (AC2, AC4, AC24) · archivo:
      `src/app/api/admin/pricing/route.ts` · verificación: `npm run typecheck` +
      prueba manual con y sin permiso
- [x] **T27** — `POST /api/admin/pricing/[id]/initial-cost` según §7.2, con la
      unión `Outcome`, el `409` y la bitácora sin importe · archivo:
      `src/app/api/admin/pricing/[id]/initial-cost/route.ts` · verificación:
      `npm run typecheck` + prueba manual de los cuatro caminos (200, 404, 409 y
      403)
- [x] **T28** — `pricingKeys`, `PRICING_PAGE_SIZE` y los copys: sin costo, tabla
      vacía, sin resultados, error de carga y el aviso irreversible del diálogo ·
      archivo: `src/modules/finance/constants.ts` · verificación:
      `npm run typecheck`
- [x] **T29** — `fetchPricing()` y `setInitialCost()` con `api` de
      `@/lib/axios`; único punto del módulo que habla con esta API · archivo:
      `src/modules/finance/services/pricing.service.ts` · verificación:
      `npm run typecheck`
- [x] **T30** — `usePricing(params)` con `placeholderData: keepPreviousData`,
      igual que `useExpenses` · archivo:
      `src/modules/finance/hooks/use-pricing.ts` · verificación:
      `npm run typecheck`
- [x] **T31** — `useSetInitialCost()` invalidando `pricingKeys.lists()` al
      terminar (AC26) · archivo:
      `src/modules/finance/hooks/use-initial-cost-mutation.ts` · verificación:
      `npm run typecheck`
- [x] **T32** — Columnas de la tabla: producto (nombre + SKU), precio, stock,
      costo promedio o «Sin costo registrado», margen S/ y margen %, y la acción
      «Establecer costo inicial» visible solo sin costo y con permiso; el margen
      negativo con signo, icono y texto (AC5, AC23) · archivo:
      `src/modules/finance/components/pricing-columns.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T33** — Diálogo del costo inicial: `initialCostFormSchema`, importe en
      soles con `toCents`, el stock actual a la vista para que se entienda qué se
      está valorizando, y el aviso de que **no se puede editar después** ·
      archivo: `src/modules/finance/components/initial-cost-dialog.tsx` ·
      verificación: `npm run typecheck && npm run lint`
- [x] **T34** — Tabla contenedora `"use client"` con `DataTable`, búsqueda con
      `useDebounce`, paginación, estados de carga, vacío, sin resultados y error
      con «Reintentar» (AC24, AC25) · archivo:
      `src/modules/finance/components/pricing-table.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T35** — Página `/admin/finance/pricing`: Server Component con
      `requirePagePermission('finance.read')`, `metadata` y un encabezado que
      diga qué es el número —promedio ponderado de las compras registradas, no
      costo del lote vendido— · archivo:
      `src/app/(admin)/admin/finance/pricing/page.tsx` · verificación:
      `npm run build` + `403` con `manager` (AC3)
- [x] **T36** — Entrada «Precio unitario» en `NAV_ITEMS`, detrás de «Finanzas»,
      con `permission: 'finance.read'` y un icono libre (`Percent`) ·
      archivo: `src/app/(admin)/admin/layout.tsx` · verificación: la navegación
      con `admin` la muestra y con `manager` no (AC3)
- [x] **T37** — Campo de costo unitario por línea, renderizado solo cuando la
      prop `requiresCost` es `true`, con `aria-label` por producto y su
      `FieldError` (AC28) · archivo:
      `src/modules/inventory/components/document-lines-field.tsx` ·
      verificación: `npm run typecheck && npm run lint`
- [x] **T38** — `useWatch` del tipo de transacción en el diálogo, prop
      `requiresCost` al campo de líneas, `unitCost: ''` en el `append` de la
      línea nueva y mapeo del cuerpo que **solo** incluye `unitCostCents` cuando
      el tipo es `ingreso_compra` (AC28) · archivo:
      `src/modules/inventory/components/inventory-document-dialog.tsx` ·
      verificación: `npm run typecheck && npm run lint` + prueba manual
      cambiando de tipo con costos ya tecleados
- [x] **T39** — Documentar en `docs/SETUP.md`: las dos columnas en §5.3 y §5.5
      —con la fórmula, el `max(S,0)`, el `coalesce` y por qué el invariante
      cruzado no es un `CHECK`—, el permiso nuevo (26 → 27) y la página nueva en
      §6, incluida la nota de que el costo **no** entra todavía en el resultado
      del spec 017 · archivo: `docs/SETUP.md` · verificación: lectura
- [x] **T40** — Cierre: `npm run typecheck && npm run lint && npm run build &&
      npm test` en verde y repaso de los 28 criterios de aceptación,
      comprobando uno a uno los cuatro de no-fuga (AC17, AC18, AC19 y AC16) con
      una petición real a cada endpoint · verificación: la salida de los cuatro
      comandos y las respuestas leídas

## 10. Riesgos y consideraciones

**La aritmética del promedio vive en SQL y ningún test unitario la ejecuta.** Es
el riesgo principal. Se acepta a cambio de la atomicidad —un solo `UPDATE` que
lee y escribe la fila sin ventana entre medias, D-1 y spec 020 D-7— y se mitiga
con tres cosas: el test que compila la expresión y fija su forma (T12), la
verificación manual de los cuatro casos numéricos de AC8–AC12 contra la base
real (T13), y que la fórmula esté escrita en §6.4 como contrato. Si en algún
momento el proyecto añade tests de integración con base de datos, estos cuatro
casos son los primeros que deben migrarse allí.

**Deriva por redondeo.** El promedio se almacena redondeado al céntimo, así que
una cadena larga de compras acumula un error de fracciones de céntimo. Con
importes en soles y catálogos de este tamaño es despreciable, y la alternativa
—`numeric(12,4)`— rompería la regla de céntimos enteros de todo el proyecto
(CLAUDE.md §6). Queda anotado para el día en que alguien concilie el costo total
del inventario contra la contabilidad.

**El promedio no se puede deshacer.** Las notas de inventario no se editan, no se
borran y no se anulan (spec 020, D-9), así que una compra con el costo mal
teclado deja el promedio contaminado y el único camino de corrección es otra
compra que lo vuelva a mover. No hay reversión y no la habrá en este spec: el
aviso tiene que estar en el diálogo de la nota, no solo en este documento.

**Sobreventa y stock negativo.** `products.stock` puede ser negativo por el
webhook de Stripe (verificado, spec 007 D-10) y el `max(S, 0)` de la fórmula lo
neutraliza. Lo que no arregla es que, tras una sobreventa, el promedio se
recalcula como si el almacén estuviera vacío; es el comportamiento correcto para
el dato, pero conviene saberlo antes de investigar un valor «raro».

**El costo no reconstruye el costo de ventas.** `sum(stock_movements)` ya no
reconstruye el stock porque el webhook no escribe movimientos (spec 020, D-13), y
por la misma razón el costo promedio de hoy **no** sirve para valorar lo que se
vendió ayer: el margen de esta pantalla es el margen **potencial** de la próxima
venta, no el realizado. El encabezado de la página tiene que decirlo, igual que
`/admin/finance` dice que su neto no es utilidad contable.

**Fuga de datos financieros por caminos laterales.** Tres decisiones de este spec
(D-8, D-9, D-10) existen solo para cerrarla, y las tres nacen del mismo hecho
verificado: `audit` tiene `audit_logs.read`, `manager` y `audit` tienen
`products.read` e `inventory.read`, y **ninguno de los dos tiene
`finance.read`**. Cualquier cambio futuro que añada `averageCostCents` a una
proyección de productos, a un `changes` de bitácora o a la línea del documento
reabre la puerta. Los AC17–AC19 están escritos para que la revisión lo compruebe
en la respuesta, no en el código.

*Inexactitud verificada de paso, que este spec no corrige:* el comentario del rol
`audit` en `src/lib/permissions.ts` afirma que «`audit` y `manager` sí tienen
`audit_logs.read`», pero la matriz real no concede `audit_logs.read` a
`manager`. El razonamiento del comentario sigue siendo válido para `audit`, que
es el rol del que habla. Se deja constancia aquí y no se toca: corregir un
comentario ajeno dentro de este spec confundiría el diff.

**Rendimiento.** `average_cost_cents IS NULL` en el `ORDER BY` no usa índice; con
un catálogo de cientos de productos activos y paginación de 20 es un `sort` sobre
un conjunto ya filtrado por `is_active`. El índice parcial está en §11. No hay
N+1: el listado es una consulta más el conteo, en paralelo, y el margen se deriva
en memoria sobre las filas de la página.

**Concurrencia.** Dos compras simultáneas del mismo producto se serializan por el
bloqueo de fila del `UPDATE`, y las líneas se siguen aplicando ordenadas por
`productId` para no provocar deadlocks (spec 020, D-18). Dos costos iniciales
simultáneos los resuelve el guard `IS NULL` del WHERE: uno gana, el otro recibe
`409`.

**Migración y datos existentes.** Las dos columnas entran `nullable` y sin
`DEFAULT`, así que la migración no reescribe ninguna fila y el rollback es un
`DROP COLUMN`. Todos los productos arrancan sin costo y todas las líneas
históricas sin importe: **no hay backfill**, ni un promedio inventado a partir
del precio de venta. Esa es la razón de existir del costo inicial manual, y
también significa que la pantalla arranca con todas sus filas en «Sin costo
registrado», que es honesto y no un error.

## 11. Fuera de alcance / deuda aceptada

- **Costo de ventas y utilidad bruta real.** Necesita congelar el costo en
  `order_items` y recalcular el resultado del spec 017. Es el sub-proyecto #5
  (Ganancias v2) y se retoma cuando este costo lleve unos meses alimentándose de
  compras reales: antes, el número saldría de un promedio que casi todos los
  productos no tienen.
- **IGV del costo.** D-12. Se retoma con Egresos v2 (#2) e Impuestos (#4), que
  son quienes necesitan la base imponible separada.
- **Valorización del inventario** (`sum(stock × average_cost_cents)`) como cifra
  de la pantalla y como línea del balance. Un `SUM` más cuando alguien lo pida;
  hoy no hay balance donde ponerlo.
- **Orden por margen y filtro por categoría** en la tabla (D-14). Se añaden
  cuando el catálogo tenga costo en la mayoría de sus filas y el orden por nombre
  deje de servir; el `NULLIF(price_cents, 0)` del `ORDER BY` está anotado aquí
  para no volver a razonarlo.
- **Índice parcial** `create index products_without_cost_idx on products (name)
  where average_cost_cents is null` — se añade si el listado se nota lento, no
  antes.
- **Historial del costo.** Hoy `products.average_cost_cents` solo guarda el valor
  vigente; la serie se puede reconstruir a mano desde
  `stock_movements.unit_cost_cents`, pero no hay pantalla que lo haga. Una
  columna `cost_updated_at` o una tabla de historial son la forma natural de
  cerrarlo cuando alguien pregunte «¿desde cuándo me cuesta esto?».
- **Corrección del costo promedio.** Deliberadamente imposible en este spec
  (§10). Si el negocio necesita corregirlo sin una compra de por medio, la forma
  correcta es un documento de ajuste de costo con su permiso y su bitácora, no
  reabrir la escritura manual.
- **Kardex valorizado y costo por línea en el detalle del documento** (D-11).
- **Backfill del costo de las compras históricas.** No se hará: inventar importes
  retroactivos contaminaría el único dato que este módulo promete.
