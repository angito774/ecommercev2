---
id: 018
title: Personal y nómina en administración
status: done
module: payroll
scope: admin
created: 2026-09-17
---

# 018 — Personal y nómina en administración

## 1. Contexto

Hoy el sistema **no tiene ningún concepto de empleado**. Lo que existe es otra
cosa, y conviene dejarlo escrito antes de diseñar nada porque los nombres se
parecen lo bastante como para confundir a quien lea el código dentro de seis
meses:

- `users` (`src/server/db/schema/user.ts`) es el **espejo local de las cuentas de
  Clerk**. Su clave de identidad es `clerk_id`; se puebla por webhook y por
  upsert JIT. Ahí están los clientes de la tienda y las personas con acceso al
  panel, mezclados, porque lo único que representa la fila es «esta cuenta de
  Clerk existe».
- `roles`, `permissions`, `role_permissions` y `user_roles` (spec 002) son
  **exclusivamente autorización de acceso al panel**. Un rol no es un puesto de
  trabajo: es un conjunto de códigos de permiso.
- El rol `employee` de `ROLE_DEFINITIONS` es la trampa principal. Verificado en
  `src/lib/permissions.ts`: su descripción es «Personal interno sin acceso al
  panel de administración» y su fila en `ROLE_PERMISSION_MATRIX` es un array
  **vacío**. Es decir, `employee` no modela a un empleado: modela «cuenta de
  Clerk a la que no le concedemos nada en `/admin`». Nadie cobra un sueldo por
  tener ese rol y nadie deja de cobrarlo por no tenerlo.

Consecuencia: **no hay ninguna tabla que responda «quién trabaja aquí, en qué
puesto, desde cuándo y cuánto cobra»**, ni ninguna que registre que ese sueldo
se pagó. `docs/SETUP.md` §5 no reserva ninguna sección de personal ni de nómina,
y §6 no lista ningún módulo de RRHH. Todo lo de este spec es nuevo.

La pregunta de diseño que esto abre —planteada explícitamente antes de escribir
el modelo de datos— es si un empleado de la nómina debe tener además una cuenta
de Clerk. La respuesta de este spec es **no**, y está razonada en D-1: `employees`
es una tabla independiente, sin ninguna clave foránea a `users`. Un empleado es
un registro puramente administrativo. Si además esa persona entra al panel, eso
se resuelve por el camino que ya existe (invitación + roles, spec 002) y las dos
filas no se conocen entre sí.

Relación con otros specs: el **017 (resumen financiero)** se redacta en paralelo
y cubre ventas y gastos operativos. Este spec **no** toca ese resumen; que los
pagos de nómina aparezcan como una línea de gasto es una integración futura
documentada en §11, no una tarea de aquí.

## 2. Objetivo

Una persona con `payroll.read` abre `/admin/payroll` y ve la plantilla de
personal contratado —nombre, cargo, fecha de ingreso, salario base y estado— y la
bitácora de pagos de sueldo; con `payroll.manage` puede además dar de alta,
editar y dar de baja a un empleado, y registrar o anular el pago del sueldo de un
mes concreto.

## 3. Alcance

### Incluye

- Tabla nueva `employees`, **independiente de `users`**: código, nombre,
  apellido, cargo, fecha de ingreso, salario base en céntimos y estado
  activo/inactivo.
- Tabla nueva `payroll_payments`: bitácora de pagos de sueldo —empleado, periodo
  mensual, fecha de pago e importe en céntimos— con anulación lógica.
- Migración Drizzle `0007` con ambas tablas y sus índices.
- Dos permisos nuevos, `payroll.read` y `payroll.manage`, concedidos **solo** a
  `super_admin` y `admin` (el catálogo pasa de 19 a 21 códigos).
- Siete Route Handlers bajo `/api/admin/employees` y `/api/admin/payroll`, todos
  con `authorize()` en la primera línea y validación Zod.
- Auditoría de las cinco mutaciones en `audit_logs`, dentro de la misma
  transacción, **sin importes** (D-8).
- Página `/admin/payroll` con dos pestañas —Personal y Pagos—, su entrada en la
  navegación y las tablas paginadas de TanStack Table.
- Módulo `src/modules/payroll/` completo: schemas, tipos, constantes, funciones
  puras de fecha y de saneado, services, hooks, diálogos, columnas y tablas.

### No incluye (explícito)

- **Motor de cálculo de nómina.** Nada de deducciones, aportes a AFP/ONP,
  EsSalud, quinta categoría, gratificaciones, CTS, asignación familiar ni horas
  extra. Este módulo registra un pago que ya ocurrió; no lo calcula (D-3, §11).
- **Ningún vínculo con `users` ni con Clerk.** Sin columna `user_id`, sin
  invitación automática, sin portal del empleado y sin que el empleado pueda ver
  sus propios pagos (D-1).
- **Datos personales más allá de lo necesario.** Sin DNI, sin dirección, sin
  teléfono, sin correo, sin fecha de nacimiento, sin datos bancarios y sin
  contrato adjunto (D-2, §10).
- **El resumen financiero.** Ni ventas, ni gastos operativos, ni el agregado de
  nómina como línea de gasto: eso es el spec 017 (§11).
- **Periodicidad distinta de la mensual.** Sin quincenas, sin semanas y sin
  pagos parciales del mismo mes (D-5).
- **Edición de un pago ya registrado.** Un importe equivocado se anula y se
  vuelve a registrar; no hay `PATCH` sobre `payroll_payments` (D-7).
- **Borrado físico.** Ni de empleados (baja lógica) ni de pagos (anulación
  lógica). Nada de este módulo se borra de la base.
- **Exportación, recibos de pago en PDF, adelantos, préstamos, vacaciones,
  ausencias y evaluaciones.**
- **Lectura para el rol `audit`.** No recibe `payroll.read` (D-4).

## 4. Criterios de aceptación

- [x] AC1 — Dado un visitante sin sesión, cuando pide cualquiera de los siete
      endpoints, entonces recibe `401` con cuerpo `{ message }` y **no** un `307`
      al formulario de Clerk.
- [x] AC2 — Dado un usuario con sesión y sin `payroll.read`, cuando pide
      `GET /api/admin/employees?page=abc`, entonces recibe `403` y no `400`: la
      autorización ocurre antes de mirar la query.
- [x] AC3 — Dado un usuario con `payroll.read` y sin `payroll.manage` —hoy nadie,
      pero la matriz puede cambiar—, cuando pide `POST /api/admin/employees`,
      entonces recibe `403`; y `GET /api/admin/employees` responde `200` con
      `meta.canManage: false`, sin botón de alta ni columna de acciones en la UI.
- [x] AC4 — Dado un usuario con rol `manager` o `audit` —que sí abren el panel—,
      cuando abre `/admin/payroll`, entonces ve el `403` de
      `src/app/forbidden.tsx` y la entrada «Nómina» no aparece en la navegación.
- [x] AC5 — Dado un alta con un `employeeCode` que ya existe, entonces la
      respuesta es `409` con un mensaje que nombra el código duplicado, no `500`
      ni `400`.
- [x] AC6 — Dado un alta con `baseSalaryCents: 2500.5`, entonces la respuesta es
      `400` con `{ message, issues }`: el salario es un entero de céntimos y el
      contrato no admite decimales.
- [x] AC7 — Dado un empleado dado de baja (`DELETE`), entonces su fila sigue
      existiendo con `is_active = false`, sus pagos anteriores siguen siendo
      consultables y la baja es idempotente: repetirla devuelve `200` sin escribir
      una segunda entrada en la bitácora.
- [x] AC8 — Dado el listado de personal sin parámetros, entonces solo salen los
      empleados **activos** (`status` por defecto `active`), ordenados por
      apellido y nombre ascendente.
- [x] AC9 — Dado `search=50%_off`, entonces `%` y `_` se buscan como texto
      literal y no como comodines de `LIKE`; la búsqueda cubre código, nombre,
      apellido y nombre completo, y es insensible a mayúsculas.
- [x] AC10 — Dado un pago con `period` fuera del formato `AAAA-MM` —`2026-13`,
      `26-09`, `2026-9`—, entonces la respuesta es `400` con `issues`.
- [x] AC11 — Dado un empleado que ya tiene un pago **no anulado** del periodo
      `2026-09`, cuando se registra otro para el mismo periodo, entonces la
      respuesta es `409` nombrando el periodo, y en la base sigue habiendo un solo
      pago vivo de ese mes.
- [x] AC12 — Dado un pago anulado del periodo `2026-09`, cuando se registra uno
      nuevo para ese mismo periodo, entonces se acepta con `201`: el índice único
      es parcial y no cuenta las filas anuladas.
- [x] AC13 — Dado un empleado **inactivo**, cuando se intenta registrar un pago
      suyo, entonces la respuesta es `409` —el cuerpo es válido y lo que está en
      conflicto es el estado del recurso—, no `400` ni `404`.
- [x] AC14 — Dado un `paidAt` anterior a la fecha de ingreso del empleado,
      entonces la respuesta es `400` con un mensaje que explica el choque.
- [x] AC15 — Dada la anulación de un pago, entonces la fila conserva su
      `amount_cents` intacto, aparece en el listado con el badge «Anulado» y la
      operación es idempotente: anular lo ya anulado devuelve `200` sin escribir
      una segunda entrada en la bitácora.
