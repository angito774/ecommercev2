---
id: 017
title: Resumen financiero de ventas y gastos operativos
status: done
module: finance
scope: admin
created: 2026-09-17
---

# 017 — Resumen financiero de ventas y gastos operativos

## 1. Contexto

La base de datos solo conoce una mitad del negocio. Desde el spec 007 hay
ingresos reales en `orders` (`amount_total_cents` de los pedidos `paid`) y el
spec 015 los agrega en `/admin` como KPI de negocio —ventas, pedidos, ticket
promedio, curva diaria—, pero **no existe ninguna tabla de gastos**: verificado
contra `src/server/db/schema/`, las once tablas actuales cubren identidad,
auditoría, catálogo y ventas, y ninguna registra una salida de dinero. Quien
paga a un proveedor, el alquiler o un servicio no tiene dónde anotarlo, así que
la pregunta «¿ganamos o perdimos este mes?» hoy no se puede responder desde el
panel: solo se sabe cuánto entró.

El dashboard tampoco sirve para esa pregunta aunque tuviera los gastos. Su corte
de tiempo son tres períodos cerrados (`today | 7d | 30d`) pensados para «¿cómo
vamos ahora?», y su propio §11 dejó anotado que el rango de fechas libre «se
añade cuando alguien necesite cerrar un mes concreto». Cerrar un mes es
exactamente lo que pide este spec.

Este spec añade la mitad que falta —un registro manual de gastos operativos— y
la pantalla que resta una de la otra para un rango de fechas elegible.

La nómina y los salarios **no** entran aquí: viven en el spec 018
(`018-admin-payroll`), que se redacta en paralelo. Lo que este módulo llama
«gastos» son gastos genéricos de operación.

## 2. Objetivo

Una persona con `finance.read` abre `/admin/finance`, elige un rango de fechas
—por defecto el mes en curso— y ve cuánto se ingresó por ventas, cuánto se gastó
en operación, el resultado de restar lo segundo a lo primero y el desglose del
gasto por categoría; y, con los permisos de escritura, registra, edita y elimina
gastos sin salir de la página.

## 3. Alcance

### Incluye

- Tabla nueva `expenses` con su enum `expense_category` y su migración Drizzle
  (`0006`). Es el primer concepto de gasto del proyecto.
- Cuatro permisos nuevos: `finance.read`, `expenses.create`, `expenses.update` y
  `expenses.delete`, concedidos **solo** a `super_admin` y `admin` (§5).
- Página `/admin/finance` protegida con `requirePagePermission('finance.read')`
  y su entrada en la navegación del panel.
- `GET /api/admin/finance/summary`: ingresos, gastos, resultado, margen y
  desglose de gasto por categoría para un rango de fechas.
- CRUD de gastos: `GET`/`POST /api/admin/expenses` y
  `PATCH`/`DELETE /api/admin/expenses/[id]`, con su entrada en `audit_logs`
  dentro de la misma transacción que la mutación.
- Filtro de rango de fechas por día, con el mes en curso como valor por defecto,
  resuelto en `America/Lima` igual que el dashboard.
- Repositorio nuevo `finance.repository.ts` (la razón de que no se reutilice
  `metrics.repository.ts` está en §8, D-1).
- Mudanza de las primitivas de reporting (`REPORTING_TIME_ZONE`,
  `REPORTING_UTC_OFFSET_MINUTES`, `toReportingDayKey`) de
  `src/modules/dashboard/` a `src/lib/reporting.ts`, con sus cinco importadores
  actualizados (§8, D-9).
- Módulo `src/modules/finance/` completo: schemas Zod, tipos, constantes,
  funciones puras de rango y de margen, services, hooks, tarjetas de resumen,
  desglose por categoría, tabla de gastos, formulario y diálogo de borrado.

### No incluye (explícito)

- **Salarios y nómina de personal.** Es el spec 018; este módulo no los registra,
  no los suma al resultado y no reserva ningún valor del enum para ellos.
- Costo de mercadería vendida. `products` no tiene columna de costo, así que el
  «resultado» de esta pantalla **no** es utilidad contable (§10, §11).
- Comisiones de Stripe, devoluciones y reembolsos. Nada se importa desde Stripe:
  si se quiere descontar una comisión, se registra a mano como un gasto más.
- Impuestos, IGV, retenciones y cualquier cálculo tributario.
- Multimoneda. Todo es PEN en céntimos, como el resto del proyecto.
- Adjuntos (factura, recibo, foto), proveedores como entidad, cuentas por pagar y
  conciliación bancaria.
- Gastos recurrentes o programados: cada gasto se registra una vez, a mano.
- Presupuestos, objetivos y alertas de desvío.
- Gráficos. No se instala nada de Recharts en este módulo (D-13); la curva de
  ventas ya existe en `/admin` (spec 015).
- Exportación a CSV o PDF, y cierre contable de período (bloquear un mes ya
  cerrado).
- Búsqueda de texto sobre el concepto del gasto y ordenación configurable: el
  orden es fijo (§6).

## 4. Criterios de aceptación

- [x] AC1 — Dado un visitante sin sesión, cuando pide cualquiera de los cuatro
      endpoints del módulo, entonces recibe `401` con cuerpo `{ message }` y
      **no** un `307` al formulario de Clerk.
- [x] AC2 — Dado un usuario con sesión y sin `finance.read`, cuando pide
      `GET /api/admin/expenses?page=abc`, entonces recibe `403` y no `400`: la
      autorización ocurre antes de mirar la query.
- [x] AC3 — Dado un usuario con rol `manager` o `audit` —que sí abren `/admin` y
      `/admin/inventory`—, cuando abre `/admin/finance`, entonces ve el `403` de
      `src/app/forbidden.tsx` y la entrada «Finanzas» no aparece en la
      navegación del panel.
- [x] AC4 — Dada una petición sin `from` ni `to`, cuando llega al endpoint,
      entonces el servidor resuelve el **mes en curso en `America/Lima`** y
      devuelve ese rango en `meta.range`; la respuesta es `200`.
- [x] AC5 — Dado `from` posterior a `to`, o una fecha que no es `YYYY-MM-DD`,
      entonces la respuesta es `400` con `{ message, issues }`.
- [x] AC6 — Dado un pedido pagado a las 23:00 hora de Lima del último día del
      rango (04:00 UTC del día siguiente), cuando se calcula el resumen, entonces
      ese pedido **cuenta dentro del rango** y no queda fuera.
- [x] AC7 — Dados los ingresos, cuando se calculan, entonces solo intervienen
      pedidos con `status = 'paid'`; `pending`, `payment_failed` y `canceled` no
      suman ni al importe ni al conteo.
- [x] AC8 — Dado un gasto con `incurred_on` igual al primer día del rango y otro
      igual al último, entonces **ambos** cuentan: el rango de gastos es
      inclusivo en los dos extremos, tal y como lo lee quien elige las fechas.
- [x] AC9 — Dado un rango con más gasto que ingreso, entonces `netCents` es
      negativo y la UI lo comunica con signo, etiqueta («Pérdida») e icono además
      del color, nunca solo con color.
- [x] AC10 — Dado un rango sin ventas, entonces `marginPercent` vale `null` y la
      UI muestra «Sin ingresos en el rango»; nunca `Infinity`, `NaN` ni `0 %`.
- [x] AC11 — Dado un rango sin ventas y sin gastos, cuando se carga la página,
      entonces los tres importes muestran `S/ 0.00`, el desglose muestra su
      estado vacío y la tabla su estado vacío. **No es un error ni un estado de
      carga.**
- [x] AC12 — Dado un `POST /api/admin/expenses` con `amountCents` igual a `0`,
      negativo o con decimales, entonces la respuesta es `400` con `issues` y no
      se inserta ninguna fila.
- [x] AC13 — Dado un `POST` con `incurredOn` posterior a hoy en `America/Lima`,
      entonces la respuesta es `400`: no se registran gastos futuros.
- [x] AC14 — Dado un `POST` válido, entonces se inserta la fila **y** una entrada
      `expense.created` en `audit_logs` con el mismo `actor_id` dentro de la
      misma transacción; si el `INSERT` falla, no queda ninguna de las dos.
- [x] AC15 — Dado un `PATCH` sobre un id inexistente, entonces la respuesta es
      `404`; dado uno válido, la bitácora guarda `expense.updated` con el
      `before` leído **dentro** de la transacción del `UPDATE`.
- [x] AC16 — Dado un `DELETE` válido, entonces la fila desaparece físicamente de
      `expenses` y queda `expense.deleted` en `audit_logs` con la fila completa
      en `changes.before` y `after: null`.
- [x] AC17 — Dado un usuario con `finance.read` y sin los tres permisos de
      escritura, entonces `meta.canCreate`, `meta.canUpdate` y `meta.canDelete`
      son `false`, la tabla no pinta la columna de acciones ni el botón
      «Registrar gasto», y un `POST` directo responde `403` igualmente.
