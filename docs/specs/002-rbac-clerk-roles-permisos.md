---
id: 002
title: RBAC — integración de Clerk con roles y permisos en Postgres
status: in-review
module: auth
scope: admin
created: 2026-08-31
---

# 002 — RBAC: integración de Clerk con roles y permisos en Postgres

## 1. Contexto

Clerk ya está instalado y **la autenticación funciona**: `src/proxy.ts` con
`clerkMiddleware()` sin lógica de auth, `ClerkProvider` en `src/app/layout.tsx`,
páginas `(auth)/sign-in/[[...sign-in]]` y `(auth)/sign-up/[[...sign-up]]` con los
componentes prebuilt, y `src/components/shared/site-header.tsx` con
`Show`/`SignInButton`/`SignUpButton`/`UserButton`. **No falta ningún componente de
autenticación.** El `UserButton` ya abre el portal de cuenta de Clerk (email,
contraseña, sesiones) para cualquier usuario con sesión, así que tampoco falta una
vista de perfil (§8).

Lo que falta es la **autorización**. Verificado en el repo: la única tabla es
`categories`; no existen `users`, `roles`, `permissions`, `role_permissions`,
`user_roles` ni `audit_logs`; `src/lib/` contiene solo `axios.ts`, `constants.ts`,
`query-client.ts` y `utils.ts`. En consecuencia, todo `/admin/**` y
`/api/admin/categories/**` está abierto sin sesión — es la deuda **D1** registrada
en `docs/specs/001-admin-categories-crud.md` §11, con su plan de retiro ya escrito.

Este spec construye la capa que `docs/SETUP.md` §5.1, §5.2 y §6 ya diseñó, retira
D1 y añade el panel para que un administrador no técnico invite usuarios y les
asigne roles.

## 2. Objetivo

Un administrador puede invitar personas por email y asignarles roles desde
`/admin/users`, de modo que cada página, Route Handler y mutación del panel se
autorice por código de permiso contra Postgres y deje traza en `audit_logs`,
mientras que quien no tiene ningún permiso de administración ni siquiera alcanza
el panel.

## 3. Alcance

### Incluye

- 6 tablas nuevas: `users`, `roles`, `permissions`, `role_permissions`,
  `user_roles`, `audit_logs` + enum `audit_severity` + migración.
- Seed idempotente: 6 roles de sistema, 11 permisos, matriz `role_permissions`, y
  bootstrap del primer `super_admin` vía `SEED_SUPER_ADMIN_EMAIL`.
- `src/lib/permissions.ts` (catálogo puro), `src/lib/auth.ts` (`requirePermission`,
  set de permisos efectivo) y `src/lib/audit.ts` (`logAudit` transaccional).
- Repositorios `user`, `role`, `permission`, `audit-log`.
- Webhook `POST /api/webhooks/clerk` (`user.created` / `user.updated` /
  `user.deleted`) que sincroniza `users` y aplica los roles de la invitación.
- **Retrofit de auth sobre categorías**: guard en layout y page, `401`/`403` en los
  4 handlers, `logAudit` en las 3 mutaciones. Cierra D1.
- Guard del panel: el layout de admin redirige a `/` a todo usuario cuyo set
  efectivo de permisos esté vacío.
- Panel `/admin/users`: tabla, invitación por email, asignación de roles con
  checkboxes, activar/desactivar.
- Panel `/admin/roles`: matriz rol × permiso de **solo lectura**.
- Panel `/admin/audit-logs`: bitácora filtrable de solo lectura.
- Navegación lateral del admin filtrada por permiso.

### No incluye (explícito)

- **CRUD de roles y permisos desde la UI.** Los 6 roles y los 11 permisos nacen del
  seed. `/admin/roles` es una vista de consulta.
- **Overrides de permisos por usuario individual.** Los permisos se otorgan solo a
  nivel de rol.
- **Ninguna página de perfil propia.** El `UserButton` de Clerk ya cubre la gestión
  de cuenta de `employee` y `customer` (§8).
- **Ningún acceso de lectura al panel para `employee`.** Este rol queda con cero
  permisos, igual que `customer`; ambos son redirigidos fuera de `/admin/**`.
- **Caché del set de permisos en `publicMetadata` de Clerk.** `docs/SETUP.md` §5.1
  lo marca como opcional y derivado; Postgres es la fuente de verdad.
- **Retención / purga automática de `audit_logs`.** Requiere un cron que el
  proyecto no tiene.
- Contraseñas manuales creadas por el admin: el alta es siempre por invitación.
- Clerk Organizations, multi-tenant, SSO empresarial.
- Auditoría de intentos de acceso denegados (`auth.forbidden`).
- Edición del email o del nombre de un usuario desde el panel (eso vive en Clerk).
- Tests automatizados: el proyecto sigue sin runner (spec 001 §11 D2).

## 4. Criterios de aceptación

- [x] **AC1** — Dado un visitante sin sesión, cuando abre `/admin/categories`,
  entonces recibe `307` hacia `/sign-in?redirect_url=…` y no ve la tabla.
  *(Verificado en fase 3 / T25 con `curl` contra `npm run dev`.)*
- [x] **AC2** — Dado un visitante sin sesión, cuando llama
  `GET /api/admin/categories` con `Accept: application/json`, entonces recibe
  `401` con cuerpo `{ message }` — **nunca** un `307` ni HTML del formulario.
  *(Verificado en fase 3 / T23, y extendido a los 5 handlers de categorías.)*
- [ ] **AC3** — Dado un usuario autenticado sin ningún permiso de administración
  —sea `customer`, sea `employee`, sea alguien sin fila en `user_roles` que cae al
  default `customer`—, cuando llama **cualquier** endpoint de `/api/admin/**`, sea
  lectura o mutación, entonces recibe `403` con `{ message }`.
- [ ] **AC4** — Dado un `employee` o un `customer` con sesión activa, cuando abre
  `/admin` o cualquier ruta bajo `/admin/**`, entonces el layout lo redirige a `/`
  y no llega a ver el shell del panel — ni siquiera vacío. Su gestión de cuenta
  sigue disponible en el `UserButton` de la cabecera.
- [ ] **AC5** — Dado un `manager`, cuando abre `/admin`, entonces la navegación
  muestra Categorías, Usuarios y Roles, y **no** muestra Bitácora.
- [ ] **AC6** — Dado un `admin` en `/admin/users`, cuando invita a
  `nuevo@ejemplo.com` con el rol `manager`, entonces la API responde `201`, Clerk
  envía el correo de invitación y aparece un toast de éxito.
- [ ] **AC7** — Dado que esa persona acepta la invitación y completa el registro
  (contraseña propia o Google), cuando el webhook `user.created` llega, entonces
  existe una fila en `users` con su `clerk_id` y una fila en `user_roles` con el
  rol `manager`, sin intervención manual.
- [ ] **AC8** — Dado un email ya invitado o ya registrado, cuando el admin vuelve a
  invitarlo, entonces la API responde `409` con un mensaje en lenguaje llano y el
  diálogo no se cierra.
- [ ] **AC9** — Dado un `admin` (no `super_admin`) en el diálogo de roles, cuando
  lo abre, entonces los checkboxes de `admin` y `super_admin` están deshabilitados
  con un texto que explica por qué; y si fuerza la petición
  `PUT /api/admin/users/:id/roles` incluyendo `admin`, entonces recibe `403`.
- [ ] **AC10** — Dado cualquier actor, cuando intenta cambiar **sus propios** roles
  o desactivarse a sí mismo, entonces la fila propia aparece marcada como "Tú" con
  los controles deshabilitados, y la API responde `403` si se fuerza la petición.
- [ ] **AC11** — Dado un `super_admin` que cambia los roles de otro usuario, cuando
  la operación termina, entonces existe **una** fila en `audit_logs` con
  `action = 'user.roles_changed'`, `severity = 'warning'` y
  `changes = { before: { roleSlugs }, after: { roleSlugs } }`.
- [ ] **AC12** — Dado que la escritura de `audit_logs` falla, cuando se estaba
  cambiando un rol o creando una categoría, entonces la mutación **revierte
  completa** y la API responde `500`: log y mutación comparten transacción.
- [ ] **AC13** — Dado un usuario con `is_active = false`, cuando llama cualquier
  endpoint de `/api/admin/`, entonces recibe `403` aunque su sesión de Clerk siga
  viva.
- [ ] **AC14** — Dado un usuario con `audit_logs.read` en `/admin/audit-logs`,
  cuando filtra por actor, entidad, acción o rango de fechas, entonces la tabla se
  resuelve en servidor y la bitácora **no ofrece ninguna acción de edición o
  borrado**.
- [ ] **AC15** — Dado un usuario con `roles.read` en `/admin/roles`, entonces ve la
  matriz de 6 roles × 11 permisos en modo lectura, sin controles de escritura.
- [ ] **AC16** — Dado `SEED_SUPER_ADMIN_EMAIL` apuntando a un email ya presente en
  `users`, cuando se ejecuta `npm run db:seed` dos veces seguidas, entonces ese
  usuario queda con rol `super_admin` y la segunda ejecución no duplica filas ni
  falla.
- [ ] **AC17** — Dado un webhook con firma inválida, cuando llega a
  `/api/webhooks/clerk`, entonces la respuesta es `400` y no se escribe nada en la
  base de datos.
- [x] **AC18** — `npm run typecheck && npm run lint && npm run build` en verde al
  cierre de **cada fase**, no solo al final.

## 5. Modelo de datos

6 tablas nuevas y 1 enum. **Requiere migración** (`npm run db:generate` +
`npm run db:migrate`). Ninguna tabla existente cambia de forma: `categories` queda
intacta.

Convención copiada de `src/server/db/schema/category.ts` (verificada): un archivo
por tabla, `uuid('id').primaryKey().defaultRandom()`, columnas camelCase mapeadas a
snake_case por literal explícito, `timestamp(..., { withTimezone: true })` y
`.$onUpdate(() => new Date())` en `updated_at`, y la forma
`pgTable(name, columns, (t) => [index(...)])`.

### 5.1 `users` — espejo local de Clerk

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | `uuid` | PK, `defaultRandom()` |
| `clerk_id` | `varchar(64)` | not null, **unique** |
| `email` | `varchar(255)` | not null |
| `first_name` | `varchar(120)` | nullable |
| `last_name` | `varchar(120)` | nullable |
| `image_url` | `varchar(500)` | nullable |
| `is_active` | `boolean` | not null, default `true` |
| `created_at` / `updated_at` | `timestamptz` | not null, default `now()` |

Índices: `users_email_idx`, `users_is_active_idx`, `users_created_at_idx` (desc).

`email` **no** es unique a propósito: si alguien borra su cuenta de Clerk y vuelve
a registrarse con el mismo correo, obtiene un `clerk_id` nuevo y el webhook debe
poder insertar la fila sin colisionar con la histórica, que se conserva porque
`audit_logs.actor_id` la referencia. `clerk_id` es la clave de identidad.