- [x] AC16 — Dadas las cinco mutaciones del módulo, entonces cada una deja
      exactamente una fila en `audit_logs` con `severity: 'warning'`, escrita en
      la **misma transacción**: si la mutación revierte, el log también.
- [x] AC17 — Dada cualquier entrada de `audit_logs` escrita por este módulo,
      entonces **ni `changes` ni `metadata` contienen ningún importe**
      (`baseSalaryCents`, `amountCents`): un cambio de salario se registra como
      `salaryChanged: true`, no con las cifras (D-8).
- [x] AC18 — Dado un pago con `paidAt: '2026-09-01'`, entonces la tabla lo muestra
      como 1 de septiembre en cualquier huso horario del navegador: la fecha se
      formatea a partir de la cadena, sin pasar por `new Date()` (D-12).
- [x] AC19 — Dado que no hay ningún empleado dado de alta, entonces la pestaña
      Personal muestra un estado vacío con el botón de alta; y la pestaña Pagos,
      uno que explica que los pagos se registran desde la ficha del empleado, no
      un hueco en blanco ni un error.
- [x] AC20 — Dada la primera carga de cada pestaña, entonces la tabla muestra el
      esqueleto de `DataTable`; ante un fallo de red, el mensaje de error con
      «Reintentar».

## 5. Modelo de datos

**Dos tablas nuevas y una migración**, la `0007_lovely_dakota_north.sql` (el
número `0006` lo tomó el spec 017, implementado justo antes; ver la nota de T3).
Ninguna tabla existente cambia: `users`, `roles`, `user_roles` y `audit_logs` se
leen y escriben tal y como están.

### 5.1 `employees`

```ts
// src/server/db/schema/employee.ts — firma propuesta
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Identificador de planilla que teclea quien administra, igual que el SKU de
    // un producto. Es lo que impide dar de alta dos veces a la misma persona sin
    // necesidad de guardar su DNI (D-2).
    employeeCode: varchar('employee_code', { length: 30 }).notNull().unique(),
    firstName: varchar('first_name', { length: 120 }).notNull(),
    lastName: varchar('last_name', { length: 120 }).notNull(),
    // `job_title` y no `position`: `position` es una función de SQL estándar y
    // aunque Drizzle cita el identificador, el nombre invita a un bug de lectura.
    jobTitle: varchar('job_title', { length: 120 }).notNull(),
    // `date` y no `timestamptz`: una fecha de ingreso es un día del calendario,
    // no un instante. Con `mode: 'string'` entra y sale como 'YYYY-MM-DD' y nunca
    // se convierte en `Date` (D-11).
    hiredAt: date('hired_at', { mode: 'string' }).notNull(),
    // Céntimos enteros, como `price_cents` (CLAUDE.md §6). El punto decimal solo
    // existe en el `<input>` y en el formateo de la celda.
    baseSalaryCents: integer('base_salary_cents').notNull(),
    // Baja lógica. La fila nunca se borra: `payroll_payments` la referencia.
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('employees_is_active_idx').on(t.isActive),
    index('employees_last_name_idx').on(t.lastName),
  ],
);
```

**Sin columna `user_id`.** No hay relación con `users` ni con Clerk (D-1).

Los anchos de `varchar` no se exportan como constante —a diferencia de
`USER_TEXT_LENGTHS`— porque nadie trunca aquí: los valores llegan ya acotados por
Zod. Es el mismo criterio de `products`, que repite el `160` en el schema y en el
`.max()` con un comentario, y evita que un módulo de cliente importe un **valor**
desde `@/server/db/schema` y se lleve el schema entero al bundle.

### 5.2 `payroll_payments`

```ts
// src/server/db/schema/payroll-payment.ts — firma propuesta
export const payrollPayments = pgTable(
  'payroll_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `restrict`: los empleados se dan de baja, nunca se borran, así que hoy nada
    // dispara la cláusula. Deja escrito que un pago no puede quedar huérfano.
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    // 'AAAA-MM'. Ancho fijo: el orden lexicográfico coincide con el cronológico,
    // igual que la comparación de ISO 8601 de `adminOrderQuerySchema` (D-5).
    period: varchar('period', { length: 7 }).notNull(),
    paidAt: date('paid_at', { mode: 'string' }).notNull(),
    // Snapshot del importe pagado, independiente de `employees.base_salary_cents`:
    // una subida de sueldo posterior no debe reescribir lo que ya se pagó. Mismo
    // criterio que `order_items` congelando el precio (spec 007).
    amountCents: integer('amount_cents').notNull(),
    // Anulación lógica. `null` = pago vivo. No hay `updated_at`: la única
    // mutación posible es esta y su propia marca es la fecha (D-7).
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Un solo pago vivo por empleado y mes (AC11). Parcial: las filas anuladas no
    // cuentan, así que corregir un pago es anular y volver a registrar (AC12).
    uniqueIndex('payroll_payments_employee_period_active_idx')
      .on(t.employeeId, t.period)
      .where(sql`${t.voidedAt} is null`),
    index('payroll_payments_period_idx').on(t.period),
    index('payroll_payments_employee_id_idx').on(t.employeeId),
  ],
);
```

Ambas tablas se exportan desde el barrel `src/server/db/schema/index.ts`, que es
lo que lee drizzle-kit para generar la migración.

### 5.3 Catálogo de permisos (dato semilla, no migración)

`npm run db:seed` es idempotente: `seedPermissions` hace `onConflictDoUpdate` por
`code` y `seedRolePermissions`, `onConflictDoNothing`.

```ts
// src/lib/permissions.ts — dos entradas nuevas en PERMISSIONS (pasa de 19 a 21)
{
  code: 'payroll.read',
  resource: 'payroll',
  action: 'read',
  description: 'Ver el personal contratado y la bitácora de pagos de nómina.',
},
{
  code: 'payroll.manage',
  resource: 'payroll',
  action: 'manage',
  description: 'Dar de alta o de baja personal y registrar o anular pagos de nómina.',
},
```

Matriz rol × permiso resultante, verificada contra el `ROLE_PERMISSION_MATRIX`
real:

| Rol | `payroll.read` | `payroll.manage` |
|---|---|---|
| `super_admin` | sí | sí |
| `admin` | sí | sí |
| `manager` | **no** | no |
| `audit` | **no** | no |
| `employee`, `customer` | no | no |

`manager` y `audit` abren el panel y **no** ven este módulo: es el primer recurso
del catálogo con esa forma (D-4).

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/employees` | `payroll.read` | query: `search?`, `status?`, `page?`, `pageSize?` | `EmployeeListResponse` | 400, 401, 403, 500 |
| POST | `/api/admin/employees` | `payroll.manage` | `CreateEmployeeInput` | `EmployeeRow` (201) | 400, 401, 403, 409, 500 |
| PATCH | `/api/admin/employees/[id]` | `payroll.manage` | `UpdateEmployeeInput` (parcial) | `EmployeeRow` | 400, 401, 403, 404, 409, 500 |
| DELETE | `/api/admin/employees/[id]` | `payroll.manage` | — | `EmployeeRow` (`isActive: false`) | 400, 401, 403, 404, 500 |
| GET | `/api/admin/payroll` | `payroll.read` | query: `period?`, `search?`, `page?`, `pageSize?` | `PayrollListResponse` | 400, 401, 403, 500 |
| POST | `/api/admin/payroll` | `payroll.manage` | `CreatePayrollPaymentInput` | `PayrollPaymentRow` (201) | 400, 401, 403, 404, 409, 500 |
| DELETE | `/api/admin/payroll/[id]` | `payroll.manage` | — | `PayrollPaymentRow` (`status: 'voided'`) | 400, 401, 403, 404, 500 |

Errores con el contrato ya vigente de `src/lib/api-guard.ts`: `{ message }` y
`{ message, issues }` en el `400`, que es lo que espera el interceptor de
`src/lib/axios.ts`. Cero filas es `200` con `data: []`, nunca `404`.

El `DELETE` de empleado es **baja lógica** y el de pago es **anulación lógica**:
ninguno borra una fila. Los dos son idempotentes y devuelven `200` con el recurso
en su estado final (AC7, AC15).

### Zod de entrada — `src/modules/payroll/schemas/employee.schema.ts`

```ts
import { z } from 'zod';

import { PRICE_INPUT_PATTERN } from '@/modules/products/lib/price';

// Mismo criterio que `skuSchema`: lo teclea una persona, así que se normaliza el
// formato en vez de aceptar cualquier cadena.
export const employeeCodeSchema = z
  .string()
  .trim()
  .min(2, 'El código debe tener al menos 2 caracteres')
  .max(30, 'El código no puede superar 30 caracteres')
  .regex(/^[A-Z0-9][A-Z0-9-]*$/, 'Solo mayúsculas, números y guiones');

const employeeFields = z.object({
  employeeCode: employeeCodeSchema,
  firstName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  lastName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  jobTitle: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  // 'AAAA-MM-DD'. `z.iso.date()` y no `z.coerce.date()`: la columna es `date` en
  // modo string y así el valor no pasa nunca por un `Date` con huso (D-11).
  hiredAt: z.iso.date('Usa el formato AAAA-MM-DD'),
  baseSalaryCents: z
    .number()
    .int('El salario debe expresarse en céntimos enteros')
    .min(1, 'El salario debe ser mayor que cero')
    .max(99_999_999, 'El salario supera el máximo admitido'),
  isActive: z.boolean(),
});