- [x] AC18 — Dado un gasto recién creado, editado o eliminado, cuando termina la
      mutación, entonces los importes del resumen y la tabla se actualizan sin
      recargar la página.
- [x] AC19 — Dado el listado de gastos, entonces pagina de 20 en 20 y ordena por
      `incurred_on desc, created_at desc, id desc`.
- [x] AC20 — Dado un filtro de categoría aplicado en la tabla, entonces los
      importes del resumen **no** cambian: la categoría filtra el detalle, no el
      resultado del período.
- [x] AC21 — Dada la primera carga, entonces el resumen muestra esqueletos y la
      tabla el esqueleto de `DataTable`; ante un fallo de red, cada bloque
      muestra su mensaje de error con «Reintentar».
- [x] AC22 — Dado cualquier importe del JSON de cualquiera de los cuatro
      endpoints, entonces es un entero en céntimos; la división por 100 solo
      ocurre en el formateo de la vista.

## 5. Modelo de datos

**Requiere migración.** Es el primer spec desde el 009 que toca el esquema: añade
un enum y una tabla. La migración generada será `drizzle/0006_*.sql` (verificado:
el último journal es `0005`).

### 5.1 Tabla nueva `expenses`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `uuid` PK, `defaultRandom()` | |
| `concept` | `varchar(160)` not null | Qué se pagó, en texto libre. Mismo ancho que `products.name` |
| `amount_cents` | `integer` not null | Céntimos, nunca decimal (CLAUDE.md §6). `CHECK > 0` (D-6) |
| `category` | `expense_category` not null | Enum de Postgres (D-4) |
| `incurred_on` | `date` not null | **Día** del gasto, sin hora ni huso (D-5) |
| `created_by_id` | `uuid` not null → `users.id` `restrict` | Quién lo registró |
| `created_at` | `timestamptz` not null default `now()` | |
| `updated_at` | `timestamptz` not null default `now()`, `$onUpdate` | |

Índice: `expenses_incurred_on_idx` sobre `(incurred_on desc)` — sostiene tanto el
filtro por rango del resumen como el orden del listado. No se añade índice por
`category` ni por `created_by_id`; el compromiso está en §10.

Sin ningún `unique`: dos facturas del mismo proveedor, el mismo día y por el
mismo importe son un caso legítimo, no un duplicado. Por eso ningún endpoint de
este spec devuelve `409`.

```ts
// src/server/db/schema/expense.ts — firma propuesta
import { check, date, index, integer, pgEnum, pgTable, sql, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './user';

// Enum de Postgres y no tabla de categorías (D-4). Sin valor de nómina: los
// salarios son el spec 018 y no se les reserva sitio aquí.
export const expenseCategory = pgEnum('expense_category', [
  'suppliers',
  'logistics',
  'rent',
  'utilities',
  'marketing',
  'software',
  'taxes',
  'other',
]);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    concept: varchar('concept', { length: 160 }).notNull(),
    // Céntimos, como `products.price_cents` y `orders.amount_total_cents`.
    amountCents: integer('amount_cents').notNull(),
    category: expenseCategory('category').notNull(),
    // `date` y no `timestamptz`: un gasto ocurre un día, no en un instante, y la
    // columna sin hora no puede desplazarse de día al cruzar el huso (D-5).
    // `mode: 'string'` entrega 'YYYY-MM-DD' y evita el Date→UTC del driver.
    incurredOn: date('incurred_on', { mode: 'string' }).notNull(),
    // `restrict`: las personas se desactivan, no se borran. Un gasto no puede
    // quedar sin responsable, igual que `orders.user_id`.
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('expenses_incurred_on_idx').on(t.incurredOn.desc()),
    // El invariante en la base y no solo en Zod: un gasto negativo invertiría el
    // signo del resultado y ningún camino de escritura debe poder crearlo (D-6).
    check('expenses_amount_cents_positive', sql`${t.amountCents} > 0`),
  ],
);
```

`src/server/db/schema/index.ts` exporta `expenses` y `expenseCategory`;
drizzle-kit lee el directorio completo.

Tipos inferidos, sin duplicar (CLAUDE.md regla 5):
`type Expense = typeof expenses.$inferSelect`, `NewExpense = typeof expenses.$inferInsert`.

### 5.2 Catálogo de permisos

No es migración sino `npm run db:seed` (idempotente: `seedPermissions` hace
`onConflictDoUpdate` por `code` y `seedRolePermissions`, `onConflictDoNothing`).
El catálogo pasa de **19 a 23** códigos.

```ts
// src/lib/permissions.ts — cuatro entradas nuevas en PERMISSIONS
{ code: 'finance.read',     resource: 'finance',  action: 'read',   description: 'Ver el resumen financiero y el registro de gastos.' },
{ code: 'expenses.create',  resource: 'expenses', action: 'create', description: 'Registrar gastos operativos.' },
{ code: 'expenses.update',  resource: 'expenses', action: 'update', description: 'Editar gastos operativos ya registrados.' },
{ code: 'expenses.delete',  resource: 'expenses', action: 'delete', description: 'Eliminar gastos operativos.' },
```

Matriz rol × permiso resultante. Verificada contra el `ROLE_PERMISSION_MATRIX`
real: es la primera vez que un módulo del panel **no** se concede a los cuatro
roles que hoy lo abren.

| Rol | `finance.read` | `expenses.create` | `expenses.update` | `expenses.delete` |
|---|---|---|---|---|
| `super_admin` | sí | sí | sí | sí |
| `admin` | sí | sí | sí | sí |
| `manager` | **no** | no | no | no |
| `audit` | **no** | no | no | no |
| `employee`, `customer` | no | no | no | no |

`manager` y `audit` quedan fuera a propósito (D-3): ven pedidos y stock, que es
lo que operan, pero el resultado del negocio y lo que se paga a proveedores no
forma parte de su trabajo. `audit` es el caso menos obvio —lee la bitácora, donde
sí verá `expense.*`— y se decide así igualmente: la bitácora registra que alguien
registró un gasto; el resumen financiero es otra cosa.

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/finance/summary` | `finance.read` | query: `from?`, `to?` | `FinanceSummaryResponse` | 400, 401, 403, 500 |
| GET | `/api/admin/expenses` | `finance.read` | query: `from?`, `to?`, `category?`, `page?`, `pageSize?` | `ExpenseListResponse` | 400, 401, 403, 500 |
| POST | `/api/admin/expenses` | `expenses.create` | body: `CreateExpenseInput` | `ExpenseMutated` (201) | 400, 401, 403, 500 |
| PATCH | `/api/admin/expenses/[id]` | `expenses.update` | body: `UpdateExpenseInput` | `ExpenseMutated` | 400, 401, 403, 404, 500 |
| DELETE | `/api/admin/expenses/[id]` | `expenses.delete` | — | `ExpenseMutated` | 400, 401, 403, 404, 500 |

Errores con el contrato ya vigente: `toErrorResponse()` y `badRequest()` de
`src/lib/api-guard.ts`, cuerpo `{ message }` y `{ message, issues }` en el `400`
de validación, que es lo que espera el interceptor de `src/lib/axios.ts`. Sin
`409` en ningún verbo: la tabla no tiene constraints unique (§5.1).

Un rango sin ventas y sin gastos es `200` con los importes en `0`, nunca `404`:
el recurso «resumen del rango» existe siempre (AC11).

### Zod — `src/modules/finance/schemas/finance.schema.ts`

```ts
import { z } from 'zod';

export const EXPENSE_CATEGORIES = [
  'suppliers',
  'logistics',
  'rent',
  'utilities',
  'marketing',
  'software',
  'taxes',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// Tope de cordura, no de negocio: 1 000 000 PEN. Un cero de más al teclear el
// importe es el error frecuente, y sin tope acabaría en el `int4` de la columna
// (que desborda a ~21,4 M PEN) provocando un 500 en vez de un 400.
export const MAX_EXPENSE_AMOUNT_CENTS = 100_000_000;

// Días, no instantes: el rango lo elige una persona en un `<input type="date">` y
// los dos extremos son inclusivos tal y como se leen (AC8). La traducción a
// instantes para `orders.created_at` la hace el servidor (D-8).
const dayKey = z.iso.date();

export const financeRangeSchema = z
  .object({
    from: dayKey.optional(),
    to: dayKey.optional(),
  })
  // Comparación lexicográfica sobre dos 'YYYY-MM-DD': el formato es de ancho
  // fijo, así que el orden de cadena coincide con el cronológico. Mismo criterio
  // que `adminOrderQuerySchema` (spec 014).
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['from'],
  });