### 5.2 `roles`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `slug` | `varchar(40)` | not null, **unique** |
| `name` | `varchar(80)` | not null — etiqueta en español para la UI |
| `description` | `text` | nullable — explicación en lenguaje llano |
| `is_system` | `boolean` | not null, default `true` |
| `is_elevated` | `boolean` | not null, default `false` |
| `created_at` / `updated_at` | `timestamptz` | not null |

`is_elevated` marca los roles cuyo otorgamiento requiere
`users.assign_elevated_roles` (ver §8, decisión sobre `admin`/`super_admin`).

### 5.3 `permissions`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `code` | `varchar(80)` | not null, **unique** — formato `<recurso>.<accion>` |
| `resource` | `varchar(40)` | not null |
| `action` | `varchar(40)` | not null |
| `description` | `text` | nullable |
| `created_at` | `timestamptz` | not null |

Índice: `permissions_resource_idx`. Sin `updated_at`: es una tabla semilla que solo
se inserta desde `db:seed` (`docs/SETUP.md` §5.1, regla dura 4).

### 5.4 `role_permissions` (pivote)

`role_id` → `roles.id` (`onDelete: cascade`), `permission_id` → `permissions.id`
(`onDelete: cascade`). PK compuesta `(role_id, permission_id)` vía
`primaryKey({ columns: [...] })`. Índice extra
`role_permissions_permission_id_idx` para el sentido inverso del join.

### 5.5 `user_roles` (pivote)

`user_id` → `users.id` (`onDelete: cascade`), `role_id` → `roles.id`
(`onDelete: restrict` — un rol de sistema no debe poder borrarse dejando huérfanas
las asignaciones), `assigned_by` → `users.id` nullable (`onDelete: set null`),
`assigned_at` `timestamptz` not null default `now()`. PK compuesta
`(user_id, role_id)`. Índice `user_roles_role_id_idx`.

### 5.6 `audit_logs`

Exactamente las columnas e índices de `docs/SETUP.md` §5.2:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `uuid` | PK |
| `actor_id` | `uuid` fk `users.id` nullable, `onDelete: set null` | null = sistema/webhook |
| `action` | `text` not null | `user.roles_changed`, `category.created`, … |
| `entity_type` | `text` not null | `user`, `category`, `role` |
| `entity_id` | `text` nullable | |
| `changes` | `jsonb` nullable | `.$type<{ before: unknown; after: unknown }>()` |
| `metadata` | `jsonb` nullable | `.$type<Record<string, unknown>>()` |
| `ip_address` | `inet` nullable | |
| `user_agent` | `text` nullable | |
| `severity` | `audit_severity` not null, default `'info'` | enum `info` \| `warning` \| `error` |
| `created_at` | `timestamptz` not null default `now()` | |

Índices: `audit_logs_entity_idx` `(entity_type, entity_id)`,
`audit_logs_actor_created_at_idx` `(actor_id, created_at desc)`,
`audit_logs_action_idx` `(action)`, `audit_logs_created_at_idx` `(created_at desc)`.

Sin `updated_at`: la tabla es append-only.

```ts
// src/server/db/schema/audit-log.ts — firma propuesta
export const auditSeverity = pgEnum('audit_severity', ['info', 'warning', 'error']);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    changes: jsonb('changes').$type<{ before: unknown; after: unknown }>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    severity: auditSeverity('severity').notNull().default('info'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_actor_created_at_idx').on(t.actorId, t.createdAt.desc()),
    index('audit_logs_action_idx').on(t.action),
    index('audit_logs_created_at_idx').on(t.createdAt.desc()),
  ],
);
```

`inet`, `jsonb`, `pgEnum` y `primaryKey` se comprobaron presentes en
`drizzle-orm@0.45.2/pg-core` ejecutando el import en este repo.

### 5.7 Catálogo semilla

**11 permisos** (`<recurso>.<accion>`):

`categories.read` · `categories.create` · `categories.update` ·
`categories.delete` · `users.read` · `users.invite` · `users.update` ·
`users.assign_roles` · `users.assign_elevated_roles` · `roles.read` ·
`audit_logs.read`

No hay `roles.create/update/delete`: no existe UI que los consuma en v1 y un
permiso sin consumidor es código muerto (CLAUDE.md §6).

**6 roles de sistema** (`is_system = true`) y su matriz:

| Rol (`slug`) | `is_elevated` | categories.read | categories.create/update/delete | users.read | users.invite/update/assign_roles | users.assign_elevated_roles | roles.read | audit_logs.read |
|---|---|---|---|---|---|---|---|---|
| `super_admin` | sí | ✓ | ✓ | ✓ | ✓ | **✓** | ✓ | ✓ |
| `admin` | sí | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| `manager` | no | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `employee` | no | — | — | — | — | — | — | — |
| `customer` | no | — | — | — | — | — | — | — |
| `audit` | no | ✓ | — | ✓ | — | — | ✓ | ✓ |

`super_admin` y `admin` son idénticos salvo `users.assign_elevated_roles`, que es
la traducción a código de permiso de la regla "solo un `super_admin` otorga o
revoca `admin`/`super_admin`" (§8).

**`employee` y `customer` tienen el conjunto vacío.** Solo cuatro roles —
`super_admin`, `admin`, `manager` y `audit` — abren el panel. En el catálogo de
`src/lib/permissions.ts` ambos se declaran con un array literalmente vacío
(`employee: []`, `customer: []`), y el seed no inserta ninguna fila de
`role_permissions` para ellos. La consecuencia funcional está en §8 y se verifica
en AC3 y AC4.

Un usuario sin filas en `user_roles` se trata como `customer`. Ese default es
**implícito y no tiene constante**: como `customer` no otorga ningún permiso, "sin
rol" y "rol `customer`" resuelven el mismo conjunto vacío, y
`getEffectivePermissions()` devuelve ese conjunto sin necesitar una segunda
consulta que distinga ambos casos. La constante `DEFAULT_ROLE_SLUG` existió en la
fase 1 y se retiró en la fase 3 al quedarse sin consumidores (CLAUDE.md §6: nada
de código muerto); el comentario que la sustituye en `src/lib/permissions.ts` deja
escrito que, si algún día `customer` otorga algo, ese default vuelve a ser una
consulta explícita dentro de `getEffectivePermissions()`.

## 6. Contratos de API

Forma de error uniforme `{ message: string }` (+ `{ message, issues }` en los `400`
de Zod), que es lo que ya normaliza el interceptor de `src/lib/axios.ts`
(verificado en el repo).

Códigos de auth, según `docs/SETUP.md` §6 y la referencia `api-routes.md` de la
skill `clerk-nextjs-patterns`: **401 = sin sesión**, **403 = con sesión pero sin
permiso**.

| Método | Ruta | Permiso | Request | Response | Errores |
|---|---|---|---|---|---|
| POST | `/api/webhooks/clerk` | público (firma svix) | evento Clerk | `200` `'OK'` | 400 |
| GET | `/api/admin/categories` | `categories.read` | query existente | `CategoryListResponse` | 400, 401, 403, 500 |
| POST | `/api/admin/categories` | `categories.create` | `CreateCategoryInput` | `201` `Category` | 400, 401, 403, 409, 500 |
| GET | `/api/admin/categories/[id]` | `categories.read` | — | `Category` | 400, 401, 403, 404, 500 |
| PATCH | `/api/admin/categories/[id]` | `categories.update` | `UpdateCategoryInput` | `Category` | 400, 401, 403, 404, 409, 500 |
| DELETE | `/api/admin/categories/[id]` | `categories.delete` | — | `Category` | 400, 401, 403, 404, 500 |
| GET | `/api/admin/users` | `users.read` | query: `q`, `status`, `role`, `page`, `pageSize`, `sortBy`, `sortDir` | `UserListResponse` | 400, 401, 403, 500 |
| POST | `/api/admin/users` | `users.invite` | `InviteUserInput` | `201` `InvitationResult` | 400, 401, 403, 409, 502 |
| PATCH | `/api/admin/users/[id]` | `users.update` | `{ isActive: boolean }` | `UserWithRoles` | 400, 401, 403, 404, 500 |
| PUT | `/api/admin/users/[id]/roles` | `users.assign_roles` | `{ roleSlugs: RoleSlug[] }` | `UserWithRoles` | 400, 401, 403, 404, 500 |
| GET | `/api/admin/roles` | `roles.read` | — | `RolesResponse` | 401, 403, 500 |
| GET | `/api/admin/audit-logs` | `audit_logs.read` | query: `actorId`, `entityType`, `action`, `severity`, `from`, `to`, `page`, `pageSize` | `AuditLogListResponse` | 400, 401, 403, 500 |

Ningún endpoint de `/api/admin/**` es alcanzable por `employee` ni por `customer`:
sus permisos requeridos no están en la matriz de esos roles (AC3).

### Schemas Zod

```ts
// src/modules/users/schemas/user.schema.ts
export const roleSlugSchema = z.enum([
  'super_admin', 'admin', 'manager', 'employee', 'customer', 'audit',
]);

// Sin `firstName` ni `lastName` (corregido en la fase 4): el `CreateParams` real de
// `@clerk/backend` —`api/endpoints/InvitationApi.d.ts`— solo acepta `emailAddress`,
// `expiresInDays`, `ignoreExisting`, `notify`, `publicMetadata`, `redirectUrl` y
// `templateSlug`. No hay dónde guardar el nombre en la invitación, y el real llega
// por el webhook `user.updated` al completarse el registro. Validar dos campos de
// PII para descartarlos en silencio y responder 201 sería una trampa para quien
// conecte el formulario a ellos más adelante.
export const inviteUserSchema = z.object({
  email: z.email().max(255),
  roleSlugs: z.array(roleSlugSchema).min(1, 'Elige al menos un rol'),
});

export const assignRolesSchema = z.object({
  // Reemplazo total del conjunto: idempotente y sin endpoints add/remove.
  roleSlugs: z.array(roleSlugSchema),
});

export const updateUserSchema = z.object({ isActive: z.boolean() });

export const userQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  role: z.union([z.literal('all'), roleSlugSchema]).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['email', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const userIdSchema = z.uuid();
```

```ts
// src/modules/audit/schemas/audit-log.schema.ts
export const auditLogQuerySchema = z.object({
  actorId: z.uuid().optional(),
  entityType: z.string().trim().max(40).optional(),
  action: z.string().trim().max(80).optional(),
  severity: z.enum(['all', 'info', 'warning', 'error']).default('all'),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
```

Los `sortBy`/`entityType` se resuelven contra mapas cerrados en el repositorio, en
la misma línea que `SORT_COLUMNS` de `category.repository.ts`. Igual que en el
spec 001, los campos base van **sin `default`** para que un `.partial()` no
reescriba claves ausentes.

