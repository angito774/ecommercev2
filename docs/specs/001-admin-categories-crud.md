---
id: 001
title: CRUD de categorías en el panel admin
status: done
module: categories
scope: admin
created: 2026-08-28
---

# 001 — CRUD de categorías en el panel admin

## 1. Contexto

El catálogo necesita una taxonomía antes de poder cargar productos: `docs/SETUP.md`
§5.3 define `categories` como 1—N hacia `products`. Hoy `src/server/db/schema/`
solo contiene el barrel vacío (`export {}`), no hay repositorios, ni Route
Handlers, ni rutas bajo `src/app/(admin)/admin/`. Esta es la Fase 1 de una
iniciativa de dos fases (Fase 2 = productos), y por tanto el primer recorrido
completo de la arquitectura Componente → hook → service → Route Handler →
repositorio → Drizzle → Neon. Las decisiones que se tomen aquí fijan el patrón
que copiará el resto del panel.

## 2. Objetivo

Un administrador puede crear, listar, buscar, filtrar, editar y desactivar
categorías desde `/admin/categories`, con la tabla paginada, ordenada y filtrada
en servidor.

## 3. Alcance

### Incluye

- Tabla `categories` plana (sin jerarquía) + migración Drizzle.
- Seed con categorías de ejemplo (`npm run db:seed`).
- Repositorio `category.repository.ts` con listado paginado, búsqueda, filtro por
  estado, orden, lectura por id, creación, actualización y soft delete.
- Route Handlers REST bajo `/api/admin/categories` con validación Zod.
- Módulo cliente `src/modules/categories/` completo: schemas, types, constants,
  service axios, hooks TanStack Query y componentes.
- Componente compartido `src/components/shared/data-table.tsx` (presentacional,
  reutilizable por Fase 2).
- Hook transversal `src/hooks/use-debounce.ts`.
- Shell de administración: `src/app/(admin)/admin/layout.tsx` con navegación
  lateral mínima y `src/app/(admin)/admin/categories/page.tsx`.
- Estados de carga, vacío, sin resultados y error en la vista.
- Confirmación explícita antes de desactivar.

### No incluye (explícito)

- Autenticación, autorización y `audit_logs` — ver §11, deuda aceptada.
- Cualquier cosa de productos (tabla, FK `category_id`, UI): es la Fase 2.
- Vista pública de categorías en el storefront (`/api/categories`, catálogo).
- Borrado físico de categorías.
- Subida de imágenes: `image_url` se captura como URL de texto, sin uploader ni
  blob storage.
- Reordenamiento manual, categorías destacadas, contadores de productos.
- Acciones en lote (desactivar varias a la vez).
- Persistencia de filtros en la URL.

## 4. Criterios de aceptación

- [x] **AC1** — Dado un admin en `/admin/categories`, cuando la página carga,
  entonces ve una tabla con las columnas Nombre, Slug, Estado, Actualizada y
  Acciones, paginada de 10 en 10.
- [x] **AC2** — Dado que existen categorías, cuando el admin escribe en el
  buscador, entonces tras 300 ms la tabla muestra solo las categorías cuyo `name`
  contiene el texto (case-insensitive) y la paginación vuelve a la página 1.
- [x] **AC3** — Dado el filtro de estado, cuando el admin elige `Activas`,
  `Inactivas` o `Todas`, entonces la tabla lista solo las categorías con el
  `is_active` correspondiente; el valor por defecto del filtro es `Todas`.
- [x] **AC4** — Dado el encabezado de una columna ordenable (Nombre, Actualizada,
  Creada), cuando el admin hace clic, entonces el orden se resuelve en servidor y
  alterna asc/desc.
- [x] **AC5** — Dado el formulario de creación, cuando el admin escribe un nombre
  y no ha tocado el campo slug, entonces el slug se autocompleta en kebab-case a
  partir del nombre; si lo edita manualmente, deja de autocompletarse.
- [x] **AC6** — Dado un slug ya existente en la tabla, cuando el admin intenta
  guardar, entonces la API responde `409` y el formulario muestra el error
  asociado al campo slug sin cerrar el diálogo.
- [x] **AC7** — Dado el nombre vacío o de más de 120 caracteres, cuando el admin
  envía, entonces el formulario muestra el error junto al campo y no se emite la
  petición HTTP.