export const expenseQuerySchema = z
  .object({
    from: dayKey.optional(),
    to: dayKey.optional(),
    // Centinela `all` en vez de omitir: el `Select` de shadcn/Radix no admite un
    // item con `value=""`, y `products` e `inventory` ya usan esta misma forma.
    category: z.union([z.literal('all'), z.enum(EXPENSE_CATEGORIES)]).default('all'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['from'],
  });

export const createExpenseSchema = z.object({
  concept: z.string().trim().min(3).max(160),
  // Entero positivo: el `.int()` rechaza el decimal que produciría un céntimo a
  // medias y el `.positive()` cierra el 0 y los negativos (AC12). El CHECK de la
  // base es la segunda barrera, no la primera.
  amountCents: z.number().int().positive().max(MAX_EXPENSE_AMOUNT_CENTS),
  category: z.enum(EXPENSE_CATEGORIES),
  // No futuro: un gasto con fecha de mañana falsearía el mes en curso (AC13). Se
  // compara contra el día de hoy en Lima, no contra el del servidor en UTC.
  incurredOn: dayKey.refine((day) => !isFutureReportingDay(day, new Date()), {
    message: 'La fecha del gasto no puede ser futura.',
  }),
});

// Parcial, como `updateProductSchema`: el PATCH admite cualquier subconjunto.
export const updateExpenseSchema = createExpenseSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'No hay nada que actualizar.' },
);

export const expenseIdSchema = z.uuid();

export type FinanceRangeParams = z.output<typeof financeRangeSchema>;
export type ExpenseQueryParams = z.output<typeof expenseQuerySchema>;
export type CreateExpenseInput = z.output<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.output<typeof updateExpenseSchema>;
```

El formulario tiene su **propio** schema, como productos: el importe se teclea en
soles y viaja como cadena hasta `toCents()`.

```ts
// src/modules/finance/schemas/expense-form.schema.ts
import { PRICE_INPUT_PATTERN } from '@/modules/products/lib/price';

export const expenseFormSchema = z.object({
  concept: z.string().trim().min(3).max(160),
  // Mismo patrón que el precio del producto: hasta 6 enteros y 2 decimales. La
  // conversión a céntimos es `toCents()`, aritmética de cadenas sin coma
  // flotante (D-19).
  amount: z.string().regex(PRICE_INPUT_PATTERN, 'Importe inválido'),
  category: z.enum(EXPENSE_CATEGORIES),
  incurredOn: z.iso.date(),
});

export type ExpenseFormValues = z.output<typeof expenseFormSchema>;
```

### Tipos de salida — `src/modules/finance/types/finance.types.ts`

```ts
import type { expenses } from '@/server/db/schema';

type Expense = typeof expenses.$inferSelect;

export type ExpenseCategoryTotal = {
  category: ExpenseCategory;
  amountCents: number;
  count: number;
};

export type FinanceSummary = {
  // Lo cobrado: `sum(amount_total_cents)` de los pedidos `paid`, envío incluido
  // (D-10). Mismo número que el KPI de ventas del dashboard para igual rango.
  revenueCents: number;
  orderCount: number;
  expensesCents: number;
  expenseCount: number;
  // revenueCents − expensesCents. Puede ser negativo (AC9).
  netCents: number;
  // null = no hubo ingresos en el rango; sin base no hay porcentaje (D-12, AC10).
  marginPercent: number | null;
  // Solo las categorías con al menos una fila, orden descendente por importe. El
  // porcentaje de cada barra lo calcula la vista: es un dato de pintado.
  expensesByCategory: ExpenseCategoryTotal[];
};

export type FinanceRange = { from: string; to: string }; // días 'YYYY-MM-DD', ambos inclusive

export type FinanceSummaryResponse = {
  data: FinanceSummary;
  meta: {
    // El rango realmente consultado, resuelto en el servidor: la UI rotula con
    // esto y un error de huso queda visible en la respuesta (spec 015, D-7).
    range: FinanceRange;
    timeZone: string; // 'America/Lima'
    generatedAt: string; // ISO
  };
};

// `incurredOn` ya es `string` en el tipo inferido gracias a `mode: 'string'`, así
// que no repite la deuda de `ProductListResponse` (spec 016 §11), donde dos
// campos se declaran `Date` y JSON entrega `string`.
export type ExpenseRow = Pick<
  Expense,
  'id' | 'concept' | 'amountCents' | 'category' | 'incurredOn' | 'createdById'
> & {
  /** ISO: JSON no transporta `Date` y el tipo del cliente no debe mentir. */
  createdAt: string;
  /** `firstName` + `lastName` de quien registró; `null` si Clerk no los dio. */
  createdByName: string | null;
  createdByEmail: string;
};

// Las mutaciones no devuelven marcas de tiempo, y no por olvido: `createdAt` y
// `updatedAt` cruzarían el JSON como `string` bajo un tipo `Date`. El cliente
// solo necesita el concepto para el toast e invalida las listas igualmente.
export type ExpenseMutated = Pick<
  Expense,
  'id' | 'concept' | 'amountCents' | 'category' | 'incurredOn' | 'createdById'
>;

export type ExpenseListResponse = {
  data: ExpenseRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    range: FinanceRange;
    // Resueltos en el servidor; la UI solo oculta controles. La frontera real es
    // el 403 de cada verbo (AC17).
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  };
};
```

### Reglas de cálculo (normativas)

**Rango.** Zona de referencia `America/Lima`, con el desfase fijo de −05:00 que
ya usa el dashboard. El rango se expresa en **días inclusivos** `[from, to]` y
cada consulta lo traduce al tipo de su columna:

```
expenses : incurred_on >= from            AND incurred_on <= to      (columna date, inclusivo)
orders   : created_at  >= inicio(from)    AND created_at  <  inicio(to + 1 día)
```

Las dos derivan del **mismo** par de días, así que es imposible que el resumen
cuente un día de ventas distinto del de gastos (AC6, AC8). Por defecto,
`from` = día 1 del mes en curso en Lima y `to` = último día de ese mes.

**Ingresos.** `sum(amount_total_cents)` sobre `status = 'paid'` (AC7, D-10).

**Resultado.** `netCents = revenueCents − expensesCents`. Resta de enteros; puede
ser negativo.

**Margen.** `marginPercent = redondeo1(netCents / revenueCents × 100)`. Si
`revenueCents === 0` → `null`, aunque el gasto sea 0 (AC10, D-12).

**Desglose.** `group by category`, orden por importe descendente con la categoría
como desempate estable; solo categorías con filas.

## 7. Arquitectura y archivos afectados

- `src/server/db/schema/expense.ts` — **nuevo**: enum `expense_category` y tabla
  `expenses`.
- `src/server/db/schema/index.ts` — exporta `expenses` y `expenseCategory`.
- `drizzle/0006_*.sql` — **nuevo**: migración generada.
- `src/lib/permissions.ts` — los cuatro códigos en `PERMISSIONS` (19 → 23) y en
  `ROLE_PERMISSION_MATRIX` para `super_admin` y `admin`.
- `src/lib/reporting.ts` + `.test.ts` — **nuevo**: `REPORTING_TIME_ZONE`,
  `REPORTING_UTC_OFFSET_MINUTES`, `startOfReportingDay()`,
  `toReportingDayKey()`, `reportingDayStart()` y `addReportingDays()` (D-9).
- `src/modules/dashboard/constants.ts` — **salen** las dos constantes de
  reporting.
- `src/modules/dashboard/lib/period-range.ts` + `.test.ts` — **sale**
  `toReportingDayKey()`; `resolvePeriodRange()` se queda e importa de
  `@/lib/reporting`.
- `src/modules/dashboard/lib/revenue-series.ts` — importa `toReportingDayKey` de
  `@/lib/reporting` (importador verificado).
- `src/server/repositories/metrics.repository.ts` — importa
  `REPORTING_TIME_ZONE` de `@/lib/reporting` en vez de `@/modules/dashboard`
  (importador verificado; de paso, un repositorio deja de importar de un módulo
  de cliente).
- `src/app/api/admin/metrics/route.ts` — igual (importador verificado).
- `src/server/repositories/finance.repository.ts` + `.test.ts` — **nuevo**:
  `findSalesTotals()`, `findExpenseTotals()`, `findExpenseTotalsByCategory()`,
  `buildExpenseFilters()`, `findManyExpenses()`, `findExpenseById()`,
  `createExpense()`, `updateExpense()`, `deleteExpense()`.
- `src/app/api/admin/finance/summary/route.ts` — **nuevo**: `GET`.
- `src/app/api/admin/expenses/route.ts` — **nuevo**: `GET` y `POST`.
- `src/app/api/admin/expenses/[id]/route.ts` — **nuevo**: `PATCH` y `DELETE`.
- `src/modules/finance/schemas/finance.schema.ts` + `.test.ts` — **nuevo**.
- `src/modules/finance/schemas/expense-form.schema.ts` — **nuevo**.
- `src/modules/finance/types/finance.types.ts` — **nuevo**.
- `src/modules/finance/lib/finance-range.ts` + `.test.ts` — **nuevo**:
  `currentMonthRange()`, `resolveFinanceRange()`, `isFutureReportingDay()`.
- `src/modules/finance/lib/finance-math.ts` + `.test.ts` — **nuevo**:
  `marginPercent()`.
- `src/modules/finance/constants.ts` — **nuevo**: `financeKeys`, `expenseKeys`,
  `EXPENSE_PAGE_SIZE`, `EXPENSE_CATEGORY_LABELS`, `EXPENSE_CATEGORY_OPTIONS` y
  los copys de estados vacíos y de error.
- `src/modules/finance/services/finance.service.ts` — **nuevo**:
  `fetchFinanceSummary()`, `fetchExpenses()`, `createExpense()`,
  `updateExpense()`, `deleteExpense()`. Único punto que habla con la API.
- `src/modules/finance/hooks/use-finance-summary.ts` — **nuevo**.
- `src/modules/finance/hooks/use-expenses.ts` — **nuevo**.
- `src/modules/finance/hooks/use-expense-mutations.ts` — **nuevo**: las tres
  mutaciones, cada una invalidando resumen y listado (AC18).
- `src/modules/finance/components/finance-range-filter.tsx` — **nuevo**.
- `src/modules/finance/components/finance-summary-cards.tsx` — **nuevo**.
- `src/modules/finance/components/expenses-by-category.tsx` — **nuevo**.
- `src/modules/finance/components/expense-columns.tsx` — **nuevo**.
- `src/modules/finance/components/expense-form-dialog.tsx` — **nuevo**.
- `src/modules/finance/components/delete-expense-dialog.tsx` — **nuevo**.
- `src/modules/finance/components/expenses-table.tsx` — **nuevo**.
- `src/modules/finance/components/finance-overview.tsx` — **nuevo**: contenedor
  `"use client"` que sostiene el rango y reparte estados.
- `src/app/(admin)/admin/finance/page.tsx` — **nuevo**: Server Component con
  `requirePagePermission('finance.read')`.
- `src/app/(admin)/admin/layout.tsx` — entrada «Finanzas» en `NAV_ITEMS`.
- `docs/SETUP.md` — §5.3 (tabla nueva) y §6 (módulo construido).

Componentes shadcn: `card`, `table`, `dialog`, `alert-dialog`, `select`,
`input`, `label`, `field`, `button`, `skeleton` y `badge` **ya están** en
`src/components/ui/` (verificado). No hace falta añadir ninguno, y no se instala
`chart` (D-13).

Flujo, capa por capa, sin saltos:

```
FinanceOverview ("use client")
  → useFinanceSummary / useExpenses / useExpenseMutations (TanStack Query)
    → finance.service (axios)
      → /api/admin/finance/summary · /api/admin/expenses[/id]  (authorize + Zod)
        → finance.repository (Drizzle) → Neon