### Formas de respuesta

```ts
export type UserWithRoles = User & { roleSlugs: RoleSlug[] };

export type UserListResponse = {
  data: UserWithRoles[];
  meta: {
    page: number; pageSize: number; total: number; totalPages: number;
    // El cliente NO decide permisos: los recibe ya resueltos por el servidor.
    currentUserId: string;
    canAssignElevatedRoles: boolean;
  };
};

export type InvitationResult = { invitationId: string; email: string; roleSlugs: RoleSlug[] };

export type RolesResponse = {
  data: Array<Role & { permissionCodes: PermissionCode[] }>;
  permissions: Permission[];
};

export type AuditLogListResponse = {
  data: Array<AuditLog & { actorEmail: string | null }>;
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};
```

### Webhook de Clerk

`POST /api/webhooks/clerk` verifica con `verifyWebhook(req)` de
`@clerk/nextjs/webhooks` (comprobado presente en `@clerk/nextjs@7.8.2`:
`dist/types/webhooks.d.ts` reexporta `@clerk/backend/webhooks` y documenta que lee
`CLERK_WEBHOOK_SIGNING_SECRET` automáticamente). Eventos manejados:

| Evento | Efecto |
|---|---|
| `user.created` | Upsert de `users` por `clerk_id` + inserción de `user_roles` leídos de `public_metadata.roleSlugs`, todo en una transacción con `logAudit('user.created')` |
| `user.updated` | Actualiza `email`, `first_name`, `last_name`, `image_url` |
| `user.deleted` | `is_active = false` (soft delete; la fila se conserva por la FK de `audit_logs`) |

El resto de eventos se ignora devolviendo `200`, para que Svix no reintente.

## 7. Arquitectura y archivos afectados

- `src/server/db/schema/` — **nuevos** `user.ts`, `role.ts`, `permission.ts`,
  `role-permission.ts`, `user-role.ts`, `audit-log.ts`; **modificado** `index.ts`.
- `src/server/db/index.ts` — **modificado**: exporta `type Tx` (handle de
  transacción) junto al `Db` ya existente.
- `src/server/db/seed.ts` — **modificado**: roles, permisos, matriz y bootstrap.
- `drizzle/` — **nueva** migración.
- `src/server/repositories/` — **nuevos** `user.repository.ts`,
  `role.repository.ts`, `permission.repository.ts`, `audit-log.repository.ts`;
  **modificado** `category.repository.ts` (mutadores reciben `tx`).
- `src/server/services/` — **nuevos** `user-sync.service.ts` (webhook),
  `user-access.service.ts` (invitación + asignación de roles + reglas de negocio).
- `src/lib/permissions.ts` — **nuevo**: catálogo puro y `can()`.
- `src/lib/auth.ts` — **nuevo**: `getCurrentUser()`, `getEffectivePermissions()`,
  `requirePermission()`, `ForbiddenError`.
- `src/lib/audit.ts` — **nuevo**: `logAudit(tx, input)`, `getAuditContext(request)`.
- `src/lib/api-guard.ts` — **nuevo (fase 4)**: `authorize()`, `toErrorResponse()`,
  `parseJsonBody()`, `badRequest()`. Contrato HTTP compartido por todos los Route
  Handlers de `/api/admin`; nace de la condición vinculante del reviewer de la fase 3.
- `src/lib/errors.ts` — **nuevo (fase 4)**: `NotFoundError`, `ConflictError`,
  `UpstreamError`. Puro, sin `next/server`, para que los servicios no dependan de la
  capa HTTP.
- `src/lib/axios.ts` — **modificado**: el interceptor redirige a `/sign-in` ante
  `401`.
- `src/app/api/webhooks/clerk/route.ts` — **nuevo**.
- `src/app/api/admin/categories/**` — **modificados**: auth + permiso.
- `src/app/api/admin/users/route.ts`, `users/[id]/route.ts`,
  `users/[id]/roles/route.ts`, `roles/route.ts`, `audit-logs/route.ts` — **nuevos**.
- `src/app/(admin)/admin/layout.tsx` — **modificado**: `auth.protect()`, `redirect('/')`
  cuando el set efectivo de permisos está vacío, y nav filtrada por permiso.
- `src/app/(admin)/admin/categories/page.tsx` — **modificado**:
  `requirePermission('categories.read')`.
- `src/app/(admin)/admin/users/page.tsx`, `roles/page.tsx`, `audit-logs/page.tsx` —
  **nuevos**.
- `src/modules/users/**` — **nuevo** (carpeta no existe hoy).
- `src/modules/roles/**`, `src/modules/audit/**` — **existentes y vacíos**: se
  rellenan, no se recrean.
- `src/components/ui/checkbox.tsx` — **nuevo** vía `npx shadcn@latest add checkbox`
  (verificado ausente).
- `src/components/shared/data-table.tsx`, `src/hooks/use-debounce.ts` — **sin
  cambios**: se reutilizan tal cual.
- `src/components/shared/site-header.tsx` — **sin cambios**: su `UserButton` ya es
  la vista de cuenta de `employee` y `customer` (§8).
- `src/proxy.ts` — **sin cambios**. Ver §8.
- `.env.example` — **modificado**: `SEED_SUPER_ADMIN_EMAIL`
  (`CLERK_WEBHOOK_SIGNING_SECRET` ya está presente, verificado).
- `docs/specs/001-admin-categories-crud.md` — **modificado**: §11 D1 marcada como
  retirada.

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **La autorización va en el recurso, no en `src/proxy.ts`** — pese a que la petición original pedía "middleware" | `clerkMiddleware()` con `createRouteMatcher` protegiendo `/admin(.*)` y `/api/admin(.*)` | Desviación deliberada y documentada. `docs/SETUP.md` §6 lo prohíbe con dos fuentes: Next 16 dice que el proxy no debe usarse como solución completa de autorización porque corre en cada request incluidas las prefetch; y Clerk 7 deprecó `createRouteMatcher` porque el matching por ruta puede divergir del routing real y **no puede proteger Server Functions**, que se invocan por id y no por ruta. La skill `clerk-webhooks` propone justamente ese patrón deprecado en su snippet de middleware: **gana `docs/SETUP.md`** (CLAUDE.md §8, regla 5) |
| **`employee` queda con cero permisos**, igual que `customer`; el panel lo abren solo `super_admin`, `admin`, `manager` y `audit` | Dar `categories.read` a `employee` para que consulte el catálogo desde `/admin` | El catálogo que un empleado necesita ver es el del **storefront**, que es público y no requiere permiso alguno. Un `categories.read` solo para abrir el panel obligaría a mantener una versión de solo lectura de cada vista de admin, que nadie pidió y que multiplica la superficie a auditar. Menos roles con acceso al panel = menos que revisar en `security-review` |
| El **redirect a `/` vive en `src/app/(admin)/admin/layout.tsx`**, no en cada página | Un `redirect('/')` repetido en las 4 páginas, o dejar solo el filtrado de `NAV_ITEMS` | El layout es el único punto que **todas** las rutas de `/admin/**` atraviesan, incluidas las que se añadan después; ponerlo ahí evita que una página futura nazca desprotegida. Y filtrar la nav sin redirigir dejaría a `employee`/`customer` mirando un shell con cero enlaces, que se lee como un fallo de la app y no como "esto no es para ti". El redirect **no sustituye** la verificación de cada recurso: cada página conserva su `requirePermission()` y cada handler su `401`/`403` (CLAUDE.md regla 8) |
| **No se construye ninguna página de perfil** para `employee` / `customer` | Una vista `/account` propia con datos de la cuenta | Ya está cubierto y verificado en el repo: `src/components/shared/site-header.tsx` monta `<UserButton />` bajo `<Show when="signed-in">`, que abre el portal de cuenta de Clerk (email, contraseña, sesiones activas, cierre de sesión) para cualquier usuario autenticado. Construir una vista propia duplicaría funcionalidad de terceros y añadiría superficie de escritura sobre datos de identidad. Se deja registrado aquí para que conste que se consideró |
| `verifyWebhook(req)` de `@clerk/nextjs/webhooks` | Instalar `svix` y verificar la firma a mano | Verificado en `node_modules`: `@clerk/nextjs@7.8.2` ya exporta el subpath `./webhooks` y `svix` **no** está instalado como dependencia directa. Cero dependencias nuevas. Recomendado explícitamente por la skill `clerk-webhooks` |
| El webhook queda alcanzable **sin tocar `proxy.ts`** | Añadir un `createRouteMatcher` que declare `/api/webhooks(.*)` como pública | El proxy actual no protege nada: las rutas ya son públicas por defecto. El snippet de la skill asume un proxy protected-first que este repo no tiene |
| Los roles de la invitación viajan en `publicMetadata` de la invitación | Tabla `pending_invitations` propia | **Confirmado contra la fuente**, no por memoria: el spec OpenAPI oficial de Clerk (`bapi/2026-05-12.yml`, `POST /invitations`) y el tipo `CreateParams` de `@clerk/backend` instalado en este repo dicen literalmente *"Once the user accepts the invitation and signs up, these metadata will end up in the user's public metadata"*. Y la skill `clerk-webhooks` confirma que `public_metadata` viaja en el payload de `user.created`. El fallback a `getInvitationList({ query })` **no hace falta** |
| `public_metadata` del webhook se valida con Zod antes de usarse | Confiar en el tipo y castear | `UserPublicMetadata` está declarado en `@clerk/shared` como `{ [k: string]: unknown }`, así que el contenido llega sin tipo útil. Un `roleSlugs` corrupto no debe poder insertar filas en `user_roles` |
| Regla "solo `super_admin` otorga `admin`/`super_admin`" implementada como el **permiso** `users.assign_elevated_roles` + la columna `roles.is_elevated` | `if (actorRoles.includes('super_admin'))` en el servicio | CLAUDE.md regla 10: *comparar nombres de rol en el código es hallazgo bloqueante*. Modelarlo como permiso preserva exactamente la semántica pedida (admin y super_admin idénticos salvo la elevación) sin ningún literal de rol en la lógica de autorización, y deja la clasificación como dato en la tabla |
| Autobloqueo (`actor.id === target.id` → `403`) verificado en el **servicio**, no solo en la UI | Ocultar el checkbox en el diálogo | La UI es una cortesía; la petición HTTP se puede forjar. Aplica a cambio de roles y a desactivación. Efecto colateral valioso: garantiza que nunca queden cero `super_admin` |
| Desactivar a un usuario con rol elevado exige `users.assign_elevated_roles` | Cualquiera con `users.update` puede desactivar a cualquiera | Sin este guard, un `admin` deja fuera al `super_admin` desactivándolo y se salta la regla anterior por la puerta de atrás |
| `getEffectivePermissions()` memoizado con `cache()` de React (por request) | `unstable_cache` con TTL, o cachear en `publicMetadata` de Clerk | `cache()` deduplica el join dentro de un mismo render/request y **caduca solo**, así que revocar un rol surte efecto en la petición siguiente. Además hace que el layout pueda calcular el set para el redirect y la nav sin pagar dos consultas. La referencia `caching-auth.md` de `clerk-nextjs-patterns` advierte que una caché entre requests sin `userId` en la clave filtra datos entre usuarios; con permisos el fallo sería de seguridad, no cosmético |
| `logAudit(tx, input)` recibe un `Tx` (handle de transacción), **no** `Db \| Tx` | Parámetro opcional con fallback al `db` global | Tipar el parámetro como `Tx` hace **imposible** escribir el log fuera de la transacción de la mutación. Igual para los mutadores de los repositorios (`create`/`update`/`softDelete`/`setRoles`); las lecturas (`findMany`/`findById`) siguen con el `db` global |
| El preámbulo HTTP de los Route Handlers (`authorize()`, traducción fallo → status, parseo del cuerpo) se extrae a `src/lib/api-guard.ts` en la fase 4 | Repetir en cada handler el `auth()` + `401` y las ramas del `catch`, como hizo la fase 3 | Con 10 handlers la copia literal deja de ser un problema estético: uno nuevo que olvide el preámbulo queda **público en silencio**. El helper no mueve la verificación al borde —`auth()` se sigue resolviendo dentro del recurso, vía `requireAuth()`— solo impide escribirla diez veces. Condición vinculante puesta por el reviewer de la fase 3 |
| `PUT /roles` reemplaza el conjunto completo de roles | `POST /roles` y `DELETE /roles/:slug` | Idempotente, una sola petición por diálogo, y el `before/after` del audit log sale directo del diff. Menos superficie de API |
| El catálogo (`PERMISSIONS`, `ROLE_DEFINITIONS`) vive en `src/lib/permissions.ts` **puro**, y `requirePermission()` en `src/lib/auth.ts` | Poner todo en `permissions.ts`, como sugiere el comentario de `docs/SETUP.md` §3 | Desviación mínima y consciente. `requirePermission()` importa `@clerk/nextjs/server` y los repositorios; si viviera junto al catálogo, cualquier import del catálogo desde `seed.ts` o desde un componente arrastraría medio servidor. Las reglas duras de §4 y §6 de `docs/SETUP.md` se cumplen íntegras |
| `permissions` y `roles` se siembran; la UI de `/admin/roles` es de **solo lectura** | CRUD de roles en el panel | `docs/SETUP.md` §5.1 regla dura 4: los permisos nacen del código. Con 6 roles fijos, un CRUD sería superficie de ataque sin consumidor |
| Asignación de roles con **checkboxes** (nombre + descripción en lenguaje llano) dentro del `Dialog` ya usado en categorías | Combobox buscable (`command` + `popover`) | Con 6 roles fijos, un buscador es sobre-ingeniería y esconde opciones a un usuario no técnico. Todo el conjunto visible de un vistazo. Único componente shadcn nuevo: `checkbox` |
| Checkboxes bloqueados con opacidad reducida **más un texto que explica el motivo** | Deshabilitar sin explicación, u ocultar la opción | Skill `ui-ux-pro-max` (dominio `ux`), guía "Disabled States": *do: reduce opacity and change cursor; don't: confuse disabled with normal state*. Ocultar dejaría al admin sin entender por qué no puede ascender a nadie |
| Confirmación explícita antes de cambiar roles y antes de desactivar, + toast de éxito | Guardar directo | Skill `ui-ux-pro-max`: "Confirmation Dialogs" (severidad Alta) y "Confirmation Messages" (Media). Un cambio de permisos es una acción de seguridad |
| Etiquetas de rol y permiso en español, con descripción; los `slug`/`code` técnicos nunca son la etiqueta principal | Mostrar `users.assign_roles` en la matriz | El usuario objetivo es no técnico. Skill `ui-ux-pro-max`: "Input Labels" (Alta) — toda opción necesita etiqueta visible y legible |
| `/admin/roles` y `/admin/audit-logs` consumen `/api/admin/**` vía hook, igual que categorías | Server Component leyendo el repositorio directo | `docs/SETUP.md` §4 se contradice a sí mismo: el diagrama permite Server Component → repositorio, pero su regla dura 1 dice que *un componente nunca importa un repositorio*. Ante la ambigüedad se usa el patrón ya establecido en el repo, que además no deja duda al reviewer |
| El interceptor de `src/lib/axios.ts` redirige a `/sign-in` ante `401` | Mostrar "No autenticado" en la tabla | El interceptor colapsa el error a `Error(message)` y descarta el status, así que la vista no puede distinguir sesión expirada de error de negocio. Se resuelve donde sí hay status |
| Cada fase deja la app compilando y se revisa por separado | Un solo review al final | Son 7 fases y ~60 tareas. Un review único convertiría cualquier hallazgo estructural de la fase 1 en una reescritura de las 6 restantes |