- [x] **AC8** — Dado el botón Desactivar de una fila, cuando el admin confirma en
  el diálogo, entonces la categoría queda con `is_active = false`, sigue
  existiendo en base de datos, la tabla se refresca y aparece un toast de éxito.
- [x] **AC9** — Dada una categoría inactiva, cuando el admin la edita y marca
  Activa, entonces vuelve a `is_active = true` (la reactivación no requiere
  endpoint propio).
- [x] **AC10** — Dado que la consulta falla, cuando la vista renderiza, entonces
  muestra un mensaje de error con botón de reintento, nunca una tabla vacía
  silenciosa.
- [x] **AC11** — Dado que no hay ninguna categoría creada, entonces la tabla
  muestra un estado vacío con acción "Crear categoría"; si hay categorías pero el
  filtro no devuelve ninguna, el mensaje es "Sin resultados" con acción para
  limpiar filtros. Son dos mensajes distintos.
- [x] **AC12** — Dado un `id` inexistente en `GET`/`PATCH`/`DELETE`, entonces la
  API responde `404` con `{ message }`.
- [x] **AC13** — `npm run typecheck && npm run lint && npm run build` en verde.

## 5. Modelo de datos

Tabla nueva `categories`. **Requiere migración** (`npm run db:generate` +
`npm run db:migrate`). Es la primera tabla del proyecto, por lo que la migración
inicial en `drizzle/` se crea con ella.

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | `uuid` | PK, `defaultRandom()` |
| `name` | `varchar(120)` | not null |
| `slug` | `varchar(140)` | not null, **unique** |
| `description` | `text` | nullable |
| `image_url` | `varchar(500)` | nullable |
| `is_active` | `boolean` | not null, default `true` — soft delete |
| `created_at` | `timestamptz` | not null, default `now()` |
| `updated_at` | `timestamptz` | not null, default `now()`, `$onUpdate` |

Índices:

- `categories_slug_unique` — unique sobre `slug` (constraint).
- `categories_is_active_idx` — btree sobre `is_active`, sostiene el filtro por estado.
- `categories_created_at_idx` — btree descendente sobre `created_at`, sostiene el orden por defecto.

Sin índice para la búsqueda por `name`: se resuelve con `ILIKE '%texto%'`, que un
btree no puede usar. Aceptado a sabiendas (ver §10).

Relaciones: ninguna en esta fase. En Fase 2, `products.category_id` referenciará
`categories.id`; por eso el borrado es lógico y no físico.

```ts
// src/server/db/schema/category.ts — firma propuesta
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 140 }).notNull().unique(),
    description: text('description'),
    imageUrl: varchar('image_url', { length: 500 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('categories_is_active_idx').on(t.isActive), index('categories_created_at_idx').on(t.createdAt.desc())],
);
```

## 6. Contratos de API

Base: `/api/admin/categories`. **Auth: ninguna en esta fase** (§11).

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/categories` | — (deuda) | query: `q`, `status`, `page`, `pageSize`, `sortBy`, `sortDir` | `CategoryListResponse` | 400, 500 |
| POST | `/api/admin/categories` | — (deuda) | `CreateCategoryInput` | `201` `Category` | 400, 409, 500 |
| GET | `/api/admin/categories/[id]` | — (deuda) | — | `Category` | 400, 404, 500 |
| PATCH | `/api/admin/categories/[id]` | — (deuda) | `UpdateCategoryInput` | `200` `Category` | 400, 404, 409, 500 |
| DELETE | `/api/admin/categories/[id]` | — (deuda) | — | `200` `Category` (con `isActive: false`) | 400, 404, 500 |

Forma de error uniforme: `{ message: string }`, más `{ message, issues }` en los
`400` de Zod. Es la forma que ya normaliza el interceptor de `src/lib/axios.ts`
(`error.response?.data?.message ?? ... ?? error.message`), verificado en el repo.

### Schemas Zod (`src/modules/categories/schemas/category.schema.ts`)

```ts
export const categorySlugSchema = z
  .string()
  .min(2)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones');