```

Ningún componente importa `db`, Drizzle ni el repositorio, y ninguno llama a
axios directo.

### Firmas del repositorio

```ts
// src/server/repositories/finance.repository.ts — firmas propuestas
export type InstantRange = { from: Date; to: Date };   // semiabierto [from, to)
export type DayRange = { fromDay: string; toDay: string }; // inclusivo en ambos extremos

export async function findSalesTotals(range: InstantRange, reader?: Reader): Promise<{
  revenueCents: number;
  orderCount: number;
}>;

export type ExpenseFilters = DayRange & { category: ExpenseCategory | 'all' };

// Exportada para probarla sin base de datos: es la pieza con reglas (los dos
// extremos inclusivos y el `all` que no filtra).
export function buildExpenseFilters(filters: ExpenseFilters): SQL;

export async function findExpenseTotals(range: DayRange, reader?: Reader): Promise<{
  expensesCents: number;
  expenseCount: number;
}>;

export async function findExpenseTotalsByCategory(
  range: DayRange,
  reader?: Reader,
): Promise<ExpenseCategoryTotal[]>;

export async function findManyExpenses(
  params: ExpenseQueryParams,
  range: DayRange,
  reader?: Reader,
): Promise<{ data: ExpenseRow[]; total: number }>;

// Lectura con `reader` para que el `before` de la bitácora se lea dentro de la
// transacción del UPDATE, igual que en productos y categorías.
export async function findExpenseById(id: string, reader?: Reader): Promise<Expense | null>;