Skills del mapa de CLAUDE.md §8 usadas: `clerk-webhooks` (verificación del webhook
y payload), `clerk-backend-api` (esquema real de `POST /invitations` desde el
OpenAPI oficial), `clerk-nextjs-patterns` (401 vs 403, caché con auth),
`ui-ux-pro-max` (guías de UX citadas arriba).

Skills del mapa **no instaladas** en esta sesión, y por tanto no usadas:
`superpowers:brainstorming`, `superpowers:writing-plans`, `vercel:nextjs`,
`vercel:next-cache-components`, `vercel:vercel-storage`, `vercel:shadcn`. Las
afirmaciones sobre Next 16, Drizzle y Clerk de este spec se apoyan en
`docs/SETUP.md`, en el spec OpenAPI descargado y en los `.d.ts` de
`node_modules` de este repo — no en memoria del modelo.

## 9. Tareas

Agrupadas en 7 fases. **Cada fase debe dejar `npm run typecheck && npm run lint &&
npm run build` en verde y la app funcional**, y se somete a `reviewer` antes de
empezar la siguiente.

### Fase 1 — Esquema RBAC, librerías core y seed

Al terminar, nada consume todavía la capa nueva: la app se comporta igual que hoy.

- [x] **T1** — Definir `users` según §5.1 · archivo: `src/server/db/schema/user.ts` · verificación: `npm run typecheck`
- [x] **T2** — Definir `roles` según §5.2, con `is_system` e `is_elevated` · archivo: `src/server/db/schema/role.ts` · verificación: `npm run typecheck`
- [x] **T3** — Definir `permissions` según §5.3 · archivo: `src/server/db/schema/permission.ts` · verificación: `npm run typecheck`
- [x] **T4** — Definir `role_permissions` con PK compuesta según §5.4 · archivo: `src/server/db/schema/role-permission.ts` · verificación: `npm run typecheck`
- [x] **T5** — Definir `user_roles` con PK compuesta y `assigned_by` según §5.5 · archivo: `src/server/db/schema/user-role.ts` · verificación: `npm run typecheck`
- [x] **T6** — Definir el enum `audit_severity` y la tabla `audit_logs` con sus 4 índices según §5.6 · archivo: `src/server/db/schema/audit-log.ts` · verificación: `npm run typecheck`
- [x] **T7** — Exportar las 6 tablas y el enum desde el barrel · archivo: `src/server/db/schema/index.ts` · verificación: `npm run typecheck`
- [x] **T8** — Exportar `type Tx` (handle de transacción interactiva) junto al `Db` existente · archivo: `src/server/db/index.ts` · verificación: `npm run typecheck`
- [x] **T9** — Generar y aplicar la migración de las 6 tablas · archivo: `drizzle/` (generado) · verificación: `npm run db:generate && npm run db:migrate`
- [x] **T10** — Declarar el catálogo puro: `PERMISSIONS` (11 códigos), `PermissionCode`, `ROLE_DEFINITIONS` (6 roles con nombre y descripción en español), `RoleSlug`, `ROLE_PERMISSION_MATRIX` — con **`employee: []` y `customer: []`, ambos arrays vacíos** según §5.7 —, ~~`DEFAULT_ROLE_SLUG`~~ (declarada en la fase 1 y retirada en la fase 3 por quedarse sin consumidores; el default pasó a ser implícito, ver §5.7), `can(granted, code)` y la clase `ForbiddenError`. Sin imports de Clerk ni de `@/server` · archivo: `src/lib/permissions.ts` · verificación: `npm run typecheck`
- [x] **T11** — Implementar el repositorio de usuarios con las lecturas base: `findByClerkId`, `findById`, `findRoleSlugsByUserId`, `findPermissionCodesByClerkId` (join `users → user_roles → role_permissions → permissions`, filtrando `is_active = true`) y el mutador `upsertFromClerk(tx, values)` · archivo: `src/server/repositories/user.repository.ts` · verificación: `npm run typecheck`
- [x] **T12** — Implementar `findAllWithPermissions()` y `findIdsBySlugs(slugs)` · archivo: `src/server/repositories/role.repository.ts` · verificación: `npm run typecheck`
- [x] **T13** — Implementar `findAll()` ordenado por `resource, action` · archivo: `src/server/repositories/permission.repository.ts` · verificación: `npm run typecheck`
- [x] **T14** — Implementar `insert(tx, values)` (append-only: sin `update` ni `delete` en todo el archivo) · archivo: `src/server/repositories/audit-log.repository.ts` · verificación: `npm run typecheck`
- [x] **T15** — Implementar `logAudit(tx: Tx, input: AuditInput)` y `getAuditContext(request)` que extrae `x-forwarded-for` y `user-agent` · archivo: `src/lib/audit.ts` · verificación: `npm run typecheck`
- [x] **T16** — Implementar `getCurrentUser()` (lee `auth()`, busca por `clerk_id` y hace upsert JIT con `currentUser()` solo si la fila no existe), `getEffectivePermissions()` envuelto en `cache()` de React, `requireAuth()` y `requirePermission(code)` que lanza `ForbiddenError` · archivo: `src/lib/auth.ts` · verificación: `npm run typecheck`
- [x] **T17** — Extender el seed: insertar los 11 permisos y los 6 roles con `onConflictDoNothing` sobre sus columnas únicas, poblar `role_permissions` desde `ROLE_PERMISSION_MATRIX` — **`employee` y `customer` no generan ninguna fila**, y el bucle debe tolerar el array vacío sin emitir un `INSERT ... VALUES ()` —, y hacer el bootstrap del `super_admin` buscando `SEED_SUPER_ADMIN_EMAIL` en `users`. Idempotente y sin borrar las categorías existentes · archivo: `src/server/db/seed.ts` · verificación: `npm run db:seed` dos veces seguidas (AC16)

  **Pendiente de verificación manual (AC16, rama de bootstrap):** lo verificado es la
  idempotencia de permisos, roles y `role_permissions` (`npm run db:seed` dos veces
  seguidas, sin duplicados ni fallo). La rama que asigna `super_admin` buscando
  `SEED_SUPER_ADMIN_EMAIL` en `users` no se ha ejercitado nunca: la variable está
  vacía en `.env.local` y la tabla `users` no tiene ninguna fila. Misma causa raíz
  que el pendiente de AC7 en T21 —no hay usuarios reales todavía—, así que ambas se
  comprueban juntas cuando la primera cuenta acepte la invitación.