// Los campos base van SIN `default`: en Zod 4 `.partial()` conserva el
// `ZodDefault` interno y lo aplicaría a las claves ausentes de un PATCH,
// sobrescribiendo campos que el cliente nunca envió.
const categoryFields = z.object({
  name: z.string().trim().min(2).max(120),
  slug: categorySlugSchema,
  description: z.string().trim().max(1000).nullable(),
  imageUrl: z.url().max(500).nullable(),
  isActive: z.boolean(),
});

export const createCategorySchema = categoryFields.extend({
  description: categoryFields.shape.description.default(null),
  imageUrl: categoryFields.shape.imageUrl.default(null),
  isActive: categoryFields.shape.isActive.default(true),
});

// El `refine` deja que el `400` de un PATCH con cuerpo vacío salga de la
// validación Zod y no de un "No values to set" de Drizzle convertido en 500.
export const updateCategorySchema = categoryFields
  .partial()
  .refine((values) => Object.keys(values).length > 0, 'Debe enviar al menos un campo');

export const categoryQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const categoryIdSchema = z.uuid();
```

`sortBy` es un `enum` cerrado a propósito: el repositorio mapea ese literal a la
columna Drizzle, de modo que nunca llega un identificador arbitrario a la consulta.

Respuesta del listado:

```ts
type CategoryListResponse = {
  data: Category[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};
```

## 7. Arquitectura y archivos afectados

Mapa capa por capa según `docs/SETUP.md` §3.

- `src/server/db/schema/` — **nuevo** `category.ts`; **modificado** `index.ts` (barrel, hoy `export {}`).
- `src/server/db/` — **nuevo** `seed.ts` (el script `db:seed` ya lo apunta en `package.json` pero el archivo no existe).
- `drizzle/` — **nuevo** migración generada (directorio hoy vacío).
- `src/server/repositories/` — **nuevo** `category.repository.ts`. Única capa que toca Drizzle.
- `src/server/services/` — sin cambios: no hay regla de negocio que cruce repositorios.
- `src/app/api/admin/categories/` — **nuevo** `route.ts` (GET, POST) y `[id]/route.ts` (GET, PATCH, DELETE).
- `src/app/(admin)/admin/` — **nuevo** `layout.tsx` (shell con nav) y `categories/page.tsx` (Server Component, solo compone).
- `src/modules/categories/schemas/` — **nuevo** `category.schema.ts`.
- `src/modules/categories/types/` — **nuevo** `category.types.ts` (infiere de Drizzle).
- `src/modules/categories/constants.ts` — **nuevo** (query keys, tamaños de página, opciones de estado).
- `src/modules/categories/services/` — **nuevo** `category.service.ts` (axios).
- `src/modules/categories/hooks/` — **nuevo** `use-categories.ts`, `use-category-mutations.ts`.
- `src/modules/categories/components/` — **nuevo** `categories-table.tsx`, `category-columns.tsx`, `category-form-dialog.tsx`, `delete-category-dialog.tsx`.
- `src/modules/categories/store/` — no se crea: sin estado UI global.
- `src/components/shared/` — **nuevo** `data-table.tsx`.
- `src/components/ui/` — componentes shadcn faltantes vía `npx shadcn@latest add`.
- `src/hooks/` — **nuevo** `use-debounce.ts`.
- `src/lib/utils.ts` — **modificado**: añade `slugify()` e `isUniqueViolation()`.
- `src/proxy.ts` — **sin cambios**. No lleva lógica de auth (CLAUDE.md regla 9).

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Rutas admin bajo `/api/admin/categories` | Reutilizar `/api/categories` para admin y storefront | `docs/SETUP.md` §3 reserva `api/admin/` para el panel y `api/categories/route.ts` para el consumo público de Fase 2. Separarlas hace que retirar la deuda de auth (§11) sea quirúrgico: se añade la verificación solo en `api/admin/`, sin tocar el storefront |
| Paginación, orden, búsqueda y filtro **en servidor** (`manualPagination`/`manualSorting`/`manualFiltering` de TanStack Table) | Traer todas las filas y filtrar en cliente | Categorías son pocas hoy, pero la Fase 2 (productos) reutiliza el mismo componente de tabla con miles de filas. Un solo patrón evita reescribirlo entonces |
| `src/components/shared/data-table.tsx` **presentacional**: recibe una instancia `Table<TData>` ya construida más `isLoading`/`isError`/`empty` | Componente de tabla "de configuración" que recibe `columns`, `data` y opciones y construye el `useReactTable` por dentro | `docs/SETUP.md` §3 nombra explícitamente `shared/data-table`, así que no es una abstracción especulativa sino la ubicación prescrita. Mantenerlo presentacional evita el god component: cada dominio decide su propia forma de estado y el compartido solo renderiza `<Table>` + estados. Fase 2 lo consume sin modificarlo |
| Soft delete vía `DELETE` que hace `UPDATE is_active = false`; la reactivación va por `PATCH { isActive: true }` | Endpoints `POST /:id/archive` y `POST /:id/restore` | Menos superficie de API para el mismo comportamiento. El verbo `DELETE` conserva la semántica que espera el cliente y el spec documenta que la operación es lógica |
| El conflicto de slug se detecta por el **constraint unique** (código Postgres `23505`) mapeado a `409`, no por un `SELECT` previo | `findBySlug()` antes de insertar | Un pre-check es una condición de carrera: entre el `SELECT` y el `INSERT` otra petición puede tomar el slug. La restricción de base de datos es la única fuente de verdad |
| Formularios con React Hook Form + los primitivos `Field*` ya instalados en `src/components/ui/field.tsx` | `npx shadcn@latest add form` | Verificado en el repo: `field.tsx` existe y `form.tsx` no. El estilo configurado en `components.json` es `radix-nova`, que expone la API `Field`. Se usa lo instalado en lugar de introducir una segunda convención de formularios |
| Estado vacío como `prop` del `DataTable` | Componente `shared/empty-state.tsx` propio | La vista necesita **dos** mensajes distintos (sin datos vs. sin resultados, AC11). Pasarlos como nodo desde el dominio evita un componente con banderas. Se extraerá cuando haya un tercer consumidor, según CLAUDE.md §6 |
| Filtros y paginación en estado local de React + `useDebounce` de 300 ms | Zustand, o `searchParams` en la URL | CLAUDE.md regla 6: Zustand es para estado UI **global**, y estos filtros viven en una sola vista. La URL sería mejor para compartir enlaces; se difiere a §11 |
| Formulario de alta y edición en un `Dialog` compartido | Rutas `categories/new` y `categories/[id]/edit` | El formulario tiene cinco campos. Un diálogo mantiene el contexto de la tabla y ahorra dos rutas y dos fetches por id |
| `Category` se infiere con `InferSelectModel` importado con `import type` | Reescribir la interfaz a mano en `types/` | CLAUDE.md regla 5. El `import type` es obligatorio: un import de valor arrastraría el schema Drizzle al bundle del cliente (ver §10) |
| Confirmación obligatoria antes de desactivar, y toast de éxito tras cada mutación | Desactivar directo desde el menú de fila | Skill `ui-ux-pro-max` (dominio `ux`): "Confirmation Dialogs — prevent accidental destructive actions", severidad Alta; y "Success Feedback — don't: action completes silently". `sonner` ya está montado en `src/app/layout.tsx` |
| Búsqueda con debounce de 300 ms y reinicio de página a 1 | Buscar en cada pulsación | Skill `ui-ux-pro-max` (`references/quick-reference.md` §3, `debounce-throttle`). Sin el reinicio de página, buscar desde la página 3 devuelve un listado vacío que parece un bug |
| Estados vacíos diferenciados con acción sugerida | Un único "No hay datos" | Skill `ui-ux-pro-max` (dominio `ux`): "Search / No Results — do: show 'No results' with suggestions; don't: blank screen or '0 results'" |

Skills del mapa de CLAUDE.md §8 que **no** están instaladas en esta sesión y por
tanto no se usaron: `superpowers:writing-plans`, `superpowers:brainstorming`,
`vercel:nextjs`, `vercel:shadcn`, `vercel:vercel-storage`. Las decisiones de
Next 16 y Drizzle de este spec se apoyan en `docs/SETUP.md` y en el código ya
presente en el repositorio, no en memoria del modelo.

## 9. Tareas

- [x] **T1** — Definir la tabla `categories` según §5 · archivo: `src/server/db/schema/category.ts` · verificación: `npm run typecheck`
- [x] **T2** — Exportar `categories` desde el barrel, reemplazando el `export {}` actual · archivo: `src/server/db/schema/index.ts` · verificación: `npm run typecheck`
- [x] **T3** — Generar y aplicar la migración inicial · archivo: `drizzle/` (generado) · verificación: `npm run db:generate && npm run db:migrate`
- [x] **T4** — Crear el seed con 5–8 categorías de tecnología, al menos una con `is_active: false`, idempotente vía `onConflictDoNothing` sobre `slug` · archivo: `src/server/db/seed.ts` · verificación: `npm run db:seed`
- [x] **T5** — Implementar el repositorio con `findMany` (búsqueda `ilike` sobre `name`, filtro por estado, orden por columna del enum, `limit`/`offset` y `count` total), `findById`, `create`, `update` y `softDelete` · archivo: `src/server/repositories/category.repository.ts` · verificación: `npm run typecheck`
- [x] **T6** — Definir los schemas Zod de §6 y sus tipos inferidos · archivo: `src/modules/categories/schemas/category.schema.ts` · verificación: `npm run typecheck`
- [x] **T7** — Derivar `Category` con `InferSelectModel` (import type) y declarar `CategoryListResponse` · archivo: `src/modules/categories/types/category.types.ts` · verificación: `npm run typecheck`
- [x] **T8** — Declarar query keys de TanStack Query, `DEFAULT_PAGE_SIZE`, opciones de estado y de orden · archivo: `src/modules/categories/constants.ts` · verificación: `npm run typecheck`
- [x] **T9** — Añadir los helpers puros `slugify(input: string)` e `isUniqueViolation(error: unknown)` (código `23505`) · archivo: `src/lib/utils.ts` · verificación: `npm run typecheck`
- [x] **T10** — Implementar `GET` (parsea `searchParams` con `categoryQuerySchema`) y `POST` (`createCategorySchema`, `201`, `409` ante `isUniqueViolation`) · archivo: `src/app/api/admin/categories/route.ts` · verificación: `npm run build`
- [x] **T11** — Implementar `GET`, `PATCH` y `DELETE` por id, validando el param con `categoryIdSchema` y tipando el contexto con `RouteContext<'/api/admin/categories/[id]'>` (`params` es una promesa en Next 16) · archivo: `src/app/api/admin/categories/[id]/route.ts` · verificación: `npm run build`
- [x] **T12** — Implementar el service axios tipado sobre la instancia `api` de `src/lib/axios.ts` · archivo: `src/modules/categories/services/category.service.ts` · verificación: `npm run typecheck`
- [x] **T13** — Implementar `useCategories(params)` con `placeholderData: keepPreviousData` para que la tabla no parpadee al paginar · archivo: `src/modules/categories/hooks/use-categories.ts` · verificación: `npm run typecheck`
- [x] **T14** — Implementar `useCreateCategory`, `useUpdateCategory` y `useDeleteCategory`, cada una invalidando la query key del listado y emitiendo su toast · archivo: `src/modules/categories/hooks/use-category-mutations.ts` · verificación: `npm run typecheck`
- [x] **T15** — Implementar el hook transversal `useDebounce<T>(value, delay)` · archivo: `src/hooks/use-debounce.ts` · verificación: `npm run typecheck`
- [x] **T16** — Instalar los componentes shadcn faltantes: `npx shadcn@latest add alert-dialog textarea switch` · archivo: `src/components/ui/` · verificación: `npm run lint`
- [x] **T17** — Implementar el `DataTable` presentacional: recibe la instancia de tabla y los estados de carga (skeleton), error (mensaje + reintento) y vacío (nodo recibido por prop); envuelto en `overflow-x-auto` · archivo: `src/components/shared/data-table.tsx` · verificación: `npm run typecheck`
- [x] **T18** — Definir las columnas: Nombre, Slug, Estado (`Badge`), Actualizada, y menú de acciones · archivo: `src/modules/categories/components/category-columns.tsx` · verificación: `npm run typecheck`
- [x] **T19** — Implementar el diálogo de formulario (alta y edición) con React Hook Form + `zodResolver` + primitivos `Field*`, autocompletado de slug desde el nombre y mapeo del `409` al campo slug · archivo: `src/modules/categories/components/category-form-dialog.tsx` · verificación: `npm run typecheck`
- [x] **T20** — Implementar el diálogo de confirmación de desactivación con `AlertDialog` · archivo: `src/modules/categories/components/delete-category-dialog.tsx` · verificación: `npm run typecheck`
- [x] **T21** — Implementar el contenedor cliente: `"use client"`, estado de búsqueda/estado/paginación/orden, `useReactTable` en modo manual, y composición de `DataTable` con los dos diálogos · archivo: `src/modules/categories/components/categories-table.tsx` · verificación: `npm run build`
- [x] **T22** — Crear el shell de administración con navegación lateral (enlace a Categorías) · archivo: `src/app/(admin)/admin/layout.tsx` · verificación: `npm run build`
- [x] **T23** — Crear la página Server Component que solo pone título y monta `CategoriesTable`, con su `metadata` · archivo: `src/app/(admin)/admin/categories/page.tsx` · verificación: `npm run build`
- [x] **T24** — Recorrer los criterios de aceptación en `npm run dev` y cerrar con `npm run typecheck && npm run lint && npm run build` · archivo: — · verificación: los tres comandos en verde

### Correcciones de la iteración 1 de review

- [x] **C1** (bloqueante, sobre T19) — `emptyToNull` recibía el default `null` del
  montaje de React Hook Form y reventaba con `TypeError`, tumbando alta y edición.
  Ahora acepta `unknown` y solo llama `trim()` sobre strings · archivo:
  `src/modules/categories/components/category-form-dialog.tsx` · desbloquea AC5, AC6, AC7, AC9
- [x] **C2** (bloqueante, sobre T6) — `updateCategorySchema` heredaba los
  `ZodDefault` de creación, así que un `PATCH` parcial reescribía los campos
  ausentes y reactivaba la categoría. Los `default` se movieron al schema de
  creación y el update parte de `categoryFields` sin defaults · archivo:
  `src/modules/categories/schemas/category.schema.ts` + §6 del spec · protege AC8
- [x] **C3** (mayor, sobre T11) — `PATCH` con cuerpo vacío caía en "No values to
  set" de Drizzle y devolvía 500 en vez del 400 del contrato de §6. Resuelto con
  el `refine` de objeto no vacío en `updateCategorySchema`, que reutiliza la
  validación Zod ya presente en el handler · archivo:
  `src/modules/categories/schemas/category.schema.ts`
- [x] **C4** (mayor, sobre T22) — El ítem de navegación `Dashboard` apuntaba a
  `/admin`, ruta inexistente (404). Eliminado; la nav queda solo con Categorías,
  que era lo que pedía la tarea · archivo: `src/app/(admin)/admin/layout.tsx`
- [x] **C5** (mayor, sobre T8/T12/T6) — Retirado el código sin ningún consumidor
  (CLAUDE.md §6): `CATEGORY_SORT_OPTIONS` y `categoryKeys.details`/`detail`
  (`src/modules/categories/constants.ts`), `fetchCategory`
  (`src/modules/categories/services/category.service.ts`), `CreateCategoryInput`
  y `CategoryQueryInput` (`src/modules/categories/schemas/category.schema.ts`)

### Cierre de review — iteración 2 (APROBADO)

Verificación mecánica: `npm run typecheck` sin salida, `npm run lint` con 0
errores (1 warning inherente a `useReactTable` bajo React Compiler) y
`npm run build` compilando las 7 rutas. Las cinco correcciones C1–C5 se
comprobaron empíricamente, no solo por lectura:

- **C1** — `emptyToNull` devuelve `null` sin lanzar para `null`, `undefined`,
  `''` y `'   '`, y `'texto'` para una cadena con contenido.
- **C2** — `PATCH { "name": "…" }` sobre una categoría con `description` e
  `imageUrl` poblados los conserva intactos; `PATCH { "isActive": true }` sobre
  una categoría desactivada la reactiva sin tocar el resto (AC9).
- **C3** — `PATCH {}` responde `400` con
  `{ message, issues: [{ message: 'Debe enviar al menos un campo' }] }`.
- **C4** — `NAV_ITEMS` del layout contiene únicamente Categorías.
- **C5** — Sin referencias residuales a `CATEGORY_SORT_OPTIONS`,
  `categoryKeys.details`/`detail`, `fetchCategory`, `CreateCategoryInput` ni
  `CategoryQueryInput` en todo `src/`.

Recorrido de API contra la base real: `201` en alta, `409` en slug duplicado,
`400` en `pageSize=999` y en `sortBy=id` (enum cerrado), `404` en `GET`/`PATCH`/
`DELETE` con id inexistente, `400` con id no-UUID, `DELETE` dejando la fila con
`is_active = false`, búsqueda `q=MON` devolviendo `Monitores` y orden por nombre
ascendente resuelto en servidor. La fila de prueba creada durante la auditoría se
eliminó al terminar.

Pasada de seguridad manual (la skill `security-review` no pudo ejecutarse: el
repositorio no tiene `origin/HEAD`). Los objetos Zod descartan las claves
desconocidas, de modo que un `PATCH` con `id` o `createdAt` no las propaga al
repositorio; el `ORDER BY` se resuelve contra un mapa cerrado; los `500`
devuelven un mensaje genérico y el detalle solo va a `console.error`. La deuda
D1 (§11) sigue siendo el riesgo abierto de esta fase.

## 10. Riesgos y consideraciones

- **Fuga de código de servidor al bundle.** `category.types.ts` importa el schema
  Drizzle solo para inferir. Si el import no es `import type`, el bundle del
  cliente arrastra `drizzle-orm` y `@neondatabase/serverless`. Verificable en
  `npm run build` mirando el tamaño de la ruta `/admin/categories`.
- **Búsqueda `ILIKE '%texto%'`.** Hace scan secuencial y ningún btree la
  aprovecha. Aceptable con decenas de categorías; en Fase 2, con productos, hará
  falta `pg_trgm` con índice GIN o búsqueda full-text.
- **Dos consultas por listado** (filas + `count`). No es un N+1, pero duplica el
  round-trip a Neon. Aceptado por simplicidad; si molesta, se resuelve con
  `count(*) OVER ()` en la misma consulta.
- **Carrera en el slug.** Resuelta con el constraint unique, no con pre-check
  (§8). El handler debe distinguir el `23505` de cualquier otro error de base y
  no convertir todo fallo de escritura en un `409`.
- **Unicidad del slug incluye las inactivas.** Desactivar `laptops` no libera su
  slug: crear otra `laptops` dará `409`. Es deliberado — evita romper URLs y
  colisionar cuando la categoría se reactive. El mensaje de error debe decirlo
  para que no parezca un fallo.
- **Datos existentes:** ninguno. Tabla nueva sobre un schema vacío, sin riesgo de
  pérdida. Rollback = revertir la migración y borrar la tabla.
- **`useDebounce` con reinicio de página.** Si se cambia el término de búsqueda
  sin volver a `page: 1`, la consulta devuelve un array vacío desde una página
  alta y la UI parece rota. Está en AC2 justamente para que se pruebe.
- **Sin cabeceras de caché en los handlers.** Los Route Handlers de `/api/admin/`
  no deben quedar cacheados: en Next 16 los Route Handlers son dinámicos por
  defecto, pero no se debe añadir `revalidate` ni cachear respuestas de mutación.
- **Seguridad — riesgo abierto y conocido:** los endpoints quedan accesibles sin
  sesión. Cualquiera que alcance el despliegue puede crear, editar y desactivar
  categorías. Ver §11.

## 11. Fuera de alcance / deuda aceptada

### D1 — Sin autenticación ni autorización (deuda deliberada) — ✅ RETIRADA

> **Estado: retirada el 2026-09-01** por la Fase 3 (T22–T28) de
> [`docs/specs/002-rbac-clerk-roles-permisos.md`](002-rbac-clerk-roles-permisos.md).
> Los 5 puntos del plan de retiro están cumplidos: las 6 tablas RBAC y su seed
> existen (002 T1–T9, T17), `src/lib/permissions.ts`, `src/lib/auth.ts` y
> `src/lib/audit.ts` existen (002 T10, T15, T16), el layout de admin llama
> `await auth.protect()` y redirige a `/` con el set de permisos vacío (002 T25),
> la page llama `await requirePermission('categories.read')` (002 T26), los 5
> handlers de `/api/admin/categories/**` devuelven `401` sin sesión y `403` sin
> permiso (002 T23–T24), y las 3 mutaciones escriben `category.created`,
> `category.updated` y `category.deactivated` en `audit_logs` dentro de la misma
> transacción (002 T22–T24). El registro histórico de abajo se conserva sin tocar
> para que quede rastro de por qué el código lució así entre el 2026-08-28 y el
> 2026-09-01.

**Decisión explícita del usuario, 2026-08-28.** Esta fase se implementa **sin**
verificación de sesión ni de permisos:

- Las páginas `src/app/(admin)/admin/**` no llaman a `await auth.protect()`.
- Los Route Handlers de `/api/admin/categories/**` no llaman a `await auth()` ni
  a `requirePermission(...)`, y no devuelven `401`.
- No existen `src/lib/auth.ts`, `src/lib/permissions.ts` ni `src/lib/audit.ts`
  (verificado: `src/lib/` contiene solo `axios.ts`, `constants.ts`,
  `query-client.ts` y `utils.ts`).
- No existen las tablas RBAC (`users`, `roles`, `permissions`,
  `role_permissions`, `user_roles`) ni `audit_logs` de `docs/SETUP.md` §5.1–5.2.

Esto **incumple a sabiendas las reglas 8, 10 y 11 de CLAUDE.md** y §6 de
`docs/SETUP.md`. Se registra aquí para que el reviewer no lo trate como hallazgo
bloqueante de esta fase y para que quede rastro de por qué el código luce así.
`src/proxy.ts` no cubre este hueco: no lleva lógica de auth por diseño.

Retiro de la deuda, en una fase futura de auth/RBAC, antes de cualquier despliegue
accesible públicamente:

1. Tablas RBAC + seed de `permissions` con los códigos `categories.read`,
   `categories.create`, `categories.update`, `categories.delete`.
2. `src/lib/auth.ts` y `src/lib/permissions.ts` con `requirePermission()`.
3. `await auth.protect()` en `src/app/(admin)/admin/layout.tsx` y en la page.
4. `const { isAuthenticated } = await auth()` + `401` explícito con `{ message }`
   en cada handler de `/api/admin/categories/**`, más el `requirePermission`
   correspondiente (`docs/SETUP.md` §6, tabla de formas exactas).
5. `logAudit()` en la misma transacción de cada mutación de categorías
   (`category.created`, `category.updated`, `category.deactivated`).

Los puntos 3 y 4 son aditivos: no obligan a reescribir repositorio, service,
hooks ni componentes.

### D2 — Otras deudas menores

- **Filtros no persistidos en la URL.** Recargar `/admin/categories` pierde
  búsqueda, filtro y página, y los enlaces no son compartibles. Se difería a
  "cuando la vista de productos de Fase 2 necesite enlaces profundos": esa vista
  ya existe (spec 003) y no los ha necesitado, pero la deuda pasó de una vista a
  **cinco** —categorías, usuarios, bitácora, productos y la que venga—, así que la
  condición de retomarla ya no es la Fase 2 sino el primer caso real de enlace
  compartido. Cuando llegue, se resuelve una vez en un helper compartido y no
  cinco veces.
- **`image_url` como texto libre.** Sin uploader ni validación de que la imagen
  exista. Retomar junto con el blob storage de las imágenes de producto.
  `z.url()` además acepta esquemas `javascript:` y `data:`; hoy no hay superficie
  porque el valor no se renderiza en ninguna vista, pero el storefront de Fase 2
  debe restringir el protocolo a `http`/`https` antes de pintarlo.
- **Sin acciones en lote ni exportación.** Se evalúa cuando el volumen de
  categorías lo justifique.
- **Sin tests automatizados.** El proyecto aún no tiene runner de tests
  configurado; la verificación de esta fase es `typecheck` + `lint` + `build` +
  recorrido manual de los AC. Instalar el runner es una tarea propia, no de este
  spec.
- **Índice de búsqueda.** `pg_trgm`/GIN sobre `name` cuando la tabla crezca o
  cuando la Fase 2 comparta el patrón de búsqueda con productos.