export const createEmployeeSchema = employeeFields.extend({
  isActive: employeeFields.shape.isActive.default(true),
});

// Los `default` viven solo en el schema de alta: aplicados en los campos base,
// `.partial()` los seguiría inyectando en las claves ausentes de un PATCH (misma
// corrección que el spec 001, C2).
export const updateEmployeeSchema = employeeFields
  .partial()
  .refine((values) => Object.keys(values).length > 0, 'Debe enviar al menos un campo');

export const employeeIdSchema = z.uuid();

export const employeeQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  // Default `active` y no `all` como en productos: un ex empleado no forma parte
  // de la planilla de hoy y se acumula para siempre (D-14).
  status: z.enum(['all', 'active', 'inactive']).default('active'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Schema del formulario, distinto del de la API: el salario viaja como texto
// mientras se escribe. Mismo patrón y mismo `PRICE_INPUT_PATTERN` que el de
// producto, para que 2500.5 no se convierta en 250049.99… (spec 003).
export const employeeFormSchema = employeeFields.omit({ baseSalaryCents: true }).extend({
  baseSalary: z
    .string()
    .trim()
    .regex(PRICE_INPUT_PATTERN, 'Usa hasta 2 decimales, por ejemplo 2500.00'),
});

// `Input` es lo que viaja por la red, con los `default` todavía sin aplicar;
// `Values` es lo que el repositorio recibe ya normalizado. La misma pareja de
// nombres que usa `product.schema.ts`: el cliente tipa con `Input`, el servidor
// con `Values`.
export type CreateEmployeeInput = z.input<typeof createEmployeeSchema>;
export type CreateEmployeeValues = z.output<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.input<typeof updateEmployeeSchema>;
export type UpdateEmployeeValues = z.output<typeof updateEmployeeSchema>;
export type EmployeeQueryParams = z.output<typeof employeeQuerySchema>;
export type EmployeeFormValues = z.output<typeof employeeFormSchema>;
```

### Zod de entrada — `src/modules/payroll/schemas/payroll.schema.ts`

```ts
import { z } from 'zod';

import { PRICE_INPUT_PATTERN } from '@/modules/products/lib/price';

// 'AAAA-MM' con mes real: 2026-13 y 2026-00 se rechazan en el borde (AC10).
export const PAYROLL_PERIOD_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export const payrollPeriodSchema = z
  .string()
  .trim()
  .regex(PAYROLL_PERIOD_PATTERN, 'Usa el formato AAAA-MM, por ejemplo 2026-09');

export const createPayrollPaymentSchema = z.object({
  employeeId: z.uuid('Elige un empleado'),
  period: payrollPeriodSchema,
  paidAt: z.iso.date('Usa el formato AAAA-MM-DD'),
  amountCents: z
    .number()
    .int('El importe debe expresarse en céntimos enteros')
    .min(1, 'El importe debe ser mayor que cero')
    .max(99_999_999, 'El importe supera el máximo admitido'),
});

export const payrollPaymentIdSchema = z.uuid();

export const payrollQuerySchema = z.object({
  // Centinela `all` en vez de omitir el parámetro, por coherencia con
  // `categoryId` y `status` del resto del panel.
  period: z.union([z.literal('all'), payrollPeriodSchema]).default('all'),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const payrollPaymentFormSchema = z.object({
  period: payrollPeriodSchema,
  paidAt: z.iso.date('Usa el formato AAAA-MM-DD'),
  amount: z
    .string()
    .trim()
    .regex(PRICE_INPUT_PATTERN, 'Usa hasta 2 decimales, por ejemplo 2500.00'),
});

export type CreatePayrollPaymentInput = z.input<typeof createPayrollPaymentSchema>;
export type CreatePayrollPaymentValues = z.output<typeof createPayrollPaymentSchema>;
export type PayrollQueryParams = z.output<typeof payrollQuerySchema>;
export type PayrollPaymentFormValues = z.output<typeof payrollPaymentFormSchema>;
```

### Tipos de salida — `src/modules/payroll/types/`

```ts
// src/modules/payroll/types/employee.types.ts
import type { employees } from '@/server/db/schema';

// Inferido del schema Drizzle, no reescrito a mano (CLAUDE.md regla 5).
type EmployeeSelect = typeof employees.$inferSelect;

// `createdAt` y `updatedAt` fuera: son `Date` en el tipo y `string` en el JSON, y
// esa discrepancia ya es deuda declarada de `ProductListResponse` (spec 016 §11).
// Este módulo no la hereda: ningún campo `Date` viaja en sus respuestas (D-11).
export type EmployeeRow = Omit<EmployeeSelect, 'createdAt' | 'updatedAt'>;

export type EmployeeListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  // Resuelto en el servidor; la UI solo oculta controles. La frontera real es el
  // 403 de cada mutación (AC3).
  canManage: boolean;
};

export type EmployeeListResponse = { data: EmployeeRow[]; meta: EmployeeListMeta };
```

```ts
// src/modules/payroll/types/payroll.types.ts
import type { payrollPayments } from '@/server/db/schema';

import type { EmployeeListMeta } from './employee.types';

type PayrollPaymentSelect = typeof payrollPayments.$inferSelect;

// 'voided' no es un estado de la columna: lo deriva el servidor de `voidedAt`,
// igual que `resolveStockStatus` deriva el estado de stock (spec 016, D-9).
export type PayrollPaymentStatus = 'paid' | 'voided';

export type PayrollPaymentRow = Omit<PayrollPaymentSelect, 'voidedAt' | 'createdAt'> & {
  status: PayrollPaymentStatus;
  // Del join con `employees`: la tabla de pagos muestra a quién se le pagó y no
  // debe pedir una segunda petición por fila.
  employeeCode: string;
  employeeFullName: string;
};

export type PayrollListMeta = EmployeeListMeta;
export type PayrollListResponse = { data: PayrollPaymentRow[]; meta: PayrollListMeta };
```

### Forma de los handlers

Los siete siguen el preámbulo ya establecido: `authorize()` en la **primera
línea**, antes de leer la query o el cuerpo (AC2), y `toErrorResponse()` en el
`catch`.

```ts
// src/app/api/admin/payroll/route.ts — POST, forma propuesta
export async function POST(request: Request) {
  try {
    const { actor } = await authorize('payroll.manage');

    const body = await parseJsonBody(request, createPayrollPaymentSchema, 'Datos del pago inválidos');
    if (!body.ok) return body.response;

    // El service cruza dos repositorios (empleado + pago) y escribe la bitácora
    // dentro de la misma transacción. Lanza NotFoundError/ConflictError, que
    // `toErrorResponse` traduce (D-9).
    const payment = await payrollService.registerPayment({
      actor,
      context: getAuditContext(request),
      input: body.data,
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/admin/payroll',
      fallback: 'No se pudo registrar el pago',
      // Red de seguridad del índice parcial: si dos pestañas registran el mismo
      // periodo a la vez, el segundo INSERT cae aquí como 409, no como 500.
      uniqueViolationMessage: PAYROLL_CONFLICT_MESSAGES,
    });
  }
}
```

### Firmas de repositorio y de servicio

```ts
// src/server/repositories/employee.repository.ts
export function buildEmployeeFilters(
  params: Pick<EmployeeQueryParams, 'search' | 'status'>,
): SQL | undefined;
export async function findMany(
  params: EmployeeQueryParams,
  reader?: Reader,
): Promise<{ data: EmployeeRow[]; total: number }>;
export async function findById(id: string, reader?: Reader): Promise<EmployeeRow | null>;
export async function create(tx: Tx, values: CreateEmployeeValues): Promise<EmployeeRow>;
export async function update(
  tx: Tx,
  id: string,
  values: UpdateEmployeeValues,
): Promise<EmployeeRow | null>;
export async function setActive(tx: Tx, id: string, isActive: boolean): Promise<EmployeeRow | null>;

// src/server/repositories/payroll-payment.repository.ts
export function buildPayrollFilters(
  params: Pick<PayrollQueryParams, 'period' | 'search'>,
): SQL | undefined;
export async function findMany(
  params: PayrollQueryParams,
  reader?: Reader,
): Promise<{ data: PayrollPaymentRow[]; total: number }>;
export async function findById(id: string, reader?: Reader): Promise<PayrollPaymentRow | null>;
export async function findActiveByPeriod(
  employeeId: string,
  period: string,
  reader?: Reader,
): Promise<PayrollPaymentRow | null>;
export async function insert(tx: Tx, values: CreatePayrollPaymentValues): Promise<PayrollPaymentRow>;
export async function markVoided(tx: Tx, id: string): Promise<PayrollPaymentRow | null>;

// src/server/services/payroll.service.ts
type Command = { actor: User; context: AuditContext };
export async function registerPayment(
  command: Command & { input: CreatePayrollPaymentValues },
): Promise<PayrollPaymentRow>;
export async function voidPayment(
  command: Command & { paymentId: string },
): Promise<PayrollPaymentRow>;
```

## 7. Arquitectura y archivos afectados

- `src/server/db/schema/employee.ts` — **nuevo**: tabla `employees`.
- `src/server/db/schema/payroll-payment.ts` — **nuevo**: tabla `payroll_payments`.
- `src/server/db/schema/index.ts` — dos exports nuevos en el barrel.
- `drizzle/0007_*.sql` — **generado**: dos tablas, la FK, el índice único parcial
  y los tres índices simples.
- `src/lib/permissions.ts` — `payroll.read` y `payroll.manage` en `PERMISSIONS`
  (19 → 21) y en `super_admin` y `admin` de `ROLE_PERMISSION_MATRIX`.
- `src/server/repositories/employee.repository.ts` + `.test.ts` — **nuevo**.
- `src/server/repositories/payroll-payment.repository.ts` + `.test.ts` — **nuevo**.
- `src/server/services/payroll.service.ts` + `.test.ts` — **nuevo**: las reglas
  que cruzan repositorios y la escritura de bitácora de los pagos.
- `src/app/api/admin/employees/route.ts` — **nuevo**: `GET`, `POST`.
- `src/app/api/admin/employees/[id]/route.ts` — **nuevo**: `PATCH`, `DELETE`.
- `src/app/api/admin/payroll/route.ts` — **nuevo**: `GET`, `POST`.
- `src/app/api/admin/payroll/[id]/route.ts` — **nuevo**: `DELETE`.
- `src/modules/payroll/schemas/employee.schema.ts` + `.test.ts` — **nuevo**.
- `src/modules/payroll/schemas/payroll.schema.ts` + `.test.ts` — **nuevo**.
- `src/modules/payroll/types/employee.types.ts` — **nuevo**.
- `src/modules/payroll/types/payroll.types.ts` — **nuevo**.
- `src/modules/payroll/lib/payroll-dates.ts` + `.test.ts` — **nuevo**: puras
  (`currentPayrollPeriod`, `formatPeriodLabel`, `formatIsoDate`).
- `src/modules/payroll/lib/auditable-employee.ts` + `.test.ts` — **nuevo**: puras
  (`toAuditableEmployee`, `hasSalaryChange`), la frontera que impide que un
  importe llegue a `audit_logs` (D-8).
- `src/modules/payroll/constants.ts` — **nuevo**: `employeeKeys`, `payrollKeys`,
  tamaños de página, `PAYMENT_STATUS_LABELS`, mensajes de conflicto y copys.
- `src/modules/payroll/services/employee.service.ts` — **nuevo**: axios.
- `src/modules/payroll/services/payroll-payment.service.ts` — **nuevo**: axios.
  Nombre distinto del service de servidor (`payroll.service.ts`) a propósito.
- `src/modules/payroll/hooks/use-employees.ts` — **nuevo**.
- `src/modules/payroll/hooks/use-employee-mutations.ts` — **nuevo**.
- `src/modules/payroll/hooks/use-payroll-payments.ts` — **nuevo**.
- `src/modules/payroll/hooks/use-payroll-mutations.ts` — **nuevo**.
- `src/modules/payroll/components/employee-form-dialog.tsx` — **nuevo**.
- `src/modules/payroll/components/deactivate-employee-dialog.tsx` — **nuevo**.
- `src/modules/payroll/components/employee-columns.tsx` — **nuevo**.
- `src/modules/payroll/components/employees-table.tsx` — **nuevo**.
- `src/modules/payroll/components/payment-status-badge.tsx` — **nuevo**.
- `src/modules/payroll/components/register-payment-dialog.tsx` — **nuevo**.
- `src/modules/payroll/components/void-payment-dialog.tsx` — **nuevo**.
- `src/modules/payroll/components/payroll-payment-columns.tsx` — **nuevo**.
- `src/modules/payroll/components/payroll-payments-table.tsx` — **nuevo**.
- `src/modules/payroll/components/payroll-tabs.tsx` — **nuevo**: contenedor
  `"use client"` con las dos pestañas.
- `src/app/(admin)/admin/payroll/page.tsx` — **nuevo**: Server Component con
  `requirePagePermission('payroll.read')`.
- `src/app/(admin)/admin/layout.tsx` — entrada «Nómina» en `NAV_ITEMS`.
- `src/modules/audit/constants.ts` + `.test.ts` — cinco acciones nuevas, dos
  `entityType` y las etiquetas de campo del módulo.
- `docs/SETUP.md` — §5 (tablas nuevas) y §6 (módulo construido).

Flujo, capa por capa, sin saltos:

```
EmployeesTable / PayrollPaymentsTable ("use client")
  → useEmployees / useEmployeeMutations (TanStack Query)
    → employee.service (axios)
      → /api/admin/employees (authorize + Zod)
        → payroll.service (servidor) → employee.repository / payroll-payment.repository
          → Drizzle → Neon
```

Ningún componente importa `db`, Drizzle ni un repositorio, y ninguno llama a
axios directo. Estado de servidor en TanStack Query; el único estado de UI es la
pestaña activa y el diálogo abierto, ambos locales al contenedor: **no se añade
ningún store de Zustand** porque no hay estado de UI compartido entre ramas del
árbol.

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1**: `employees` es una tabla independiente, **sin FK a `users`** y sin exigir cuenta de Clerk | Una columna `user_id` nullable, o exigir que todo empleado tenga cuenta | Son dos dominios distintos: `users` responde «esta cuenta de Clerk existe» y `roles`/`permissions` responden «qué puede tocar en el panel»; ninguno de los dos dice nada sobre una relación laboral. Acoplarlos haría que borrar una cuenta de Clerk o cambiar un rol tuviera consecuencias sobre la nómina, y que dar de alta a alguien que no usa el sistema —almacén, limpieza, reparto— exigiera inventarle un correo. El rol `employee` del catálogo ya demuestra la confusión: se llama igual y su conjunto de permisos está **vacío**. Añadir después una columna `user_id` nullable es una migración de una línea; quitar un acoplamiento equivocado no |
| **D-2**: Los únicos datos personales son nombre, apellido, cargo, fecha de ingreso y salario. La identidad la da un `employee_code` que teclea el administrador | Guardar el DNI como identificador único natural | El DNI es PII sensible y su única función aquí sería evitar duplicados; un código de planilla hace ese trabajo sin meter en la base un dato que obliga a pensar en cifrado, retención y acceso. `products.sku` ya establece el patrón de «identificador que teclea quien administra», con su 409 de unicidad resuelto por el constraint |
| **D-3**: El módulo registra pagos, no los calcula | Motor de nómina con deducciones, AFP/ONP, EsSalud y quinta categoría | Es un dominio legal peruano que cambia por norma y por tramo, y equivocarse tiene consecuencias legales, no de UX. El usuario pidió un registro de personal y de pagos. La analogía correcta es `orders`: registra lo que se cobró, no calcula impuestos. Cuando haga falta, es su propio spec (§11) |
| **D-4**: `payroll.read` **no** se concede a `manager` ni a `audit` | Dárselo a `audit`, que hoy tiene lectura sobre todo lo demás | El salario es la cifra más sensible del panel y el criterio acordado es el mismo del spec 017: solo `super_admin` y `admin`. Es el primer recurso que rompe la regla implícita de «`audit` lo lee todo», y por eso hay que ser explícito: si esa regla se restaura sin pensar, la bitácora se convierte en la puerta trasera del salario (ver D-8) |
| **D-5**: Periodicidad mensual, `period` como `varchar(7)` 'AAAA-MM' | (a) `period_start` + `period_end` como rangos libres; (b) una columna `date` fijada al día 1 | Mensual es la planilla peruana estándar y es lo que permite el invariante que de verdad importa: **un solo pago vivo por empleado y mes**, expresable como índice único. Con rangos libres ese invariante exige comprobar solapamientos a mano y se cuela el primer día que alguien teclee mal. Con una columna `date` nada impide guardar `2026-09-17`, y el índice único dejaría pasar dos «pagos de septiembre» distintos en silencio. El ancho fijo además hace que el orden lexicográfico sea el cronológico, el mismo truco que ya usa `adminOrderQuerySchema` con ISO 8601 |
| **D-6**: El importe del pago es un snapshot independiente de `employees.base_salary_cents` | Derivar el importe del salario vigente al consultar | Mismo criterio que `order_items` congelando el precio (spec 007): una subida de sueldo en octubre no puede reescribir lo que se pagó en septiembre. El formulario propone el salario base como valor inicial y deja cambiarlo, que es lo que permite registrar un mes con un pago distinto sin tocar la ficha |
| **D-7**: Un pago se **anula** (`voided_at`), no se borra ni se edita | (a) `DELETE` físico de la fila; (b) `PATCH` del importe | Un registro financiero no se borra: se anula y se vuelve a registrar, y las dos operaciones quedan en la bitácora. El borrado físico además tendría un efecto de segundo orden malo: al desaparecer la fila, el único rastro del importe sería `audit_logs`, y habría que meterlo ahí — justo lo que D-8 prohíbe. La anulación lógica es lo que permite que la bitácora no contenga ni una cifra. El `PATCH` queda descartado porque cambiar en sitio una cifra financiera no deja ver que hubo una corrección |
| **D-8**: Ningún importe viaja a `audit_logs`. Un cambio de salario se registra como `metadata: { salaryChanged: true }` | Registrar `{ before: { baseSalaryCents }, after: { baseSalaryCents } }` como hace `product.updated` con el precio | Verificado en `audit-log-columns.tsx`: la bitácora **renderiza `changes` y `metadata` completos** a quien tenga `audit_logs.read`, y ese permiso lo tienen `audit` y `manager`… que por D-4 no tienen `payroll.read`. Escribir el salario en el log convertiría `/admin/audit-logs` en el listado de sueldos de toda la empresa para roles a los que se les acaba de negar. Es exactamente la regla dura 3 de `docs/SETUP.md` §5.2: los campos sensibles se enmascaran antes de serializar. Lo que la bitácora conserva es lo que le toca —quién, cuándo, sobre qué empleado y qué campo cambió—; la cifra vive en la tabla del dominio, protegida por su permiso. El saneado no es un `delete` suelto en el handler: es `toAuditableEmployee()`, pura y probada (T15) |
| **D-9**: El CRUD de empleados se orquesta en el Route Handler; los pagos, en `payroll.service.ts` | (a) Todo en los handlers; (b) un service también para empleados | La frontera de `docs/SETUP.md` §3 es «reglas de negocio que **cruzan repositorios**». El alta o la baja de un empleado toca un repositorio y su bitácora, igual que `products` y `categories`, que lo hacen en el handler. Registrar un pago cruza `employee.repository` (existe, está activo, cuándo ingresó) y `payroll-payment.repository`, igual que `user-access.service.ts` cruza usuarios y roles. Un service con un solo repositorio sería una capa sin consumidor propio |
| **D-10**: Dos permisos, `payroll.read` y `payroll.manage`, para las dos entidades | (a) `employees.*` + `payroll.*` con read/create/update/delete cada uno (7 códigos); (b) un solo `payroll.read` | Siete códigos que hoy se conceden y se revocan siempre juntos no separan nada: no existe el rol que administre personal sin ver sus pagos. Partir por `read` / `manage` sí separa algo real —consultar la planilla no es tocarla— y es lo que sostiene el `meta.canManage` de la UI (AC3). El nombre del recurso es el dominio (`payroll`), no la ruta: por eso `/api/admin/employees` se protege con un código `payroll.*` |
| **D-11**: `date` con `mode: 'string'` para `hired_at` y `paid_at`, y ningún campo `Date` en las respuestas | `timestamp with time zone`, como el resto de las tablas | Una fecha de ingreso y una fecha de pago son días del calendario, no instantes: con `timestamptz` heredaríamos entero el problema de huso que el spec 015 tuvo que resolver con un desfase fijo de Lima. En modo string el valor entra y sale como 'AAAA-MM-DD' sin pasar por ningún `Date`, y de paso el módulo no repite la deuda de `ProductWithCategory`, que declara `Date` en campos que el JSON entrega como `string` (spec 016 §11) |
| **D-12**: `formatIsoDate()` formatea a partir de la cadena, sin construir un `Date` | `new Date(paidAt).toLocaleDateString('es-PE')` | `new Date('2026-09-01')` se interpreta como medianoche **UTC**, así que en Lima (−05:00) se pinta como 31 de agosto. Es un bug silencioso que solo se ve en producción y solo para pagos del día 1 (AC18). Partir la cadena por `-` no tiene ese modo de fallo y es probable sin congelar el reloj |
| **D-13**: Sin ninguna lógica de huso horario en el servidor | Reutilizar `REPORTING_UTC_OFFSET_MINUTES` del dashboard | Aquí el servidor no **deriva** ninguna fecha de `now()`: el periodo y la fecha de pago son datos de entrada obligatorios del cuerpo. El único instante que pone el servidor es `created_at`. El valor inicial del formulario —mes actual, hoy— lo calcula el navegador con su fecha local, que en Perú es Lima. Importar la constante del dashboard invertiría la dependencia igual que denunció el spec 016 (D-2), y duplicarla garantizaría que un día discrepen |
| **D-14**: El listado de personal filtra por defecto `status: 'active'` | `'all'`, como `productQuerySchema` | Los ex empleados se acumulan para siempre y nunca son la respuesta a «a quién le toca cobrar». Productos puede permitirse `'all'` porque un producto desactivado se reactiva; una baja laboral, no. El filtro sigue existiendo para consultarlos |
| **D-15**: Registrar un pago a un empleado inactivo devuelve `409`, no `400` ni `404` | `400`, tratándolo como cuerpo inválido | El cuerpo es válido y el recurso existe: lo que está en conflicto es su estado. Es literalmente el mismo razonamiento con el que el spec 014 devuelve `409` al cancelar un pedido que ya no está `pending`, y conviene que las dos respuestas se parezcan |
| **D-16**: `paidAt` anterior a `hiredAt` devuelve `400` | No comprobarlo | Es el único invariante cruzado barato del módulo —el empleado ya se lee dentro de la transacción— y atrapa el error de tecleo más probable (el año). No se añaden más reglas de fecha: un pago adelantado o atrasado respecto del periodo es legítimo y validarlo sería inventar política |
| **D-17**: El pago se registra **desde la fila del empleado**, no desde un selector en la pestaña de pagos | Un diálogo en la pestaña Pagos con un `Select` de empleados | Elimina el selector entero y con él el problema de cómo listar 300 empleados en un `Select`; además permite proponer el salario base como importe inicial sin una segunda petición. Es el mismo movimiento que hizo inventario reutilizando el diálogo de producto desde la fila (spec 016, D-11). El estado vacío de la pestaña Pagos lo explica (AC19) |
| **D-18**: Una sola página con `Tabs` y una sola entrada de navegación «Nómina» | Dos rutas, `/admin/employees` y `/admin/payroll`, con dos entradas | Los dos permisos se conceden juntos y las dos vistas son el mismo dominio; dos entradas seguidas en una barra que ya tiene ocho añaden ruido sin añadir destino. La etiqueta es «Nómina» y no «Personal» porque «Usuarios» ya ocupa el significado «personas» en esa barra, y confundir las dos es justamente lo que §1 quiere evitar |
| **D-19**: Pre-comprobación del periodo dentro de la transacción **más** índice único parcial | Solo una de las dos | El índice es el que garantiza el invariante bajo concurrencia; la pre-comprobación es la que produce un mensaje que nombra el periodo en vez del genérico. Si el driver no expone el nombre del índice en el 23505, `conflictMessage()` cae a un mensaje genérico —sigue siendo `409`, nunca `500`—, así que el peor caso está acotado |
| **D-20**: `severity: 'warning'` en las cinco acciones del módulo | `'info'` para las altas y ediciones | `docs/SETUP.md` §5.2 liga la severidad a la retención: `info` se purga a los 180 días. Con `info`, el alta de un empleado desaparecería del historial mientras sus pagos siguen ahí, dejando una traza incoherente. Un solo criterio para todo el módulo evita tener que recordar cuál era cuál |
| **D-21**: `formatPrice`/`toCents`/`fromCents` se importan de `@/modules/products/lib/price` | Duplicarlos en `payroll/lib`, o mover el archivo a `src/lib/money.ts` | Verificado: ese archivo ya tiene consumidores en `cart`, `orders`, `dashboard` y `storefront`; de hecho es dinero compartido y no «precio de producto». Moverlo a `src/lib/` sería lo correcto, pero toca más de veinte archivos ajenos a esta feature y convertiría el diff en algo que el reviewer no puede separar. Se importa como ya hacen los demás y la mudanza queda anotada (§11) |
| **D-22**: `concat_ws(' ', first_name, last_name)` en la búsqueda, pese a que ambas columnas son `NOT NULL` | `first_name \|\| ' ' \|\| last_name` | Aquí `\|\|` sería seguro, pero `buildOrderFilters` ya resolvió esta misma búsqueda con `concat_ws` por el motivo contrario (allí sí hay nulos): una sola forma en el repositorio es una menos que verificar. La plantilla `sql` aparece **solo** en el `WHERE`, nunca reutilizada en `select`/`groupBy`/`orderBy`, así que no entra en la clase de bug del spec 015 (§10) |

## 9. Tareas

Orden natural: schema → migración → catálogo → repositorio → service → API →
módulo cliente → página → navegación → documentación.

- [x] **T1** — Tabla `employees` según §5.1, con sus dos índices, y su export en el
      barrel · archivos: `src/server/db/schema/employee.ts`,
      `src/server/db/schema/index.ts` · verificación: `npm run typecheck`
- [x] **T2** — Tabla `payroll_payments` según §5.2, con el índice único **parcial**
      `where voided_at is null`, los dos índices simples y su export en el barrel ·
      archivos: `src/server/db/schema/payroll-payment.ts`,
      `src/server/db/schema/index.ts` · verificación: `npm run typecheck`
- [x] **T3** — Generar y aplicar la migración `0006` · comando:
      `npm run db:generate && npm run db:migrate` · verificación: leer el `.sql`
      generado y confirmar que el índice único lleva la cláusula
      `WHERE "voided_at" IS NULL`; si drizzle-kit no la emite, corregir el `.sql`
      antes de migrar, porque sin ella AC12 es imposible

      > **Ejecutada como `0007_lovely_dakota_north.sql`, no como `0006`.** El spec 017
      > (resumen financiero) se implementó justo antes en la misma sesión y se llevó el
      > `0006_spotty_shadowcat.sql` de la tabla `expenses`; drizzle-kit numeró esta a
      > continuación sin colisión. Índice verificado leyendo el `.sql`, con la cláusula
      > parcial emitida tal cual: `CREATE UNIQUE INDEX
      > "payroll_payments_employee_period_active_idx" ON "payroll_payments" USING btree
      > ("employee_id","period") WHERE "payroll_payments"."voided_at" is null;`. AC12 es
      > posible.
- [x] **T4** — Añadir `payroll.read` y `payroll.manage` a `PERMISSIONS` (19 → 21) y
      repartirlos **solo** a `super_admin` y `admin` en `ROLE_PERMISSION_MATRIX`,
      con el comentario de por qué `audit` no los recibe (D-4) · archivo:
      `src/lib/permissions.ts` · verificación: `npm run typecheck && npm test`

      > **El catálogo va de 23 a 25, no de 19 a 21.** Este spec se redactó en paralelo
      > al 017, que entretanto añadió `finance.read` y `expenses.create/update/delete`.
      > La cuenta de partida cambió; el reparto no: los dos códigos nuevos siguen
      > yendo solo a `super_admin` y `admin`.
- [x] **T5** — Ejecutar el seed y comprobar que el catálogo queda en 21 permisos y
      que solo dos roles resuelven `payroll.read` · comando: `npm run db:seed` ·
      verificación: salida del seed + `npm run db:studio`

      > Comprobado contra Neon: `permissions` tiene 25 filas, el seed insertó 4
      > asignaciones nuevas (dos roles × dos códigos) y la consulta de
      > `role_permissions` sobre `payroll.%` devuelve exactamente `admin` y
      > `super_admin`. De paso se verificó el índice ya en la base:
      > `CREATE UNIQUE INDEX … USING btree (employee_id, period) WHERE (voided_at IS NULL)`.
- [x] **T6** — `employee.schema.ts` completo según §6 · archivo:
      `src/modules/payroll/schemas/employee.schema.ts` · verificación:
      `npm run typecheck`
- [x] **T7** — Tests del schema de empleado (patrón de `product.schema.test.ts`):
      query vacía → `{ status: 'active', page: 1, pageSize: 20 }`; código en
      minúsculas → error; `baseSalaryCents: 2500.5` → error (AC6);
      `baseSalaryCents: 0` → error; `hiredAt: '17-09-2026'` → error;
      `updateEmployeeSchema` con `{}` → error; `updateEmployeeSchema` con
      `{ jobTitle }` → válido y **sin** claves por defecto añadidas · archivo:
      `src/modules/payroll/schemas/employee.schema.test.ts` · verificación:
      `npm test`
- [x] **T8** — `payroll.schema.ts` completo según §6 · archivo:
      `src/modules/payroll/schemas/payroll.schema.ts` · verificación:
      `npm run typecheck`
- [x] **T9** — Tests del schema de nómina: `2026-13`, `2026-00`, `26-09` y `2026-9`
      → error (AC10); `2026-09` → válido; `period` ausente en la query → `'all'`;
      `amountCents: 0` → error; `pageSize=500` → error · archivo:
      `src/modules/payroll/schemas/payroll.schema.test.ts` · verificación:
      `npm test`
- [x] **T10** — Tipos `EmployeeRow`, `EmployeeListMeta` y `EmployeeListResponse`,
      inferidos de `typeof employees.$inferSelect` con `import type` · archivo:
      `src/modules/payroll/types/employee.types.ts` · verificación:
      `npm run typecheck`
- [x] **T11** — Tipos `PayrollPaymentStatus`, `PayrollPaymentRow`,
      `PayrollListMeta` y `PayrollListResponse` · archivo:
      `src/modules/payroll/types/payroll.types.ts` · verificación:
      `npm run typecheck`
- [x] **T12** — Funciones puras de fecha: `currentPayrollPeriod(now: Date): string`
      ('AAAA-MM' con la fecha local), `formatPeriodLabel(period: string): string`
      ('Septiembre 2026', vía `Intl` sobre `Date.UTC(y, m-1, 1)` formateado con
      `timeZone: 'UTC'`) y `formatIsoDate(value: string): string` partiendo la
      cadena, sin `new Date()` (D-12) · archivo:
      `src/modules/payroll/lib/payroll-dates.ts` · verificación: `npm run typecheck`
- [x] **T13** — Tests de `payroll-dates`: `formatIsoDate('2026-09-01')` devuelve el
      1 de septiembre (AC18); `formatPeriodLabel('2026-01')` devuelve enero y no
      diciembre del año anterior; `currentPayrollPeriod` con un `now` fijo devuelve
      el mes de ese `now`; un mes de un dígito se rellena a dos · archivo:
      `src/modules/payroll/lib/payroll-dates.test.ts` · verificación: `npm test`
- [x] **T14** — Funciones puras de saneado:
      `toAuditableEmployee(row: EmployeeRow): Omit<EmployeeRow, 'baseSalaryCents' | 'id'>`
      y `hasSalaryChange(before: EmployeeRow, after: EmployeeRow): boolean` (D-8) ·
      archivo: `src/modules/payroll/lib/auditable-employee.ts` · verificación:
      `npm run typecheck`
- [x] **T15** — Tests de `auditable-employee`: el objeto devuelto **no** tiene la
      clave `baseSalaryCents` —comprobado con `'baseSalaryCents' in result`, no
      solo con el tipo—; `hasSalaryChange` detecta el cambio y devuelve `false`
      cuando el PATCH no traía el campo (AC17) · archivo:
      `src/modules/payroll/lib/auditable-employee.test.ts` · verificación:
      `npm test`
- [x] **T16** — Repositorio de empleados: `buildEmployeeFilters()` exportada
      (`status` con las tres ramas, `search` con `escapeLikePattern` de
      `@/lib/utils` sobre código, nombre, apellido y `concat_ws`) y `findMany`,
      `findById`, `create`, `update`, `setActive` sobre la proyección
      `EMPLOYEE_COLUMNS` (sin `createdAt`/`updatedAt`), orden
      `last_name asc, first_name asc, id asc` · archivo:
      `src/server/repositories/employee.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T17** — Tests del repositorio de empleados con `PgDialect` (patrón exacto
      de `inventory.repository.test.ts`): `status: 'active'` añade
      `"is_active" = true`; `'inactive'`, el contrario; `'all'` no añade la
      columna; `50%_off` llega escapado como `%50\%\_off%` (AC9); la búsqueda
      genera los cuatro `ilike`; el orden es el de T16 · archivo:
      `src/server/repositories/employee.repository.test.ts` · verificación:
      `npm test`
- [x] **T18** — Repositorio de pagos: `buildPayrollFilters()` exportada (`period`
      con centinela `all`, `search` sobre los datos del empleado unido),
      `findMany` con el `innerJoin` a `employees`, el orden
      `period desc, paid_at desc, id desc` y el `status` derivado de `voidedAt` en
      TypeScript, más `findById`, `findActiveByPeriod`, `insert` y `markVoided` ·
      archivo: `src/server/repositories/payroll-payment.repository.ts` ·
      verificación: `npm run typecheck`
- [x] **T19** — Tests del repositorio de pagos con `PgDialect`: `period: 'all'` no
      añade `"period"`; `'2026-09'` sí y como parámetro; `findActiveByPeriod`
      incluye siempre `"voided_at" is null`; `markVoided` solo afecta a filas con
      `"voided_at" is null` (idempotencia de AC15); el mapeo de `status` devuelve
      `'voided'` con fecha y `'paid'` con `null` · archivo:
      `src/server/repositories/payroll-payment.repository.test.ts` ·
      verificación: `npm test`
- [x] **T20** — Service de servidor: `registerPayment()` —dentro de una única
      `db.transaction`: lee el empleado con el `tx`, `NotFoundError` si no existe,
      `ConflictError` si está inactivo (D-15), error de validación si
      `paidAt < hiredAt` (D-16), `ConflictError` si ya hay pago vivo del periodo
      (D-19), `insert` y `logAudit('payroll_payment.registered')` con
      `severity: 'warning'` y **sin importes**— y `voidPayment()` —lee, idempotente
      si ya está anulado (devuelve sin auditar), `markVoided` y
      `logAudit('payroll_payment.voided')`— · archivo:
      `src/server/services/payroll.service.ts` · verificación: `npm run typecheck`
- [x] **T21** — Tests del service (patrón de `user-access.service.test.ts`): el
      empleado inactivo lanza `ConflictError`; el duplicado de periodo lanza
      `ConflictError`; `paidAt` anterior al ingreso lanza el error de validación;
      la anulación repetida no escribe una segunda entrada de bitácora (AC15); y
      el `AuditInput` capturado **no contiene `amountCents`** en `changes` ni en
      `metadata` (AC17) · archivo:
      `src/server/services/payroll.service.test.ts` · verificación: `npm test`
- [x] **T22** — Route Handler `GET` + `POST` de empleados: `authorize()` primero,
      `safeParse` de la query / `parseJsonBody` del cuerpo, `db.transaction` con
      `create` + `logAudit('employee.created')`, `meta.canManage` con
      `can(granted, 'payroll.manage')`, `uniqueViolationMessage` con el mapa de
      conflictos y `toErrorResponse` en el `catch` · archivo:
      `src/app/api/admin/employees/route.ts` · verificación: `npm run build`
- [x] **T23** — Route Handler `PATCH` + `DELETE` de empleados: `before` leído con
      el `tx`, `404` si no existe, baja idempotente sin segunda entrada de
      bitácora (AC7), `logAudit('employee.updated' | 'employee.deactivated')` con
      `changes` saneado por `toAuditableEmployee()` y
      `metadata: { employeeCode, salaryChanged }` · archivo:
      `src/app/api/admin/employees/[id]/route.ts` · verificación: `npm run build`
- [x] **T24** — Route Handler `GET` + `POST` de nómina según §6, delegando el
      `POST` en `payrollService.registerPayment()` · archivo:
      `src/app/api/admin/payroll/route.ts` · verificación: `npm run build`
- [x] **T25** — Route Handler `DELETE` de nómina, delegando en
      `payrollService.voidPayment()` · archivo:
      `src/app/api/admin/payroll/[id]/route.ts` · verificación: `npm run build`
- [x] **T26** — Registrar en la bitácora las cinco acciones nuevas
      (`employee.created`, `employee.updated`, `employee.deactivated`,
      `payroll_payment.registered`, `payroll_payment.voided`), los dos
      `entityType` (`employee` → «Empleado», `payroll_payment` → «Pago de
      nómina»), sus opciones de filtro y las etiquetas de campo
      (`employeeCode`, `jobTitle`, `hiredAt`, `period`, `paidAt`,
      `salaryChanged`) · archivos: `src/modules/audit/constants.ts` y su `.test.ts`
      · verificación: `npm test`
- [x] **T27** — Constantes del módulo: `EMPLOYEE_PAGE_SIZE`, `PAYROLL_PAGE_SIZE`,
      `PAYROLL_SEARCH_DEBOUNCE_MS`, `PAYMENT_STATUS_LABELS`,
      `EMPLOYEE_CONFLICT_MESSAGES`, `PAYROLL_CONFLICT_MESSAGES`, los mensajes de
      404/409 del dominio, los copys de los estados vacíos (AC19) y las claves de
      caché `employeeKeys` y `payrollKeys` · archivo:
      `src/modules/payroll/constants.ts` · verificación: `npm run typecheck`
- [x] **T28** — Services de cliente: `employee.service.ts` (`fetchEmployees`,
      `createEmployee`, `updateEmployee`, `deactivateEmployee`) y
      `payroll-payment.service.ts` (`fetchPayrollPayments`, `registerPayment`,
      `voidPayment`), todos con la instancia de `@/lib/axios` · archivos: los dos
      en `src/modules/payroll/services/` · verificación: `npm run typecheck`
- [x] **T29** — Hooks de consulta: `useEmployees(params)` y
      `usePayrollPayments(params)` con `placeholderData: keepPreviousData` ·
      archivos: `src/modules/payroll/hooks/use-employees.ts` y
      `use-payroll-payments.ts` · verificación: `npm run typecheck`
- [x] **T30** — Hooks de mutación: `useCreateEmployee`, `useUpdateEmployee`,
      `useDeactivateEmployee` invalidando `employeeKeys.lists()`, y
      `useRegisterPayment`, `useVoidPayment` invalidando `payrollKeys.lists()`;
      todos con `toast` de éxito y de error como el resto del panel · archivos:
      `src/modules/payroll/hooks/use-employee-mutations.ts` y
      `use-payroll-mutations.ts` · verificación: `npm run typecheck`
- [x] **T31** — `EmployeeFormDialog`: React Hook Form + `employeeFormSchema`,
      salario como texto convertido con `toCents`/`fromCents`, alta y edición en
      el mismo diálogo (props `employee: EmployeeRow | null`), y el `409` del
      código duplicado marcado sobre el campo (AC5) · archivo:
      `src/modules/payroll/components/employee-form-dialog.tsx` · verificación:
      `npm run typecheck`
- [x] **T32** — `DeactivateEmployeeDialog` con `AlertDialog`, patrón de
      `delete-product-dialog.tsx`, explicando que la baja conserva el historial de
      pagos · archivo:
      `src/modules/payroll/components/deactivate-employee-dialog.tsx` ·
      verificación: `npm run typecheck`
- [x] **T33** — `getEmployeeColumns({ canManage, onEdit, onDeactivate, onRegisterPayment })`:
      código (`font-mono`), nombre, cargo, ingreso con `formatIsoDate`, salario con
      `formatPrice` y `tabular-nums`, badge de estado y —solo con `canManage`— la
      columna de acciones (AC3) · archivo:
      `src/modules/payroll/components/employee-columns.tsx` · verificación:
      `npm run typecheck`
- [x] **T34** — `EmployeesTable`: `"use client"`, buscador con `useDebounce`,
      `Select` de estado, reinicio de `page` al cambiar filtros,
      `manualPagination`/`manualFiltering`, `DataTable` con
      `isLoading`/`isError`/`onRetry`, estado vacío con botón de alta (AC19) y los
      tres diálogos · archivo:
      `src/modules/payroll/components/employees-table.tsx` · verificación:
      `npm run typecheck`
- [x] **T35** — `PaymentStatusBadge`: mapa total `Record<PayrollPaymentStatus, …>`,
      «Pagado» en tono neutro y «Anulado» destructivo, ambos con icono
      `aria-hidden` **y** texto visible, nunca solo color · archivo:
      `src/modules/payroll/components/payment-status-badge.tsx` · verificación:
      `npm run typecheck`
- [x] **T36** — `RegisterPaymentDialog`: recibe el empleado por props (D-17),
      propone `currentPayrollPeriod()`, hoy y el salario base como valores
      iniciales, y traduce el `409` de periodo duplicado a un mensaje sobre el
      campo `period` (AC11) · archivo:
      `src/modules/payroll/components/register-payment-dialog.tsx` ·
      verificación: `npm run typecheck`
- [x] **T37** — `VoidPaymentDialog` con `AlertDialog`, avisando de que la
      anulación no borra el registro · archivo:
      `src/modules/payroll/components/void-payment-dialog.tsx` · verificación:
      `npm run typecheck`
- [x] **T38** — `getPayrollPaymentColumns({ canManage, onVoid })`: periodo con
      `formatPeriodLabel`, empleado (nombre + código), fecha con `formatIsoDate`,
      importe con `formatPrice` y `tabular-nums`, badge de estado y —solo con
      `canManage` y sobre pagos vivos— la acción de anular · archivo:
      `src/modules/payroll/components/payroll-payment-columns.tsx` ·
      verificación: `npm run typecheck`
- [x] **T39** — `PayrollPaymentsTable`: `"use client"`, filtro de periodo con
      `<input type="month">` mapeado al centinela `all` cuando está vacío,
      buscador con `useDebounce`, `DataTable` con sus tres estados y el estado
      vacío que remite a la pestaña Personal (AC19) · archivo:
      `src/modules/payroll/components/payroll-payments-table.tsx` ·
      verificación: `npm run typecheck`
- [x] **T40** — `PayrollTabs`: `"use client"`, `Tabs` de shadcn con «Personal» y
      «Pagos», estado local de la pestaña activa, sin Zustand · archivo:
      `src/modules/payroll/components/payroll-tabs.tsx` · verificación:
      `npm run typecheck`
- [x] **T41** — Página `/admin/payroll` con
      `requirePagePermission('payroll.read')`, `metadata`, encabezado que explica
      qué es este módulo y qué no es (no es el listado de accesos) y
      `<PayrollTabs />` · archivo: `src/app/(admin)/admin/payroll/page.tsx` ·
      verificación: `npm run build`
- [x] **T42** — Entrada «Nómina» en `NAV_ITEMS`, detrás de «Pedidos» y delante de
      «Usuarios», con icono `Wallet` de lucide y `permission: 'payroll.read'`
      (AC4) · archivo: `src/app/(admin)/admin/layout.tsx` · verificación:
      `npm run typecheck`

      > **Implementada con el icono `HandCoins`, no con `Wallet`.** El spec 017
      > (resumen financiero) se implementó justo antes y su entrada «Finanzas» ya
      > ocupa `Wallet` en la misma barra; dos entradas contiguas con el mismo icono
      > anulan justamente la pista visual que el icono aporta. `HandCoins` mantiene
      > la familia semántica de dinero y se distingue de un vistazo. La posición,
      > la etiqueta y el permiso son los del spec.
- [x] **T43** — Documentar en `docs/SETUP.md`: §5 con una sección 5.4 «Personal y
      nómina» que deje escrita la separación respecto de `users`/`roles`, y §6 con
      el módulo construido (permisos, endpoints, periodicidad mensual, anulación
      lógica y la regla de que los importes no entran en la bitácora) · archivo:
      `docs/SETUP.md` · verificación: lectura
- [x] **T44** — Cierre:
      `npm run typecheck && npm run lint && npm test && npm run build` en verde y
      recorrido manual en navegador de AC4, AC5, AC7, AC11, AC12, AC13, AC15, AC17
      y AC19 con una cuenta `super_admin` y otra con rol `manager`. El recorrido
      manual no es opcional: el spec 015 documenta un bug de SQL que pasó
      typecheck, lint y 731 tests y que solo apareció al abrir la página; aquí el
      candidato equivalente es el índice único parcial de T3, que ningún test
      unitario ejerce · verificación: las cuatro órdenes + captura del recorrido.
      El recorrido manual lo confirmó el usuario con cuentas reales de Clerk
      (`super_admin` y `manager`). T44 cerrada

      > **Automatización en verde** (ejecutada de nuevo, completa, al cerrar):
      > `npm run typecheck` exit 0 · `npm run lint` exit 0 (0 errores, 12 avisos: los 10
      > preexistentes más 2 de `useReactTable`, la misma clase que ya emiten las otras
      > seis tablas del panel) · `npm test` 51 archivos, **995 tests**, 0 fallos ·
      > `npm run build` compiló, con `/admin/payroll` y las cuatro rutas de API en el
      > manifiesto.
      >
      > **El índice único parcial sí quedó ejercido contra Neon**, que es el riesgo que
      > §10 daba por descubierto. Sonda ejecutada dentro de una transacción revertida al
      > final (cero filas persistidas, comprobado después): el segundo pago vivo de
      > `2026-09` fue rechazado con 23505 y el constraint que reportó Postgres es
      > literalmente `payroll_payments_employee_period_active_idx` —así que
      > `PAYROLL_CONFLICT_MESSAGES` acierta la clave y el 409 lleva el mensaje del
      > periodo, no el genérico (AC11, D-19)—; tras marcar `voided_at`, el mismo mes
      > admitió un pago nuevo y quedó **una sola fila viva** de dos totales (AC12).
      >
      > **Pendiente y no sustituible por lo anterior:** el recorrido manual en navegador
      > de AC4, AC5, AC7, AC13, AC15, AC17 y AC19 con una cuenta `super_admin` y otra con
      > rol `manager`. Requiere dos sesiones de Clerk reales y no se puede automatizar
      > desde aquí. El motivo de que el spec lo exija sigue vigente: el bug del spec 015
      > pasó typecheck, lint y 731 tests y solo apareció al abrir la página.

## 10. Riesgos y consideraciones

- **El índice único parcial es el único punto que no cubre ningún test.** Los
  tests de repositorio renderizan SQL con `PgDialect`, no lo ejecutan, así que
  AC11 y AC12 dependen de que drizzle-kit emita la cláusula `WHERE` en la
  migración. Por eso T3 obliga a leer el `.sql` generado y T44 exige probarlo en
  el navegador. Sin la cláusula, el índice bloquearía también los pagos anulados
  y corregir un pago sería imposible.
- **Sin tests de integración contra Postgres.** Es el riesgo estructural que ya
  documentaron los specs 015 y 016. Mitigación aquí: ninguna consulta agrupa,
  ninguna plantilla `sql` se reutiliza entre cláusulas (D-22) y el estado del
  pago se deriva en TypeScript, no con un `CASE`.
- **Fuga de salario por la bitácora.** Es el riesgo de seguridad principal y
  tiene nombre: `audit_logs.read` lo tienen roles que **no** tienen
  `payroll.read`, y la vista de bitácora renderiza `changes` y `metadata`
  íntegros. Toda la mitigación está en D-8 y se comprueba en T15, T21 y AC17. Si
  alguien añade después una acción de nómina auditada, tiene que pasar por
  `toAuditableEmployee()` o repetir la comprobación: no hay nada en el tipo de
  `AuditInput` que lo impida, porque `changes` es `unknown`.
- **Un `PATCH` de salario no deja rastro de la cifra anterior.** Es el precio
  consciente de D-8: la bitácora dice que el salario cambió, quién y cuándo, pero
  no de cuánto a cuánto. Si un día hace falta ese rastro, la salida correcta es
  una tabla `employee_salary_history` protegida por `payroll.read`, no relajar lo
  que entra en `audit_logs`.
- **PII mínima pero real.** Nombre, cargo y salario de una persona identificable
  siguen siendo datos personales aunque no haya DNI. La protección es el permiso
  y nada más: no hay cifrado en reposo por columna ni enmascarado en la UI, y
  quien tenga `payroll.read` lo ve todo. Aceptado explícitamente; el siguiente
  paso, si el equipo crece, es un permiso separado para ver importes.
- **`ilike '%texto%'` no usa índice.** Igual que la búsqueda de productos, la de
  clientes en pedidos y la de inventario. Mismo umbral de dolor y misma salida
  futura (`pg_trgm`). Con plantillas de decenas o centenares de filas es
  irrelevante.
- **Carrera entre registrar y anular.** Dos pestañas pueden anular el mismo pago
  a la vez; `markVoided` filtra `voided_at is null`, así que la segunda no cambia
  nada y la operación es idempotente (AC15). En el registro, la carrera la corta
  el índice único (D-19).
- **Desbordamiento de enteros.** Aquí no hay agregados —este spec no suma
  importes—, así que no aplica el `::bigint` que necesitó el dashboard. Si el
  spec 017 suma los pagos de nómina como gasto, tendrá que castear: `integer`
  desborda a partir de ~21 500 000 PEN acumulados (spec 015).
- **Rollback.** La migración `0007` solo **añade** dos tablas, así que revertir es
  `DROP TABLE payroll_payments; DROP TABLE employees;` en ese orden por la FK,
  más retirar los dos códigos del catálogo. Ningún dato existente se toca, así
  que el rollback no puede perder nada previo a este spec.
- **Ventana entre el código y el seed.** Hasta que T5 corre, `payroll.read` no
  existe en la tabla `permissions` y **nadie** —ni `super_admin`— abre la página:
  `getEffectivePermissions()` resuelve contra la base, no contra el catálogo en
  código. Por eso T5 va inmediatamente detrás de T4.
- **Sin caché de servidor.** Vista de administración autenticada y por usuario:
  nada de `revalidate` ni `s-maxage`, y ningún `refetchInterval` —los datos de
  nómina cambian cuando alguien los cambia, no solos—.

## 11. Fuera de alcance / deuda aceptada

- **Cálculo real de nómina (Perú).** Deducciones de AFP u ONP, EsSalud, renta de
  quinta categoría, gratificaciones de julio y diciembre, CTS, asignación
  familiar, horas extra y descuentos por tardanza. Es un dominio legal con reglas
  que cambian por norma y por tramo, y modelarlo mal tiene consecuencias legales,
  no solo de producto. Si se necesita, es su propio spec, con su propio modelo
  (`payroll_runs`, `payroll_concepts`, `payroll_lines`) y con este registro como
  el caso degenerado de un solo concepto. Lo que hoy existe es una bitácora de
  pagos, análoga a `orders` para los ingresos.
- **Integración con el resumen financiero (spec 017).** Los pagos de nómina son
  un gasto y tendría sentido que aparecieran como una línea del resumen. **No se
  implementa aquí** para no duplicar el trabajo del 017 ni acoplarlo a un spec
  que aún no está aprobado. El enganche natural es una lectura agregada
  `sum(amount_cents) where voided_at is null group by period` desde el
  repositorio de nómina, expuesta al módulo de finanzas por una función de
  servidor, nunca por un import de tabla cruzado — y casteando a `::bigint`.
- **Vínculo empleado ↔ cuenta de usuario.** Sin columna `user_id`. Cuando exista
  un caso real —que el empleado vea sus propios pagos, o que el alta de personal
  dispare la invitación al panel—, la migración es una columna `uuid` nullable con
  `unique` y FK a `users`, más una regla de negocio nueva sobre qué pasa si la
  cuenta se desactiva. Se difiere porque hoy nadie ha pedido ese caso y la unión
  es irreversible en la práctica: una vez que el código asume que un empleado es
  un usuario, deja de poder existir el empleado sin cuenta.
- **Periodicidad quincenal o semanal.** El modelo asume un pago vivo por mes. El
  camino, si hace falta, es añadir una columna `sequence` al índice único o
  sustituir `period` por un rango; ambas son migraciones, no rediseños.
- **Recibo de pago descargable y exportación a CSV.** No hay generación de
  documentos. El día que se necesite una boleta formal, es un problema de
  plantilla y de firma, no de este modelo.
- **Historial de salarios.** Solo se conserva el salario vigente; los importes
  pagados quedan como rastro indirecto. Ver §10 para la salida
  (`employee_salary_history`).
- **`price.ts` sigue viviendo en `src/modules/products/lib/`** pese a tener ya
  consumidores en seis módulos. Mover el archivo a `src/lib/money.ts` es lo
  correcto y toca más de veinte archivos ajenos a esta feature (D-21). Se retoma
  como tarea de mantenimiento propia, no colgando de un spec de producto.
- **Pestaña no enlazable.** La pestaña activa es estado local: `/admin/payroll`
  siempre abre en «Personal» y no se puede compartir un enlace directo a «Pagos».
  Se resolvería con un parámetro de búsqueda; se difiere porque son dos pestañas
  y el coste de llegar a la segunda es un clic.
- **Sin paginación por cursor.** `count()` + `OFFSET`, igual que pedidos,
  productos e inventario. Con decenas de miles de empleados —escenario que
  significaría otra empresa— habría que cambiarlo.