- [x] **T18** — Añadir `SEED_SUPER_ADMIN_EMAIL=""` y comprobar que `CLERK_WEBHOOK_SIGNING_SECRET` sigue documentado · archivo: `.env.example` · verificación: lectura

### Fase 2 — Webhook de Clerk y sincronización de usuarios

- [x] **T19** — Implementar `syncUserCreated`, `syncUserUpdated` y `syncUserDeleted`. `syncUserCreated` valida `public_metadata` con un schema Zod propio, resuelve los `roleSlugs` a ids con `role.repository`, y hace upsert + `user_roles` + `logAudit` dentro de **una** `db.transaction` · archivo: `src/server/services/user-sync.service.ts` · verificación: `npm run typecheck`
- [x] **T20** — Implementar el Route Handler: `verifyWebhook(req)` de `@clerk/nextjs/webhooks` en `try/catch` con `400` ante firma inválida, dispatch por `evt.type` con narrowing, `200` para los eventos no manejados, y deduplicación por el header `svix-id` · archivo: `src/app/api/webhooks/clerk/route.ts` · verificación: `npm run build`
- [ ] **T21** — Verificación empírica del ciclo completo: registrar el endpoint en el dashboard de Clerk (o `clerk webhooks listen --forward-to`), invitar un email de prueba con `publicMetadata.roleSlugs`, aceptar la invitación y comprobar que aparecen las filas en `users` y `user_roles`; además, enviar un POST con firma inválida y confirmar el `400` · archivo: — · verificación: AC7 y AC17

  **Parcial.** Verificado localmente contra `npm run dev` con un secreto de firma de
  prueba, enviando peticiones firmadas a mano con el esquema de Svix
  (`HMAC-SHA256` sobre `id.timestamp.body`): firma inválida → `400`, cabeceras
  `svix-*` ausentes → `400`, cuerpo alterado tras firmar → `400` (**AC17 cubierto**);
  evento no manejado con firma válida → `200`; `user.deleted` de un `clerk_id`
  inexistente con firma válida → `200` recorriendo la transacción real contra Neon
  sin escribir ninguna fila; y el reintento con el mismo `svix-id` → `200` sin
  volver a tocar la base (2,3 s la primera vez, 41 ms la segunda). La ruta responde
  sin pasar por ninguna autenticación, lo que confirma que el webhook es alcanzable
  sin tocar `src/proxy.ts`.

  **Pendiente de verificación manual (AC7):** registrar el endpoint en el dashboard
  de Clerk (o `clerk webhooks listen --forward-to`), poner el
  `CLERK_WEBHOOK_SIGNING_SECRET` real en `.env.local` —hoy está vacío—, invitar un
  email de prueba con `publicMetadata.roleSlugs`, aceptar la invitación y comprobar
  las filas en `users` y `user_roles`, además del refresco que menciona §10. No se
  ejecutó porque exige dashboard, túnel y un buzón real, y porque no se escriben
  usuarios de prueba en la base real del proyecto.

### Fase 3 — Retrofit de auth sobre categorías (retira D1)

- [x] **T22** — Cambiar `create`, `update` y `softDelete` para que reciban `tx: Tx` como primer parámetro; dejar `findMany` y `findById` con el `db` global · archivo: `src/server/repositories/category.repository.ts` · verificación: `npm run typecheck`
- [x] **T23** — Añadir `const { isAuthenticated } = await auth()` + `401` con `{ message }`, `requirePermission('categories.read'|'categories.create')` capturado en el `try/catch` existente devolviendo `403`, y envolver el `POST` en `db.transaction` con `logAudit('category.created')` · archivo: `src/app/api/admin/categories/route.ts` · verificación: `npm run build` + AC2, AC3

  **AC2 verificado** contra `npm run dev`: `GET /api/admin/categories` sin sesión y
  con `Accept: application/json` devuelve `401`, `content-type: application/json` y
  `{"message":"Necesitas iniciar sesión para acceder a este recurso."}` — ningún
  `307` ni HTML del formulario. `POST` sin sesión, ídem `401`. **AC3 pendiente de
  verificación manual**: exige una sesión real de Clerk con un rol de conjunto
  vacío, y `users` sigue sin filas (misma causa raíz que los pendientes de T17 y
  T21). El camino está tipado y cerrado: `requirePermission` lanza `ForbiddenError`
  y el `catch` lo traduce a `403 { message }` antes de cualquier otra rama.

  **Migrado en la fase 4** a `authorize()` + `toErrorResponse()` de
  `src/lib/api-guard.ts`, con la autorización antes del parseo del cuerpo. Verificado
  con `curl` que no hay regresión sin sesión: `401` con `content-type:
  application/json` en `GET` y en `POST`, incluido `POST` con cuerpo no-JSON.

- [x] **T24** — Lo mismo para `GET`/`PATCH`/`DELETE` por id, con `categories.read`/`update`/`delete` y `logAudit('category.updated'|'category.deactivated')` con `changes: { before, after }` en la misma transacción · archivo: `src/app/api/admin/categories/[id]/route.ts` · verificación: `npm run build` + AC3, AC12

  Los tres verbos devuelven `401` sin sesión (verificado con `curl`). `PATCH` y
  `DELETE` leen la fila previa con el `db` global para el `before` y el `404`, y
  hacen la escritura más `logAudit` dentro de una única `db.transaction`, de modo
  que **AC12** queda garantizado por construcción: el tipo `Tx` de `logAudit` hace
  imposible escribir la bitácora fuera de esa transacción. **AC3 y la comprobación
  empírica del rollback de AC12 quedan pendientes** por la misma falta de usuarios
  reales.

  **Migrado en la fase 4** a `authorize()` + `toErrorResponse()`, con dos
  correcciones de los hallazgos MENOR del reviewer: el `before` pasa a leerse con el
  `tx` dentro de la transacción (`findById(id, tx)`), y `DELETE` sobre una categoría
  ya inactiva devuelve la fila sin auditar, en vez de escribir una entrada con
  `before.isActive === after.isActive === false`. Verificado con `curl`: los tres
  verbos siguen respondiendo `401` sin sesión, y `GET` con un id no-UUID y sin sesión
  responde `401` y no `400`.
- [x] **T25** — Añadir el guard del panel en tres pasos: `await auth.protect()`; luego resolver el set efectivo con `getEffectivePermissions()` y hacer `redirect('/')` de `next/navigation` si está **vacío** (cubre `employee`, `customer` y a quien no tenga rol); y por último construir la navegación filtrando `NAV_ITEMS` por el permiso requerido de cada ítem, reutilizando ese mismo set ya memoizado por `cache()`. El redirect no exime a las páginas de su propio `requirePermission()` · archivo: `src/app/(admin)/admin/layout.tsx` · verificación: `npm run build` + AC1, AC4, AC5
  **AC1 verificado** contra `npm run dev`: `GET /admin/categories` sin sesión
  devuelve `307` a `/sign-in?redirect_url=…`, emitido por `await auth.protect()`.
  El set efectivo se resuelve una sola vez gracias a `cache()` y alimenta tanto el
  `redirect('/')` como el filtrado de `NAV_ITEMS`, que ahora declara su
  `permission: PermissionCode` por ítem. **AC4 y AC5 pendientes de verificación
  manual** (exigen un usuario por rol). Nota: `/admin` a secas responde `404`
  porque todavía no existe `src/app/(admin)/admin/page.tsx`; esa ruta la crean las
  fases 4–6, y el guard del layout ya cubre a todos sus hijos.

- [x] **T26** — Añadir `await requirePermission('categories.read')` antes de montar la tabla · archivo: `src/app/(admin)/admin/categories/page.tsx` · verificación: `npm run build`

  La página pasa a ser `async`. El `ForbiddenError` se propaga sin capturar: falla
  cerrado y sin tragar el error (CLAUDE.md §6). Hoy nadie llega a esa rama porque
  todos los roles que abren el panel tienen `categories.read`; cuando la fase 4
  introduzca roles con panel pero sin catálogo, convendrá una pantalla de "sin
  permiso" en vez de la de error genérica.

- [x] **T27** — Redirigir a `/sign-in` desde el interceptor cuando `error.response?.status === 401`, sin alterar la normalización de `message` que ya existe · archivo: `src/lib/axios.ts` · verificación: `npm run typecheck`

  Guardado tras `typeof window !== 'undefined'` para que el módulo siga siendo
  importable desde el servidor, y con `redirect_url` apuntando a la ruta actual. La
  normalización a `Error(message)` queda intacta. Lleva un
  `eslint-disable-next-line @next/next/no-location-assign-relative-destination`
  con el motivo: un interceptor a nivel de módulo no tiene `router`, y la
  navegación dura es lo que se busca para tirar el caché de TanStack Query.

- [x] **T28** — Marcar la deuda D1 como **retirada**, con fecha y referencia a este spec, sin borrar el registro histórico · archivo: `docs/specs/001-admin-categories-crud.md` (§11) · verificación: lectura

### Fase 4 — Módulo admin de usuarios

**T0 de la fase — condición vinculante del reviewer de la fase 3 (hecho).** El
preámbulo `auth()` + `401` y la traducción `UnauthorizedError→401` /
`ForbiddenError→403` estaban copiados en los 5 handlers de categorías y esta fase
añadía 5 más. Se extrajeron a **`src/lib/api-guard.ts`** antes de escribir el primer
handler nuevo:

- `authorize(permission)` → `{ actor, granted }`. Es `requireAuth()` +
  `requirePermission()` compuestos: la sesión se sigue resolviendo con `auth()`
  dentro del recurso (vía `getCurrentUser()`), no en un middleware ni en un matcher
  por ruta. **Lanza** en vez de devolver, para que el resultado no se pueda ignorar
  por olvido y el 401/403 salga por el mismo `catch` que el resto.
- `toErrorResponse(error, { label, fallback, uniqueViolationMessage? })`: única
  traducción fallo → status de toda la API de admin (401/403/404/409/502/500).
- `parseJsonBody(request, schema, mensaje)` y `badRequest(message, issues?)`: los 5
  bloques idénticos de "JSON inválido → 400" + "Zod → 400 con issues".