// Los mutadores reciben `Tx` y no admiten el `db` global: así es imposible
// escribir un gasto sin su entrada en `audit_logs` (docs/SETUP.md §5.2, regla 2).
export async function createExpense(tx: Tx, values: NewExpense): Promise<Expense>;
export async function updateExpense(tx: Tx, id: string, values: Partial<NewExpense>): Promise<Expense | null>;
export async function deleteExpense(tx: Tx, id: string): Promise<Expense | null>;
```

### Forma del handler de resumen

```ts
// src/app/api/admin/finance/summary/route.ts
export async function GET(request: Request) {
  try {
    // Antes de tocar la query (AC2), igual que orders, metrics e inventory.
    await authorize('finance.read');

    const { searchParams } = new URL(request.url);
    const parsed = financeRangeSchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return badRequest('Parámetros de consulta inválidos', parsed.error.issues);
    }

    const now = new Date();
    const range = resolveFinanceRange(parsed.data, now);

    // En paralelo: tres consultas fijas e independientes, el coste es el de la
    // más lenta (spec 015, D-5).
    const [sales, expenses, byCategory] = await Promise.all([
      financeRepository.findSalesTotals(range),
      financeRepository.findExpenseTotals(range),
      financeRepository.findExpenseTotalsByCategory(range),
    ]);

    const netCents = sales.revenueCents - expenses.expensesCents;

    const body: FinanceSummaryResponse = {
      data: { ...sales, ...expenses, netCents, marginPercent: marginPercent(sales.revenueCents, netCents), expensesByCategory: byCategory },
      meta: {
        range: { from: range.fromDay, to: range.toDay },
        timeZone: REPORTING_TIME_ZONE,
        generatedAt: now.toISOString(),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'GET /api/admin/finance/summary',
      fallback: 'No se pudo obtener el resumen financiero',
    });
  }
}
```

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1**: Repositorio propio `finance.repository.ts`; no se reutiliza `metrics.repository.ts` | Llamar a `findKpiTotals()` desde el handler financiero, o añadirle allí las funciones de gasto | Verificado en el código: `findKpiTotals()` recibe `ResolvedPeriodRange` —dos ventanas contiguas de igual duración— y emite agregados condicionales para comparar período contra período; el resumen financiero necesita **un** rango arbitrario, sin ventana anterior, y necesita combinarlo con `expenses`, tabla que `metrics.repository.ts` no conoce. Acoplarlos significaría que un cambio en la lógica de comparación del dashboard alteraría en silencio el estado de resultados. La única regla compartida es `status = 'paid'`, una línea: por la regla DRY del proyecto («se extrae a la tercera repetición», CLAUDE.md §6) se deja duplicada con comentario cruzado en ambos repositorios, y la AC7 la fija por contrato |
| **D-2**: `finance.read` para las dos lecturas y `expenses.create/update/delete` para las tres escrituras; **no** existe `expenses.read` | Un único `finance.read` + `finance.manage`; o el juego completo `expenses.read/create/update/delete` | El agregado es un recurso propio, como `dashboard.read` (spec 015, D-2) e `inventory.read` (spec 016, D-1): lo que concede es el resultado del negocio. Las escrituras siguen el patrón estándar del catálogo (`products.create/update/delete`), que es lo que hace que la bitácora y la matriz de roles se lean igual para todos los recursos. `expenses.read` no se crea porque el listado de gastos no existe fuera de este módulo: es el detalle que hay detrás de la cifra «Gastos» del resumen, y un permiso que permitiera ver las filas negando el total sería una distinción sin uso |
| **D-3**: Solo `super_admin` y `admin`; `manager` y `audit` quedan fuera | Concederlo a los cuatro roles que abren el panel, como dashboard e inventario | Es el primer módulo con datos que no son operativos sino de resultado: lo que se paga a proveedores y si el mes cierra en pérdida. `manager` opera catálogo y pedidos y `audit` revisa la bitácora; ninguno de los dos necesita el estado de resultados para su trabajo, y el criterio del proyecto es conceder por necesidad, no por comodidad |
| **D-4**: `category` como `pgEnum('expense_category', …)` de 8 valores | Tabla `expense_categories` con FK, editable desde la UI | La tabla traería su propio CRUD, sus propios permisos, su seed y su gestión de categorías en uso al borrar: mucha maquinaria para una lista que cambia una vez al año. El enum es el precedente del proyecto (`order_status`, `audit_severity`), da un `Record<ExpenseCategory, string>` exhaustivo en TypeScript para las etiquetas y hace que el desglose sea type-safe. Coste aceptado y anotado: añadir un valor exige migración (`ALTER TYPE … ADD VALUE`) y retirar uno exige recrear el tipo (§10, §11) |
| **D-5**: `incurred_on` es `date` con `mode: 'string'`, separado de `created_at` | Un solo `timestamptz` que sirva de fecha del gasto | Un gasto ocurre un día, no en un instante: guardarlo con hora obligaría a decidir cuál, y al agrupar por mes en otro huso el gasto del día 1 saltaría al mes anterior —exactamente el fallo que el spec 015 evitó con `America/Lima` (D-6)—. Con `date` no hay huso que desplazar. `mode: 'string'` además entrega `'YYYY-MM-DD'` y evita que el driver lo convierta a `Date` en UTC (mismo motivo que el spec 015, D-20). `created_at` sigue siendo el instante del registro, que es otra cosa y sí interesa para la auditoría |
| **D-6**: `CHECK (amount_cents > 0)` en la tabla, además del `.positive()` de Zod | Validar solo en Zod | Un gasto negativo invertiría el signo del resultado y ningún camino de escritura debe poder crearlo: el seed, una migración de datos o un `psql` a mano no pasan por Zod. Es el primer CHECK del esquema; se acepta porque el invariante es del dato, no del formulario |
| **D-7**: El borrado de un gasto es **físico** (`DELETE`) | Borrado lógico con `is_active`, como productos y categorías | `expenses` no tiene dependientes: nada la referencia, a diferencia de `products`, que `order_items` congela. Un `is_active` obligaría a que las tres consultas de agregado recordaran el filtro, y olvidarlo en una sumaría gastos borrados al resultado —la clase de bug que el spec 016 blinda con invariantes en el repositorio—. La traza no se pierde: `expense.deleted` guarda la fila completa en `changes.before` y `audit_logs` es append-only. Precedente del proyecto: `payment_methods` se borra físicamente (spec 009) |
| **D-8**: Rango libre de fechas por día, con el mes en curso por defecto | El selector `today \| 7d \| 30d` del dashboard | El spec 015 §11 dejó anotado que el rango libre entra «cuando alguien necesite cerrar un mes concreto», y eso es esta pantalla: un estado de resultados se mira por mes cerrado, no por «últimos 30 días». Los dos extremos son días inclusivos porque es como los lee quien los teclea; la traducción a instantes semiabiertos para `orders.created_at` ocurre en el servidor, en un solo sitio |
| **D-9**: Las primitivas de reporting se mudan a `src/lib/reporting.ts` | Que el módulo de finanzas importe `REPORTING_TIME_ZONE` y `toReportingDayKey` de `@/modules/dashboard` | Mismo caso que `LOW_STOCK_THRESHOLD` en el spec 016 (D-2): «la zona horaria con la que el negocio corta sus días» no es una propiedad del dashboard, y que finanzas importe de dashboard para saber cuándo empieza un día invierte la dependencia. De paso corrige algo ya presente: `metrics.repository.ts` —código de servidor— importa hoy de `@/modules/dashboard/constants`, un módulo de cliente. `src/lib/` es el sitio de los módulos puros que leen los dos lados (`permissions.ts`, `utils.ts`) |
| **D-10**: Ingresos = `sum(amount_total_cents)`, envío incluido | Sumar solo `subtotal_cents` y tratar el envío aparte | Es el dinero que efectivamente entró, y es el mismo número que el KPI de ventas del dashboard: dos pantallas del mismo panel no pueden decir cifras distintas de ventas para el mismo rango sin destruir la confianza en las dos. El envío cobrado se compensa con un gasto de logística que se registra como cualquier otro. Separar subtotal y envío queda como deuda (§11) |
| **D-11**: Las sumas se castean a `::bigint` y se convierten con `Number()` | Dejarlas en `int4` | Copiado del spec 015 (D-11) y por el mismo motivo: `sum(amount_total_cents)` desborda el `int4` a partir de ~21,5 M PEN acumulados y el fallo sería un 500 en producción justo en un buen año. Aplica igual a `sum(amount_cents)` de gastos |
| **D-12**: `marginPercent: null` cuando los ingresos del rango son 0 | `0`, `-100`, `Infinity` | `x/0` es `Infinity` y `0/0` es `NaN`; ambos se serializan como `null` por accidente y revientan cualquier `toFixed`. Decidirlo explícitamente convierte el caso en un estado con copy propio. Es la misma regla que `changePercent` del dashboard (D-8), así que el panel entero trata igual la división sin base |
| **D-13**: Sin gráficos. El desglose por categoría se pinta con barras de ancho porcentual en CSS | Un `PieChart` o un `BarChart` de Recharts | Son como mucho 8 categorías con un importe cada una: una lista ordenada con su barra responde «en qué se va el dinero» mejor que un donut, que obliga a comparar ángulos. Traer Recharts a este módulo añadiría un gráfico más que mantener (y un tema de color que validar) sin responder ninguna pregunta que la lista no responda. La curva de ventas, que sí es una serie temporal, ya vive en `/admin` |
| **D-14**: `authorize()` en la primera línea de los cinco verbos | Validar la query o el cuerpo primero | Sin permiso no se debe poder enumerar el contrato a base de `400` antes de recibir el `403` (AC2). Mismo criterio que orders (spec 014), metrics (015, D-21) e inventory (016, D-15); `parseJsonBody()` documenta esa misma regla en `api-guard.ts` |
| **D-15**: Las tres mutaciones corren en `db.transaction` con `logAudit(tx, …)` | Escribir la bitácora después del `INSERT`/`UPDATE`/`DELETE`, fuera de la transacción | `logAudit` exige un `Tx` y no admite el `db` global precisamente para que esto no sea opcional (CLAUDE.md regla 11). En el `PATCH`, además, el `before` se lee con el `tx` para que la bitácora registre exactamente el estado sobre el que corre el `UPDATE`, igual que en productos |
| **D-16**: Rutas `/api/admin/finance/summary` y `/api/admin/expenses[/id]` | Todo bajo `/api/admin/finance/…` | El path espeja el recurso: `expenses` es una tabla con CRUD y va donde van `products`, `orders` y `categories`; el resumen es un agregado sin tabla propia, como `metrics`, y por eso cuelga de `finance/`. Que `GET /api/admin/expenses` se autorice con `finance.read` es deliberado y lo explica D-2 |
| **D-17**: El filtro de categoría afecta solo a la tabla, nunca al resumen | Que la categoría filtre también los KPI | «Resultado del período» tiene que significar lo mismo mientras se explora el detalle; si los KPI cambiaran al filtrar, el número de la esquina dejaría de ser el del mes. El endpoint de resumen ni siquiera acepta el parámetro: la firma es lo que hace imposible colárselo (AC20) |
| **D-18**: Dos endpoints (resumen y listado) en vez de uno con todo | Una sola respuesta con KPI, desglose y primera página de gastos | Los dos tienen ciclos distintos: el listado pagina y se filtra por categoría, el resumen no. Con una sola ruta, pasar a la página 2 recalcularía los tres agregados del mes entero. Es la situación contraria a la del dashboard (015, D-5), donde los cuatro bloques se cargan y refrescan juntos |
| **D-19**: Se reutilizan `formatPrice`, `toCents`, `fromCents` y `PRICE_INPUT_PATTERN` de `@/modules/products/lib/price` | Un formateador propio del módulo financiero | Verificado: `formatPrice` ya tiene 20 importadores en 6 módulos distintos —es de facto el formateador de dinero del proyecto— y `toCents` es aritmética de cadenas que evita el `parseFloat(x) * 100` que redondea mal. Un segundo conversor sería la tercera copia que redondea distinto, que es justo lo que advierte el comentario de ese archivo |
| **D-20**: Sin `refetchInterval`; el refresco es el de TanStack Query al volver a la pestaña | Polling de 60 s como el dashboard | Los gastos los teclea la propia persona que mira la pantalla y las ventas del mes no cambian de minuto a minuto. Un refresco automático que mueva las cifras mientras se revisa una lista molesta más de lo que informa; mismo criterio que la página de inventario (spec 016 §10) |
| **D-21**: El rango vive en `useState` del contenedor | Zustand o la URL (`?from=…&to=…`) | Un solo consumidor y muere al desmontar (CLAUDE.md regla 6, y precedentes 014 D-13 y 015 D-18). La URL sería compartible, pero obliga a `useSearchParams` con su frontera de Suspense para una pantalla que nadie enlaza |

## 9. Tareas

- [x] **T1** — Añadir `finance.read`, `expenses.create`, `expenses.update` y
      `expenses.delete` a `PERMISSIONS` (pasa de 19 a 23 entradas) y repartirlos
      **solo** a `super_admin` y `admin` en `ROLE_PERMISSION_MATRIX`, con el
      comentario de por qué `manager` y `audit` quedan fuera (D-3) · archivo:
      `src/lib/permissions.ts` · verificación: `npm run typecheck && npm test`
- [x] **T2** — Tabla `expenses` y enum `expense_category` según §5.1, con el
      índice y el CHECK; exportarlos desde el barrel · archivos:
      `src/server/db/schema/expense.ts`, `src/server/db/schema/index.ts` ·
      verificación: `npm run typecheck`
- [x] **T3** — Generar la migración y revisar el SQL a ojo antes de aplicarlo:
      debe crear el tipo, la tabla, la FK `restrict`, el índice y el CHECK, y
      **nada más** (ninguna alteración de tablas existentes) · comandos:
      `npm run db:generate` y `npm run db:migrate` · verificación: el archivo
      `drizzle/0006_*.sql` leído + `npm run db:studio` mostrando la tabla vacía
- [x] **T4** — Ejecutar el seed y comprobar que el catálogo queda en 23 permisos
      y que solo `super_admin` y `admin` resuelven `finance.read` · comando:
      `npm run db:seed` · verificación: salida del seed + `npm run db:studio`
- [x] **T5** — Crear `src/lib/reporting.ts` con `REPORTING_TIME_ZONE`,
      `REPORTING_UTC_OFFSET_MINUTES`, `startOfReportingDay()` (ahora exportada y
      devolviendo `Date`), `toReportingDayKey()`, `reportingDayStart(dayKey)` y
      `addReportingDays(dayKey, days)`; retirar las constantes de
      `src/modules/dashboard/constants.ts` y `toReportingDayKey` de
      `period-range.ts`, y actualizar los cinco importadores verificados
      (`period-range.ts`, `period-range.test.ts`, `revenue-series.ts`,
      `metrics.repository.ts`, `api/admin/metrics/route.ts`) · verificación:
      `npm run typecheck && npm test`
      · nota: no se parte en dos tareas porque mover las constantes sin mover a
      sus importadores deja el árbol sin compilar; es un solo cambio atómico
- [x] **T6** — Tests de `src/lib/reporting.test.ts`: los casos de
      `toReportingDayKey` que hoy viven en `period-range.test.ts` se trasladan
      tal cual (04:00 UTC es el día anterior en Lima; 05:00 UTC es el mismo día;
      cambio de año), más `reportingDayStart('2026-09-01')` devuelve
      `2026-09-01T05:00:00.000Z`, `toReportingDayKey(reportingDayStart(d)) === d`
      para varios días, y `addReportingDays` cruzando fin de mes, fin de año y
      con `days` negativo · archivo: `src/lib/reporting.test.ts` ·
      verificación: `npm test`
- [x] **T7** — `currentMonthRange(now)`, `resolveFinanceRange(params, now)` y
      `isFutureReportingDay(dayKey, now)` según §6 · archivo:
      `src/modules/finance/lib/finance-range.ts` · verificación:
      `npm run typecheck`
- [x] **T8** — Tests de `finance-range` (patrón de `period-range.test.ts`, con
      `now` explícito y sin congelar el reloj): mes de 31, de 30 y de 28 días;
      febrero de un año bisiesto (2028) da `to = '2028-02-29'`; un `now` de
      `2026-10-01T03:00:00Z` —que en Lima aún es 30 de septiembre— resuelve el
      mes de **septiembre**; `resolveFinanceRange({}, now)` cae al mes en curso;
      `resolveFinanceRange({ from, to }, now)` respeta lo pedido; el `to` del
      instante es el inicio del día **siguiente** al `toDay` (semiabierto);
      `from === to` (un solo día) produce una ventana de 24 h; `isFutureReportingDay`
      con el día de hoy → `false` y con mañana → `true` · archivo:
      `src/modules/finance/lib/finance-range.test.ts` · verificación: `npm test`
- [x] **T9** — `marginPercent(revenueCents, netCents): number | null` con un
      decimal de redondeo y `null` si `revenueCents === 0` · archivo:
      `src/modules/finance/lib/finance-math.ts` · verificación:
      `npm run typecheck`
- [x] **T10** — Tests de `finance-math`: margen positivo; margen negativo
      (gastos > ingresos); margen exactamente 0 (gastos == ingresos);
      `revenueCents = 0` con gastos > 0 → `null`; ambos 0 → `null`; redondeo a un
      decimal; y que ningún caso devuelve `NaN` ni `Infinity` · archivo:
      `src/modules/finance/lib/finance-math.test.ts` · verificación: `npm test`
- [x] **T11** — Schemas Zod `financeRangeSchema`, `expenseQuerySchema`,
      `createExpenseSchema`, `updateExpenseSchema` y `expenseIdSchema` según §6,
      más `EXPENSE_CATEGORIES` y el tipo `ExpenseCategory` que se deriva de él ·
      archivo: `src/modules/finance/schemas/finance.schema.ts` · verificación:
      `npm run typecheck`
      · nota: va antes que las constantes porque `EXPENSE_CATEGORY_LABELS` se tipa
      con `Record<ExpenseCategory, string>` y `expenseKeys` con
      `ExpenseQueryParams`; el schema es el origen de ambos
- [x] **T12** — Tests de los schemas (patrón de `inventory.schema.test.ts`):
      query vacía → `{ category: 'all', page: 1, pageSize: 20 }` y sin fechas;
      `from > to` → error; `from = '2026-13-01'` → error; `page = 0` y
      `pageSize = 500` → error; `amountCents` en `0`, negativo y `10.5` → error;
      `amountCents` por encima de `MAX_EXPENSE_AMOUNT_CENTS` → error; `concept`
      de dos caracteres o de 161 → error; `concept` con espacios alrededor queda
      recortado; `category` fuera del enum → error; `incurredOn` de mañana →
      error y el de hoy pasa (con `vi.setSystemTime` para fijar el día);
      `updateExpenseSchema` con `{}` → error · archivo:
      `src/modules/finance/schemas/finance.schema.test.ts` · verificación:
      `npm test`
- [x] **T13** — `expenseFormSchema` y `ExpenseFormValues` según §6 · archivo:
      `src/modules/finance/schemas/expense-form.schema.ts` · verificación:
      `npm run typecheck`
- [x] **T14** — Constantes del módulo: `EXPENSE_PAGE_SIZE = 20`,
      `EXPENSE_CATEGORY_LABELS` (`Record<ExpenseCategory, string>` exhaustivo, en
      español), `EXPENSE_CATEGORY_OPTIONS` (con el centinela `all` al frente),
      `financeKeys` (`all` / `summary(range)`), `expenseKeys`
      (`all` / `lists()` / `list(params)`) y los copys de estado vacío y de error
      · archivo: `src/modules/finance/constants.ts` · verificación:
      `npm run typecheck`
- [x] **T15** — Tipos de salida: `ExpenseCategoryTotal`, `FinanceSummary`,
      `FinanceRange`, `FinanceSummaryResponse`, `ExpenseRow`, `ExpenseMutated` y
      `ExpenseListResponse`, derivados del tipo inferido de `expenses` con
      `Pick`, sin redeclarar columnas · archivo:
      `src/modules/finance/types/finance.types.ts` · verificación:
      `npm run typecheck`
- [x] **T16** — Repositorio: `findSalesTotals(range)` con
      `sum(amount_total_cents)::bigint` y `count(*)::int` sobre
      `status = 'paid'` y `created_at` en `[from, to)`, con el comentario cruzado
      a `metrics.repository.ts` sobre la regla `PAID` (D-1, D-11) · archivo:
      `src/server/repositories/finance.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T17** — Repositorio: `buildExpenseFilters()` exportada (rango inclusivo
      en ambos extremos con `gte`/`lte` sobre `incurred_on`, y `category` solo
      cuando no es `all`), `findExpenseTotals(range)` y
      `findExpenseTotalsByCategory(range)` con `group by category` y orden por
      importe descendente · archivo:
      `src/server/repositories/finance.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T18** — Repositorio: `findManyExpenses(params, range)` con el
      `innerJoin` a `users` para `createdByName`/`createdByEmail`, orden
      `incurred_on desc, created_at desc, id desc`, `limit/offset` y el conteo en
      paralelo (AC19) · archivo:
      `src/server/repositories/finance.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T19** — Repositorio: `findExpenseById(id, reader)` y los tres mutadores
      `createExpense`/`updateExpense`/`deleteExpense`, los tres recibiendo `Tx` y
      devolviendo la fila con `returning()` · archivo:
      `src/server/repositories/finance.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T20** — Tests del repositorio con `PgDialect` (patrón exacto de
      `inventory.repository.test.ts`): `buildExpenseFilters` con `category: 'all'`
      no añade `"category"`; con una categoría sí, y el valor viaja como
      parámetro; los dos extremos del rango aparecen siempre como `>=` y `<=`
      sobre `incurred_on`; y `findSalesTotals` usa `>=` y `<` sobre `created_at`
      —semiabierto— más `status = 'paid'` · archivo:
      `src/server/repositories/finance.repository.test.ts` · verificación:
      `npm test`
- [x] **T21** — Route Handler `GET /api/admin/finance/summary` según §7:
      `authorize('finance.read')` primero, `safeParse` → `badRequest` con
      `issues`, `resolveFinanceRange`, las tres lecturas en `Promise.all`,
      `netCents`, `marginPercent` y `meta` completo · archivo:
      `src/app/api/admin/finance/summary/route.ts` · verificación:
      `npm run build`
- [x] **T22** — Route Handler `GET /api/admin/expenses`:
      `authorize('finance.read')`, `expenseQuerySchema`, rango resuelto con la
      misma función que el resumen, y `meta` con paginación, `range` y los tres
      flags de permiso resueltos con `can(granted, …)` (AC17) · archivo:
      `src/app/api/admin/expenses/route.ts` · verificación: `npm run build`
- [x] **T23** — Route Handler `POST /api/admin/expenses`:
      `authorize('expenses.create')`, `parseJsonBody(createExpenseSchema)`,
      `db.transaction` con `createExpense` + `logAudit('expense.created')` y
      `createdById: actor.id`; responde `201` con `ExpenseMutated` (AC14) ·
      archivo: `src/app/api/admin/expenses/route.ts` · verificación:
      `npm run build`
- [x] **T24** — Route Handler `PATCH /api/admin/expenses/[id]`:
      `authorize('expenses.update')`, id validado con `expenseIdSchema`
      (`params` es promesa en Next 16), `db.transaction` con el `before` leído
      por el `tx`, `404` si no existe, `updateExpense` y
      `logAudit('expense.updated')` con `{ before, after }` (AC15) · archivo:
      `src/app/api/admin/expenses/[id]/route.ts` · verificación: `npm run build`
- [x] **T25** — Route Handler `DELETE /api/admin/expenses/[id]`:
      `authorize('expenses.delete')`, `db.transaction` con el `before`, `404` si
      no existe, `deleteExpense` (borrado físico, D-7) y
      `logAudit('expense.deleted')` con `changes: { before, after: null }`
      (AC16) · archivo: `src/app/api/admin/expenses/[id]/route.ts` ·
      verificación: `npm run build`
- [x] **T26** — Services axios: `fetchFinanceSummary(range)`,
      `fetchExpenses(params)`, `createExpense(input)`, `updateExpense(id, input)`
      y `deleteExpense(id)` sobre `api` de `@/lib/axios` · archivo:
      `src/modules/finance/services/finance.service.ts` · verificación:
      `npm run typecheck`
- [x] **T27** — `useFinanceSummary(range)` con `financeKeys.summary(range)` y
      `placeholderData: keepPreviousData`; sin `refetchInterval` (D-20) ·
      archivo: `src/modules/finance/hooks/use-finance-summary.ts` ·
      verificación: `npm run typecheck`
- [x] **T28** — `useExpenses(params)` con `expenseKeys.list(params)` y
      `placeholderData: keepPreviousData` · archivo:
      `src/modules/finance/hooks/use-expenses.ts` · verificación:
      `npm run typecheck`
- [x] **T29** — `useCreateExpense`, `useUpdateExpense` y `useDeleteExpense`;
      las tres invalidan `expenseKeys.lists()` **y** `financeKeys.all` en el
      mismo `Promise.all` y emiten su `toast` (AC18) · archivo:
      `src/modules/finance/hooks/use-expense-mutations.ts` · verificación:
      `npm run typecheck`
- [x] **T30** — `FinanceRangeFilter`: dos `<input type="date">` con borrador y
      botón «Aplicar», aviso accesible de rango invertido y botón de volver al
      mes en curso; mismo patrón que `admin-order-filters.tsx` · archivo:
      `src/modules/finance/components/finance-range-filter.tsx` · verificación:
      `npm run typecheck`
- [x] **T31** — `FinanceSummaryCards`: tres `Card` (Ingresos, Gastos,
      Resultado) con `formatPrice`, el resultado con icono + etiqueta
      «Ganancia»/«Pérdida» además del color, el margen con su copy de «Sin
      ingresos en el rango» cuando es `null`, y esqueleto y error propios
      (AC9, AC10, AC21) · archivo:
      `src/modules/finance/components/finance-summary-cards.tsx` ·
      verificación: `npm run typecheck`
- [x] **T32** — `ExpensesByCategory`: lista ordenada con etiqueta, importe,
      porcentaje del total y barra de ancho proporcional en CSS (D-13), con
      estado vacío afirmativo cuando no hay gastos en el rango · archivo:
      `src/modules/finance/components/expenses-by-category.tsx` · verificación:
      `npm run typecheck`
- [x] **T33** — `getExpenseColumns({ canUpdate, canDelete, onEdit, onDelete })`:
      fecha, concepto, categoría (badge con la etiqueta del mapa), importe
      (`tabular-nums`, `formatPrice`), registrado por, y la columna de acciones
      solo si hay algún permiso de escritura (AC17) · archivo:
      `src/modules/finance/components/expense-columns.tsx` · verificación:
      `npm run typecheck`
- [x] **T34** — `ExpenseFormDialog`: alta y edición en el mismo diálogo
      (`expense: ExpenseRow | null`, patrón de `ProductFormDialog`), RHF con
      `zodResolver(expenseFormSchema)`, importe en soles convertido con
      `toCents`/`fromCents`, `max` de hoy en el input de fecha y llamada a
      `useCreateExpense`/`useUpdateExpense` · archivo:
      `src/modules/finance/components/expense-form-dialog.tsx` · verificación:
      `npm run typecheck`
- [x] **T35** — `DeleteExpenseDialog`: `AlertDialog` que nombra el concepto y el
      importe y advierte de que el borrado es definitivo (D-7); patrón de
      `delete-product-dialog.tsx` · archivo:
      `src/modules/finance/components/delete-expense-dialog.tsx` ·
      verificación: `npm run typecheck`
- [x] **T36** — `ExpensesTable`: `"use client"`, `Select` de categoría, reinicio
      de `page` al cambiar filtros, `useReactTable` con
      `manualPagination`/`manualFiltering`, `DataTable` con
      `isLoading`/`isError`/`onRetry` y los dos estados vacíos (sin gastos en el
      rango / sin resultados con filtros) · archivo:
      `src/modules/finance/components/expenses-table.tsx` · verificación:
      `npm run typecheck`
- [x] **T37** — `FinanceOverview`: contenedor `"use client"` con el rango en
      `useState` inicializado con `currentMonthRange(new Date())` (D-21), el
      filtro, las tarjetas, el desglose, el botón «Registrar gasto» —visible solo
      con `meta.canCreate`— y la tabla · archivo:
      `src/modules/finance/components/finance-overview.tsx` · verificación:
      `npm run typecheck`
- [x] **T38** — Página `/admin/finance` con
      `requirePagePermission('finance.read')`, `metadata`, encabezado que explica
      qué entra y qué no en el resultado (sin costo de mercadería, sin nómina) y
      `<FinanceOverview />` · archivo:
      `src/app/(admin)/admin/finance/page.tsx` · verificación: `npm run build`
- [x] **T39** — Entrada «Finanzas» en `NAV_ITEMS` detrás de «Pedidos», con
      `href: '/admin/finance'`, icono `Wallet` de lucide y
      `permission: 'finance.read'` · archivo:
      `src/app/(admin)/admin/layout.tsx` · verificación: `npm run typecheck`
- [x] **T40** — Documentar en `docs/SETUP.md`: §5.3 la tabla `expenses` con su
      enum, el CHECK y la migración `0006`; §6 el módulo financiero (permisos,
      endpoints, rango por días en `America/Lima`, borrado físico, qué **no**
      incluye el resultado) y la mudanza de las primitivas de reporting a
      `src/lib/reporting.ts` · archivo: `docs/SETUP.md` · verificación: lectura
- [x] **T41** — Cierre:
      `npm run typecheck && npm run lint && npm test && npm run build` en verde y
      recorrido manual de AC3, AC9, AC10, AC11, AC13, AC16, AC18 y AC20 con una
      cuenta `super_admin` y otra con rol `manager`. El recorrido manual no es
      opcional: el spec 015 documenta que un bug de SQL pasó typecheck, lint y
      731 tests y solo lo atrapó abrir la página (§10)
      · **estado**: la mitad automatizada está en verde —typecheck ✓, lint 0 errores,
      875 tests ✓, build exit 0— y las cuatro consultas del módulo se ejecutaron
      contra Neon real, con alta y borrado incluidos: el `group by category` renderiza
      sin 42803, `incurred_on` vuelve como `'YYYY-MM-DD'` sin desplazarse, el borrado
      es físico, `audit_logs` guarda `expense.created` y `expense.deleted` con
      `after: null`, y el CHECK bloquea `amount_cents = 0` en la base (AC11, AC14,
      AC16, AC19, AC20 y D-6 comprobados). El recorrido por navegador de AC3, AC9,
      AC10, AC13 y AC18 lo confirmó el usuario con cuentas reales de Clerk
      (`super_admin` y `manager`): 403 al abrir `/admin/finance` sin `finance.read`
      y «Finanzas» ausente del nav, signo/etiqueta/icono correctos en pérdida,
      mensaje de «sin ingresos» sin `0 %`, `400` al registrar un gasto con fecha
      futura, y tarjetas/tabla actualizándose sin recargar tras crear/editar/borrar
      un gasto. T41 cerrada

## 10. Riesgos y consideraciones

- **El «resultado» no es utilidad contable.** No hay costo de mercadería
  vendida: `products` no tiene columna de costo, así que vender por debajo del
  costo aquí se ve como ingreso puro. Tampoco hay nómina (spec 018), ni
  comisiones de Stripe, ni impuestos. La pantalla debe decirlo en su encabezado
  (T38): es «ingresos por ventas menos gastos operativos registrados», no un
  estado de resultados auditable. Es el riesgo principal del spec y es de
  interpretación, no de código.
- **Los gastos dependen de que alguien los teclee.** Un mes sin gastos
  registrados se ve como un mes perfecto. No hay forma de distinguir «no hubo
  gastos» de «nadie los anotó», y no la habrá mientras el registro sea manual.
- **Sin tests de integración contra Postgres.** Riesgo heredado y documentado en
  el spec 015 §10: los repositorios no se prueban contra una base real y un
  `GROUP BY` mal renderizado pasó typecheck, lint y 731 tests. Aquí hay un
  `group by category` en `findExpenseTotalsByCategory`, pero agrupa por una
  **columna real** de Drizzle y no por una plantilla `sql` reutilizada entre
  cláusulas, que es la condición exacta que provocó el `42803`. Si alguien añade
  después un `CASE` o un `to_char` al `SELECT` de ese agregado, vuelve a entrar
  en esa clase de bug y hay que agrupar por posición ordinal. T41 exige el
  recorrido manual por lo mismo.
- **Cambiar el enum cuesta una migración.** Añadir una categoría es
  `ALTER TYPE … ADD VALUE` (que además no puede usarse en la misma transacción
  que la crea); retirar una obliga a recrear el tipo y reasignar las filas. Es el
  precio aceptado en D-4 y el disparador para pasar a tabla está en §11.
- **Borrar un gasto cambia el pasado.** El resumen se recalcula siempre desde las
  filas vigentes, así que eliminar un gasto de un mes ya revisado altera un
  número que alguien pudo dar por bueno. La única traza es `audit_logs`
  (`expense.deleted` con la fila completa), y es append-only. Se acepta porque no
  hay cierre contable de período (§11); el día que lo haya, el borrado tiene que
  quedar bloqueado para los períodos cerrados.
- **`concept` es texto libre y acaba copiado en `audit_logs`.** El campo se
  guarda en `changes` porque es el contenido auditado. Nada obliga a quien lo
  escribe a no teclear ahí un dato sensible, y la bitácora no se puede editar
  después. No se enmascara —sería enmascarar el propio dato auditado— pero queda
  anotado: el placeholder del formulario debe pedir un concepto, no una nota
  libre. No se registra ningún correo ni nombre en el log: solo `created_by_id`.
- **Desbordamiento de enteros.** Resuelto por D-11 en las dos sumas. El
  `MAX_EXPENSE_AMOUNT_CENTS` de Zod cubre además el caso de la fila suelta: sin
  él, un importe con tres ceros de más reventaría el `int4` de la columna con un
  500 en vez de un 400.
- **Sin índice por `category` ni por `created_by_id`.** El filtro por categoría
  se resuelve con el índice de `incurred_on` más un descarte por filtro, y el
  `group by category` recorre el rango. Con un volumen de gastos manuales
  —decenas o cientos al mes— es irrelevante; el candidato futuro es un compuesto
  `(category, incurred_on)`. No se añade ahora porque sería optimizar sin medida.
- **Sin N+1.** Las tres consultas del resumen son fijas e independientes del
  número de filas y corren en paralelo; el listado resuelve `created_by` con un
  `innerJoin`, no con una consulta por fila.
- **Carrera entre editar y ver.** Dos personas pueden editar el mismo gasto y
  gana la última, igual que en productos. Hay traza de ambas ediciones en la
  bitácora; no se añade control de concurrencia optimista.
- **Ventana entre permiso concedido y seed.** Hasta que T4 corre, los cuatro
  códigos no existen en la tabla `permissions` y **nadie** —ni `super_admin`—
  puede abrir la página: `getEffectivePermissions()` resuelve contra la base, no
  contra el catálogo en código. T4 va inmediatamente después de T3 por eso.
- **Rollback.** Esta vez sí hay migración: revertir exige `DROP TABLE expenses`
  y `DROP TYPE expense_category`, **con pérdida de los gastos registrados**. Si
  la tabla ya tiene datos en producción, el rollback es exportarlos antes. Los
  cuatro permisos quedarían huérfanos en la base, lo cual es inocuo
  (`isPermissionCode()` descarta lo que no está en el código). La mudanza a
  `src/lib/reporting.ts` (T5) se revierte con el código, sin efecto en datos.
- **La mudanza de T5 toca el dashboard, que está en producción.** Es un
  renombrado de imports sin cambio de comportamiento, pero altera cinco archivos
  de un módulo ya cerrado. Los tests de `period-range` y `revenue-series` son la
  red: si el desfase o la clave de día cambiaran, fallan. Debe correr antes de
  escribir nada de finanzas para no mezclar el refactor con la feature.
- **Sin caché de servidor.** Es una vista de administración autenticada y por
  usuario: nada de `revalidate` ni `s-maxage`. Además publica el resultado del
  negocio, que es justamente lo que no debe quedarse en ninguna caché
  compartida.
- **Seguridad.** Es el módulo con los datos más sensibles del panel: resultado
  del negocio y pagos a terceros. De ahí D-3 (solo dos roles) y de ahí que los
  cinco verbos verifiquen en el recurso con `authorize()`, sin depender de que la
  entrada de navegación esté oculta ni de `proxy.ts`, que no lleva lógica de auth
  (CLAUDE.md regla 9).

## 11. Fuera de alcance / deuda aceptada

- **Nómina y salarios.** Viven en el spec `018-admin-payroll`, que se redacta en
  paralelo. Cuando exista, habrá que decidir explícitamente cómo entra en el
  resultado de esta pantalla: o el 018 escribe en `expenses`, o el resumen suma
  una segunda fuente. Este spec no lo prejuzga y deliberadamente **no** reserva
  un valor `payroll` en el enum.
- **Costo de mercadería vendida.** El paso natural es una columna `cost_cents`
  en `products` y un snapshot en `order_items`, que permitiría un margen bruto de
  verdad. Es un spec propio: toca el catálogo, el checkout y los datos
  históricos, que no tendrían costo.
- **Categorías de gasto como tabla.** Se retoma si el negocio pide crear sus
  propias categorías o si el enum supera la docena de valores. La migración sería
  `expense_categories` + FK, conservando los valores actuales como semilla.
- **Separar subtotal y envío en los ingresos.** Hoy el ingreso es
  `amount_total_cents` completo (D-10). Cuando el costo de envío real se
  registre como gasto de logística, tendrá sentido enfrentarlos y ahí el desglose
  se vuelve útil.
- **Cierre contable de período.** No hay forma de bloquear un mes ya revisado:
  cualquiera con permiso puede añadir o borrar un gasto con fecha pasada. El
  enganche natural es una tabla de períodos cerrados y una comprobación en los
  tres mutadores.
- **Adjuntos y proveedores.** Ni factura escaneada ni proveedor como entidad. Lo
  primero necesita almacenamiento de archivos, que el proyecto no tiene; lo
  segundo, una tabla y su CRUD.
- **Gastos recurrentes.** El alquiler se teclea cada mes. Una plantilla o un job
  que los genere es cómodo, pero un gasto generado automáticamente que nadie
  revisa es peor dato que uno tecleado.
- **Exportación a CSV/PDF.** Igual que en los specs 014, 015 y 016: cuando haya
  quien la consuma. Es la deuda que más veces se ha diferido en el panel y la
  primera candidata a spec propio.
- **Búsqueda por concepto en la tabla de gastos.** Con 20 filas por página y un
  volumen mensual bajo, el filtro de categoría basta. Cuando haga falta, es el
  mismo `ilike` con `escapeLikePattern` que ya usan productos e inventario.
- **Recuento total con `count()` y `OFFSET`.** Igual que orders, products e
  inventory. Con decenas de miles de gastos habría que pasar a cursor, escenario
  hoy inimaginable para un registro manual.
- **Comparativa contra el período anterior.** El dashboard la tiene para sus KPI
  (`MetricComparison`); aquí no. Se añade cuando haya varios meses cerrados que
  comparar, reutilizando `percentChange()` de `metrics-math.ts`.