- `src/lib/errors.ts` (**nuevo**, puro, sin `next/server`): `NotFoundError`,
  `ConflictError`, `UpstreamError`, que lanza el servicio y traduce el handler. Así
  `user-access.service.ts` no depende de la capa HTTP.
- `ForbiddenError` acepta ahora un mensaje propio (segundo parámetro, con default):
  las reglas de negocio que devuelven 403 con el permiso concedido —autobloqueo,
  rol elevado— necesitan decir *qué* pasó sin inventar un permiso que falte.
- `UnauthorizedError` pasa a llevar el texto que antes vivía duplicado como
  constante `UNAUTHENTICATED` en cada handler, de modo que las dos formas de "sin
  sesión" respondan lo mismo.

Los 5 handlers de categorías (T23/T24) se migraron al mismo helper: no conviven dos
patrones. Verificado por `curl` que su comportamiento no cambió (ver T23/T24).

**Hallazgos MENOR de la fase 3, corregidos aquí:**

1. `DELETE /api/admin/categories/[id]` sobre una categoría ya inactiva ya no escribe
   una entrada de bitácora falsa con `before.isActive === after.isActive === false`:
   el handler devuelve la fila tal cual, sin auditar y sin 404 (la fila existe). La
   misma lección se aplicó a `setUserRoles` y `setUserActive` de esta fase, que
   tampoco auditan un cambio que no cambia nada.
2. Orden canónico **autenticación → autorización → validación** en los 5 handlers de
   categorías y en los 4 nuevos. Comprobado con `curl`: `POST /api/admin/categories`
   y `POST /api/admin/users` con cuerpo no-JSON y sin sesión responden `401`, no
   `400`; `GET /api/admin/categories/no-es-uuid` sin sesión responde `401`, no `400`.
3. `categoryRepository.findById(id, reader = db)` acepta un `Reader` (`Db | Tx`,
   exportado desde `src/server/db/index.ts`) y `PATCH`/`DELETE` le pasan su `tx`: el
   `before` de la bitácora se lee dentro de la transacción del `UPDATE`. T22 queda
   intacto —los mutadores siguen exigiendo `Tx`— y el resto de llamadores no cambia.
   `userRepository.findById` y `findRolesByUserId` nacen con el mismo parámetro.

- [x] **T29** — Derivar `User`, `Role`, `Permission`, `AuditLog` con `InferSelectModel` e `import type`, y declarar `UserWithRoles`, `UserListResponse`, `InvitationResult` · archivo: `src/modules/users/types/user.types.ts` · verificación: `npm run typecheck`

  `User`, `UserWithRoles`, `UserListMeta`, `UserListResponse` e `InvitationResult` en
  `user.types.ts`. **Desviación:** `Role` y `Permission` se derivan en
  `src/modules/roles/types/role.types.ts` (T41, misma fase) y `AuditLog` se difiere a
  T54, porque declararlos en `user.types.ts` los pondría en el módulo equivocado y
  `AuditLog` no tiene ningún consumidor hasta la fase 6 (CLAUDE.md §6: nada de código
  muerto).

- [x] **T30** — Definir los schemas Zod de §6 · archivo: `src/modules/users/schemas/user.schema.ts` · verificación: `npm run typecheck`

  `roleSlugSchema` se deriva de `ROLE_DEFINITIONS` en vez de repetir los 6 slugs: si
  el catálogo cambia, el schema deja de compilar en lugar de aceptar en silencio un
  rol que ya no existe. **Desviación:** `firstName` y `lastName` se omiten de
  `inviteUserSchema`. No tienen consumidor: `POST /invitations` de Clerk no acepta
  nombre (verificado en el OpenAPI oficial `bapi/2026-05-12.yml` y en el tipo
  `CreateParams` de `@clerk/backend` instalado), y el nombre real llega por el webhook
  `user.updated` cuando la persona completa el registro. Guardarlos solo para no
  usarlos sería PII sin propósito.

  **Corregido tras el review de la fase 4 (hallazgo MAYOR):** la primera entrega
  documentó la omisión pero dejó los dos campos en el schema, de modo que la API los
  validaba y los descartaba en silencio devolviendo `201`. Ya no están, y §6 se
  actualizó para que el contrato escrito coincida con el código.

- [x] **T31** — Declarar `userKeys` (query-key factory), `DEFAULT_PAGE_SIZE`, opciones de estado y de rol, y los mensajes de conflicto compartidos entre handler y diálogo · archivo: `src/modules/users/constants.ts` · verificación: `npm run typecheck`

  `USER_ROLE_OPTIONS` se construye desde `ROLE_DEFINITIONS`: las etiquetas en español
  no se duplican. `USER_EMAIL_CONFLICT_MESSAGE` la comparten el servicio que emite el
  409 y el diálogo que lo mapea al campo de correo, igual que en categorías.

- [x] **T32** — Añadir `findMany` (búsqueda `ilike` sobre email/nombre, filtro por estado y por rol, orden por mapa cerrado, paginación y `count`, devolviendo `roleSlugs` agregados) y el mutador `setRoles(tx, userId, roleIds, assignedBy)` que borra e inserta el conjunto completo · archivo: `src/server/repositories/user.repository.ts` · verificación: `npm run typecheck`

  El filtro por rol usa `EXISTS` y no un `JOIN`: con join, quien tiene varios roles
  duplicaría filas y rompería el `count` de la paginación. Los `roleSlugs` salen de
  una segunda consulta acotada a los ids de la página, misma forma que
  `role.repository.findAllWithPermissions`. `setRoles` tolera el conjunto vacío
  (quedarse sin roles es legítimo: deja al usuario en el default `customer`).
  **Refactor de paso:** `findRoleSlugsByUserId` se sustituye por
  `findRolesByUserId`, que devuelve `{ id, slug, isElevated }`, porque el guard de
  roles elevados necesita ese dato y mantener dos lectores casi idénticos del mismo
  join sería duplicación. `seed.ts` se adapta en una línea. Por lo mismo,
  `role.repository.findIdsBySlugs` pasa a `findBySlugs` con `isElevated` en la
  proyección (tipo `RoleRef`), y `user-sync.service.ts` se adapta.

- [x] **T33** — Implementar `inviteUser`, `setUserRoles` y `setUserActive`, con las tres reglas de negocio: autobloqueo del actor, exigencia de `users.assign_elevated_roles` cuando el conjunto entrante o saliente toca un rol `is_elevated`, y la misma exigencia para desactivar a un usuario elevado. Todo mutador corre en `db.transaction` con su `logAudit` (`user.invited`, `user.roles_changed` con `severity: 'warning'`, `user.activated`/`user.deactivated`). `inviteUser` llama a `clerkClient().invitations.createInvitation({ emailAddress, publicMetadata: { roleSlugs }, redirectUrl })` y traduce el error de email duplicado a un conflicto de dominio · archivo: `src/server/services/user-access.service.ts` · verificación: `npm run typecheck`

  Las tres reglas viven aquí y no en la UI, porque la petición se puede forjar.
  `assertMayTouch()` decide sobre `roles.is_elevated` y `can(granted,
  'users.assign_elevated_roles')`: **ni un solo literal de rol** en la lógica de
  autorización (CLAUDE.md regla 10). El actor y su set efectivo llegan resueltos desde
  el handler (`authorize()`), así que el servicio no vuelve a mirar la sesión.
  **Decisión:** `inviteUser` llama a Clerk **antes** de abrir la transacción de la
  bitácora, para no sostener una conexión de Neon durante una llamada HTTP a un
  tercero. El precio, documentado en el código: una invitación enviada cuyo log falle
  responde 500 y queda sin traza propia —la cuenta no gana ningún acceso hasta que el
  webhook la refleje, y ese evento sí audita. El duplicado se detecta por el status de
  Clerk (400/422 son los dos únicos rechazos de cliente que documenta el OpenAPI de
  `POST /invitations`, y el formato del correo ya lo validó Zod) con un guard local de
  6 líneas: `isClerkAPIResponseError` vive en `@clerk/nextjs/errors`, que es un módulo
  de frontera de cliente, y `@clerk/backend` no es dependencia directa.

  **Corregido tras el review de la fase 4 (hallazgo MENOR):** `setUserRoles` leía el
  usuario con el `db` global antes de abrir la transacción, mientras `setUserActive`
  ya lo leía dentro con el `tx`. Ahora ambos lo hacen igual: la fila que se devuelve
  al cliente no puede estar rancia, y si la cuenta desaparece entre la lectura y el
  `setRoles` sale un `404` limpio en vez de un `500` por violación de FK.

- [x] **T34** — Implementar `GET` (listado + `meta.currentUserId` y `meta.canAssignElevatedRoles`) y `POST` (invitación, `201`, `409` ante duplicado, `502` si Clerk falla) · archivo: `src/app/api/admin/users/route.ts` · verificación: `npm run build` + AC6, AC8

  Verificado con `curl` contra `npm run dev`: `GET` y `POST` sin sesión responden
  `401` con `content-type: application/json` y `{ message }` — nunca `307` ni HTML.
  `POST` con cuerpo no-JSON y sin sesión también responde `401`, que es la prueba del
  orden canónico. `DELETE /api/admin/users` responde `405`: el recurso no expone más
  verbos. **AC6 y AC8 pendientes de verificación manual**: exigen una sesión real con
  `users.invite` y un `CLERK_SECRET_KEY` con permiso de invitaciones; `users` sigue
  sin filas (misma causa raíz que los pendientes de T17, T21 y T23).

- [x] **T35** — Implementar `PATCH` de `isActive` con `users.update` · archivo: `src/app/api/admin/users/[id]/route.ts` · verificación: `npm run build` + AC13

  `401` sin sesión verificado con `curl`. **AC13 pendiente de verificación manual**;
  el camino está cerrado por construcción: `findPermissionCodesByClerkId` filtra por
  `is_active = true`, así que un usuario desactivado resuelve el conjunto vacío y
  `requirePermission` lanza `ForbiddenError` → `403` aunque su sesión de Clerk siga
  viva.

- [x] **T36** — Implementar `PUT` de roles con `users.assign_roles` · archivo: `src/app/api/admin/users/[id]/roles/route.ts` · verificación: `npm run build` + AC9, AC10, AC11

  `401` sin sesión verificado con `curl`. **AC9, AC10 y AC11 pendientes de
  verificación manual** por la misma falta de usuarios reales. Están cerrados en el
  servicio: autobloqueo por `actor.id === userId`, elevación por `is_elevated` sobre
  el conjunto *entrante y saliente*, y una única fila `user.roles_changed` con
  `severity: 'warning'` y `changes: { before: { roleSlugs }, after: { roleSlugs } }`
  dentro de la misma transacción que el `setRoles`.

- [x] **T37** — Implementar `GET /api/admin/roles` con `roles.read`, devolviendo roles con sus `permissionCodes` más el catálogo de permisos · archivo: `src/app/api/admin/roles/route.ts` · verificación: `npm run build`

  `401` sin sesión y `405` ante `POST` verificados con `curl`: el recurso es de solo
  lectura y no expone ningún verbo de escritura.

- [x] **T38** — Implementar el service axios de usuarios sobre la instancia `api` · archivo: `src/modules/users/services/user.service.ts` · verificación: `npm run typecheck`
- [x] **T39** — Implementar `useUsers(params)` con `placeholderData: keepPreviousData` · archivo: `src/modules/users/hooks/use-users.ts` · verificación: `npm run typecheck`
- [x] **T40** — Implementar `useInviteUser`, `useSetUserRoles` y `useSetUserActive`, cada una invalidando la key del listado y emitiendo su toast · archivo: `src/modules/users/hooks/use-user-mutations.ts` · verificación: `npm run typecheck`
- [x] **T41** — Implementar el service y el hook de roles reutilizables por el diálogo y por la fase 5 · archivos: `src/modules/roles/services/role.service.ts`, `src/modules/roles/hooks/use-roles.ts`, `src/modules/roles/types/role.types.ts` · verificación: `npm run typecheck`

  `useRoles()` con `staleTime: Infinity`: los 6 roles nacen del seed y no cambian sin
  un despliegue. Se añade `src/modules/roles/constants.ts` con la query-key y
  `roleLabel(slug)`, que las columnas usan para pintar la etiqueta de un slug sin
  pedir el listado a la API.

- [x] **T42** — Instalar el componente faltante: `npx shadcn@latest add checkbox` · archivo: `src/components/ui/checkbox.tsx` · verificación: `npm run lint`
- [x] **T43** — Definir las columnas: Usuario (nombre + email, con la insignia "Tú" en la fila propia), Roles (badges), Estado, Alta y menú de acciones · archivo: `src/modules/users/components/user-columns.tsx` · verificación: `npm run typecheck`

  La fila sin roles muestra "Cliente (sin acceso)" en vez de un hueco: el conjunto
  vacío es información válida, no un fallo de carga. `SortableHeader` queda duplicado
  respecto a `category-columns.tsx` **a propósito** —es la segunda aparición y
  CLAUDE.md §6 extrae a la tercera—, con la nota de subirlo a `components/shared`
  cuando la fase 6 añada el tercero.

- [x] **T44** — Implementar el diálogo de invitación con React Hook Form + `zodResolver` + primitivos `Field*`, checkboxes de rol, texto de ayuda que explique que la persona recibirá un correo y elegirá su propia contraseña, y mapeo del `409` al campo email · archivo: `src/modules/users/components/invite-user-dialog.tsx` · verificación: `npm run typecheck`

  El grupo de roles va en `FieldSet` + `FieldLegend` y no en un `FieldLabel`: un
  `htmlFor` no puede apuntar a seis inputs y el grupo necesita nombre accesible propio.

- [x] **T45** — Implementar el diálogo de asignación de roles: un checkbox por rol con su nombre y descripción, los roles elevados deshabilitados cuando `canAssignElevatedRoles` es falso más el texto que explica el motivo, y confirmación antes de guardar. La descripción de `employee` y `customer` debe decir en lenguaje llano que no dan acceso al panel. Remontado con `key={user.id}` · archivo: `src/modules/users/components/assign-roles-dialog.tsx` · verificación: `npm run typecheck` + AC9

  La confirmación es un segundo paso dentro del mismo diálogo que enseña "ahora
  tiene" → "pasará a tener" en lenguaje llano. El botón de guardar está deshabilitado
  cuando el conjunto no cambia. Los checkboxes viven en
  `role-checkbox-group.tsx`, compartido con T44 (dos consumidores con la misma
  necesidad exacta, no dos cosas que se parecen): resuelve su propio `useRoles()` con
  estados de carga y error, y de ahí saca `isElevated` y la descripción, que son los
  mismos datos sobre los que decide el guard del servidor. **AC9 pendiente de
  verificación manual** en su mitad de UI; la mitad de API está cerrada en T33/T36.

- [x] **T46** — Implementar el diálogo de confirmación de activar/desactivar con `AlertDialog` · archivo: `src/modules/users/components/toggle-user-active-dialog.tsx` · verificación: `npm run typecheck`
- [x] **T47** — Implementar el contenedor cliente: `"use client"`, estado de búsqueda (con `useDebounce`)/estado/rol/paginación/orden, `useReactTable` en modo manual, `DataTable` compartido, estados vacío y sin resultados diferenciados, y composición de los tres diálogos · archivo: `src/modules/users/components/users-table.tsx` · verificación: `npm run build`

  `currentUserId` y `canAssignElevatedRoles` se leen de `meta`, nunca se deducen en el
  cliente. Mientras el listado carga no hay fila propia identificable, así que no hay
  control que deshabilitar.

- [x] **T48** — Crear la página con `requirePermission('users.read')`, título, descripción y montaje de `UsersTable` · archivo: `src/app/(admin)/admin/users/page.tsx` · verificación: `npm run build`

  Verificado con `curl`: `/admin/users` sin sesión devuelve `307` a
  `/sign-in?redirect_url=…` (emitido por el `auth.protect()` del layout), sin llegar a
  montar la tabla.

- [x] **T49** — Añadir el ítem de navegación Usuarios con su permiso requerido · archivo: `src/app/(admin)/admin/layout.tsx` · verificación: `npm run build`

  `{ href: '/admin/users', permission: 'users.read' }`. Con la matriz actual lo ven
  `super_admin`, `admin`, `manager` y `audit`; `employee` y `customer` siguen
  redirigidos fuera del panel antes de ver la nav.

**Pendientes de la fase 4, todos con la misma causa raíz** (no hay ningún usuario
real en `users`, `SEED_SUPER_ADMIN_EMAIL` y `CLERK_WEBHOOK_SIGNING_SECRET` están
vacíos en `.env.local`, y no se escriben cuentas de prueba en la base real):
**AC3, AC6, AC8, AC9, AC10, AC11 y AC13**. Se comprueban juntos, junto a los
pendientes de T17, T21, T23 y T25, cuando la primera cuenta acepte una invitación.
Lo que sí se verificó sin sesión: `401` con `{ message }` en los 5 endpoints nuevos,
`405` en los verbos no expuestos, `307` en la página, y la no regresión de los 5
handlers de categorías.

### Fase 5 — Vista de roles (solo lectura)

- [x] **T50** — Implementar la matriz rol × permiso: roles en filas, permisos agrupados por recurso en columnas, marca accesible que no dependa solo del color, y descripción de cada rol visible. Las filas de `employee` y `customer` quedan sin ninguna marca, que es información válida y no un fallo de carga · archivo: `src/modules/roles/components/role-matrix.tsx` · verificación: `npm run typecheck`
- [x] **T51** — Crear la página con `requirePermission('roles.read')`, un aviso de que los roles son fijos y se cambian en el código, y el montaje de la matriz · archivo: `src/app/(admin)/admin/roles/page.tsx` · verificación: `npm run build` + AC15
- [x] **T52** — Añadir el ítem de navegación Roles con su permiso requerido · archivo: `src/app/(admin)/admin/layout.tsx` · verificación: `npm run build`

### Fase 6 — Visor de la bitácora (solo lectura, filtrable)

- [x] **T53** — Añadir `findMany` con filtros por actor, tipo de entidad, acción, severidad y rango de fechas, join a `users` para el email del actor, orden por `created_at desc`, paginación y `count`. Sin ninguna función de escritura · archivo: `src/server/repositories/audit-log.repository.ts` · verificación: `npm run typecheck`
- [x] **T54** — Definir tipos y schemas Zod de §6 · archivos: `src/modules/audit/types/audit-log.types.ts`, `src/modules/audit/schemas/audit-log.schema.ts`, `src/modules/audit/constants.ts` · verificación: `npm run typecheck`
- [x] **T55** — Implementar `GET` con `audit_logs.read`. El handler no expone `POST`, `PATCH` ni `DELETE` · archivo: `src/app/api/admin/audit-logs/route.ts` · verificación: `npm run build`
- [x] **T56** — Implementar el service axios y `useAuditLogs(params)` · archivos: `src/modules/audit/services/audit-log.service.ts`, `src/modules/audit/hooks/use-audit-logs.ts` · verificación: `npm run typecheck`
- [x] **T57** — Definir las columnas: Fecha, Actor, Acción (en lenguaje llano), Entidad, Severidad (`Badge`) y detalle expandible del `changes` · archivo: `src/modules/audit/components/audit-log-columns.tsx` · verificación: `npm run typecheck`
- [x] **T58** — Implementar el contenedor cliente con los filtros de AC14 y sin ninguna acción de escritura · archivo: `src/modules/audit/components/audit-logs-table.tsx` · verificación: `npm run build`
- [x] **T59** — Crear la página con `requirePermission('audit_logs.read')` · archivo: `src/app/(admin)/admin/audit-logs/page.tsx` · verificación: `npm run build` + AC14
- [x] **T60** — Añadir el ítem de navegación Bitácora con su permiso requerido · archivo: `src/app/(admin)/admin/layout.tsx` · verificación: `npm run build`

### Fase 7 — Cierre

- [ ] **T61** — Barrido final con **un usuario de cada uno de los 6 roles**: para `super_admin`, `admin`, `manager` y `audit`, comprobar que cada ítem de navegación declara su permiso y que la nav coincide exactamente con las páginas que ese rol puede abrir; para `employee` y `customer`, comprobar que `/admin`, `/admin/categories`, `/admin/users`, `/admin/roles` y `/admin/audit-logs` **redirigen a `/`** y que ninguna devuelve el shell del panel, y que su `UserButton` sigue abriendo el portal de cuenta · archivo: `src/app/(admin)/admin/**` · verificación: AC3, AC4 y AC5
- [x] **T62** — Recorrer el checklist de `docs/SETUP.md` §7 y marcar los ítems que este spec cierra (webhook, seed de permisos, verificación por código de permiso en cada recurso) · archivo: — · verificación: lectura
- [ ] **T63** — Pasar la skill `security-review` sobre el diff completo de las 7 fases y resolver los hallazgos · archivo: — · verificación: informe sin hallazgos abiertos
- [ ] **T64** — Recorrer los 18 criterios de aceptación en `npm run dev` con un usuario por rol y cerrar con `npm run typecheck && npm run lint && npm run build` · archivo: — · verificación: los tres comandos en verde

### Cierre de las fases 5 y 6

Las fases 5 y 6 quedan completas (T50–T60) con `npm run typecheck`, `npm run lint`
y `npm run build` en verde. Dos desviaciones menores respecto a lo escrito arriba,
ambas conscientes:

1. **El filtro por actor de la bitácora se arma desde la fila**, con un botón en la
   celda "Quién" que fija el `actorId` y una etiqueta con el correo para quitarlo,
   en vez de un desplegable de personas. El contrato de §6 filtra por `actorId`
   (uuid) y pedirle un uuid a quien consulta no es una interfaz; un desplegable
   obligaría a la bitácora a consumir `/api/admin/users`, que exige otro permiso y
   viene paginado. El caso de uso real —"ver todo lo que hizo esta persona"— parte
   siempre de una fila que ya se está mirando.
2. **`entityType` y `action` se filtran con parámetros ligados, no contra un mapa
   cerrado en el repositorio.** El `SORT_COLUMNS` de `category.repository.ts` existe
   porque un identificador de columna no se puede parametrizar; aquí son valores.
   Cerrar la lista en el repositorio obligaría a editarlo cada vez que se audite una
   entidad nueva y el filtro dejaría de encontrarla en silencio. El catálogo cerrado
   sí existe, pero en `src/modules/audit/constants.ts`, que es quien arma los
   desplegables.

El detalle expandible de `changes` usa un `<details>` nativo dentro de la celda en
lugar de sub-filas de TanStack Table: `src/components/shared/data-table.tsx` es
compartido con categorías y usuarios, y añadirle expansión por este único consumidor
lo cambiaría para todos. `SortableHeader` sigue duplicado en dos archivos y **no** se
extrae: la bitácora no ordena —sale siempre por `created_at desc`— así que la tercera
aparición que pedía CLAUDE.md §6 no llegó a existir.

### Estado de la fase 7

- **T61** — verificada la mitad estática: cada ítem de `NAV_ITEMS` declara un
  permiso, y ese permiso coincide exactamente con el `requirePermission()` de la
  página que abre (`categories.read`, `users.read`, `roles.read`,
  `audit_logs.read`) y con el `authorize()` de su handler. Cruzado contra
  `ROLE_PERMISSION_MATRIX`, la navegación resultante es: `super_admin`, `admin` y
  `audit` ven los cuatro ítems; `manager` ve tres (sin Bitácora); `employee` y
  `customer` resuelven el conjunto vacío y el layout los manda a `/`. **La mitad
  empírica —un usuario real por cada uno de los 6 roles— queda pendiente: exige
  base de datos.**
- **T62** — hecho. `docs/SETUP.md` §7 marcado, con los tres ítems que dependen de
  Neon explícitamente sin marcar y con la razón escrita debajo.
- **T63** — **no ejecutable en esta sesión**: la skill `security-review` no está
  instalada. CLAUDE.md §8 regla 1 dice que en ese caso se sigue sin ella y se dice.
- **T64** — la mitad de comandos está en verde (typecheck, lint y build). El
  recorrido de los 18 criterios de aceptación con un usuario por rol queda
  pendiente por la misma razón que T61.

**Bloqueante único para cerrar el spec: `DATABASE_URL` está vacía en `.env.local`.**
Sin proyecto Neon no hay `npm run db:migrate` ni `npm run db:seed`, y sin seed no
existen ni los 6 roles ni los 11 permisos, así que ninguna vista del panel puede
resolver un conjunto de permisos no vacío. Todo lo que no depende de eso está
hecho y compila.

## 10. Riesgos y consideraciones

- **El redirect del layout es comodidad, no la frontera de seguridad.** Quien tenga
  el set vacío no llega al panel, pero la frontera real siguen siendo el
  `requirePermission()` de cada página y el `401`/`403` de cada handler: la API es
  alcanzable sin pasar por ningún layout. Un futuro `/admin/**` que se apoye solo
  en el redirect es hallazgo bloqueante (CLAUDE.md regla 8).
- **`employee` sin permisos es un rol deliberadamente vacío hoy.** Sirve para
  etiquetar personal interno en `users` y para poder darle permisos más adelante
  cambiando una línea de `ROLE_PERMISSION_MATRIX`. Si se le concede cualquier
  permiso en el futuro, el redirect del layout deja de aplicarle solo, sin tocar
  código.
- **El webhook es asíncrono y eventualmente consistente** (advertencia explícita de
  la skill `clerk-webhooks`). Entre que alguien acepta la invitación y llega
  `user.created` puede pasar un instante en el que su fila no existe y quedaría
  tratado como `customer` — es decir, con set vacío, y por tanto **redirigido fuera
  del panel aunque se le haya invitado como `admin`**. Mitigado con el upsert JIT
  de `getCurrentUser()`; aun así, la primera carga tras aceptar la invitación puede
  necesitar un refresco, y eso debe probarse en T21.
- **Riesgo de quedarse sin `super_admin`.** El autobloqueo lo previene por
  construcción (nadie puede quitarse su propio rol), y el guard de desactivación de
  usuarios elevados cierra la puerta trasera. Si aun así ocurre, la salida es
  `SEED_SUPER_ADMIN_EMAIL` + `npm run db:seed`, que es idempotente y no destructivo.
- **`currentUser()` cuesta una llamada a la Backend API** y cuenta contra el rate
  limit (100 req/10 s en desarrollo, según `clerk-backend-api`). Por eso solo se
  invoca en el camino frío del upsert JIT; el camino normal es un `SELECT` por el
  índice único de `clerk_id`.
- **El join de permisos corre en cada request protegido.** `cache()` de React lo
  deduplica dentro de un mismo render — el layout lo usa dos veces, para el
  redirect y para la nav, y paga una sola consulta — pero sigue siendo un
  round-trip a Neon por petición. Con 11 permisos y 6 roles es despreciable; si
  molesta, la salida es cachear el set en `publicMetadata` (fuera de alcance)
  asumiendo que la revocación tardará hasta la renovación del token.
- **`x-forwarded-for` es falsificable.** La IP del audit log es indicio, no prueba.
  Debe documentarse en el código para que nadie construya una decisión de
  seguridad sobre ella.
- **PII en `audit_logs`.** Se guarda email en `metadata` de `user.invited` porque
  identifica la cuenta invitada; **nunca** contraseñas, tokens, secretos ni el
  payload crudo del webhook. `changes` de `user.roles_changed` guarda solo
  `roleSlugs`.
- **Un fallo de `logAudit` revierte la mutación.** Es lo que exige
  `docs/SETUP.md` §5.2 regla 2 y lo que mide AC12, pero implica que un problema en
  la tabla de bitácora tumba las escrituras del panel. Es la decisión correcta para
  acciones de seguridad y se acepta a sabiendas para las de categorías.
- **`neon-serverless` (WebSocket) es obligatorio.** Ya está configurado en
  `src/server/db/index.ts` con ese motivo comentado; cambiarlo a `neon-http`
  rompería toda la auditoría transaccional en silencio.
- **`db:seed` sobre una base con datos.** El seed de la fase 1 debe usar
  `onConflictDoNothing` en todo y no borrar nada: `categories` ya tiene filas del
  spec 001 y `users` puede tener personas reales. Ojo con el bucle de
  `role_permissions`: dos roles aportan cero filas y un `INSERT` con array vacío
  falla en Drizzle.
- **Superficie del panel antes de la fase 3.** Entre el fin de la fase 1 y el fin
  de la fase 3, `/admin/categories` sigue abierto (D1 vigente) y no hay redirect.
  No debe haber ningún despliegue público en esa ventana.
- **Fuga de código de servidor al bundle.** Los tipos de `src/modules/*/types/`
  deben importar el schema Drizzle con `import type`, como ya hace
  `category.types.ts`. `src/lib/permissions.ts` se mantiene puro para que un import
  accidental desde cliente no arrastre Clerk ni Drizzle.
- **Rollback.** Revertir la migración borra las 6 tablas; `categories` no se toca,
  así que la vuelta atrás no pierde datos de catálogo. Perdería la bitácora, que es
  precisamente lo que no debería perderse: hacer copia antes de cualquier reversión.
- **Rate limit de invitaciones de Clerk**: 100 por hora para invitaciones
  individuales (`clerk-backend-api`). Suficiente para uso manual; una carga masiva
  necesitaría `createInvitationBulk` (25/hora), fuera de alcance.

## 11. Fuera de alcance / deuda aceptada

- **CRUD de roles y permisos desde la UI.** Los roles se editan cambiando
  `ROLE_DEFINITIONS`/`ROLE_PERMISSION_MATRIX` y re-ejecutando el seed. Retomar
  cuando aparezca un rol que el negocio necesite crear sin desplegar.
- **El seed no revoca permisos de un rol.** `db:seed` concede filas nuevas de
  `role_permissions` y actualiza los metadatos de `roles` y `permissions`
  (`onConflictDoUpdate`), pero nunca borra: quitar un permiso de la matriz en el
  código no lo retira de la base. Hacerlo exige hoy un `DELETE` manual o un seed
  destructivo. Se acepta porque un seed que borre filas sobre una base con datos
  reales es más peligroso que la divergencia, y porque en v1 la matriz solo crece.
  Retomar junto con el CRUD de roles.
- **Permisos de solo lectura del panel para `employee`.** Hoy el rol está vacío a
  propósito. Si el negocio pide que un empleado consulte el catálogo desde el
  panel, la vuelta es añadir `categories.read` a su fila de la matriz y decidir
  entonces qué vistas se muestran en modo consulta — no antes.
- **Página de perfil propia.** Cubierta por el `UserButton` de Clerk (§8). Solo se
  reconsidera si aparece un dato de perfil que sea del dominio y no de la identidad
  (direcciones de envío, preferencias de pedido), es decir, con el módulo de
  clientes.
- **Overrides de permisos por usuario.** Retomar cuando exista un caso real de "a
  esta persona en concreto le falta un permiso puntual"; la tabla pivote sería
  `user_permissions` con una columna `effect` (`grant`/`deny`).
- **Caché del set de permisos en `publicMetadata`.** Solo si el join por request se
  vuelve un cuello de botella medido, no antes.
- **Retención y purga de `audit_logs`.** `docs/SETUP.md` §5.2 sugiere 180 días para
  `info` e indefinido para acciones de seguridad. Requiere un cron que el proyecto
  no tiene; hasta entonces la tabla crece sin límite.
- **Auditoría de accesos denegados** (`auth.forbidden`, `auth.login_failed`).
  Escribir un log fuera de la transacción de negocio necesita una política de
  fallos distinta; se difiere.
- **Reenviar o revocar una invitación pendiente desde el panel.** Hoy se gestiona
  desde el dashboard de Clerk. `revokeInvitation` está disponible en el SDK cuando
  se retome.
- **Filtros no persistidos en la URL** en las tres tablas nuevas. Misma deuda D2
  del spec 001, ahora en cuatro vistas: si se retoma, se retoma para todas a la vez.
- **Sin tests automatizados.** El proyecto sigue sin runner. La verificación de
  este spec es `typecheck` + `lint` + `build` + el recorrido manual de los 18 AC
  con un usuario por rol.
