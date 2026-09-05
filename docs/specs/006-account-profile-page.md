---
id: 006
title: Vista de cuenta — perfil de Clerk, favoritos y compras
status: done
module: account
scope: client
created: 2026-09-05
---

# 006 — Vista de cuenta: perfil de Clerk, favoritos y compras

## 1. Contexto

El storefront ya tiene sesión: `src/app/(storefront)/layout.tsx` renderiza un
`AuthSlot` en el servidor que, con sesión iniciada, baja al header un enlace a
`/admin/products` y el `AccountMenu`. Ese menú
(`src/modules/storefront/components/account-menu.tsx`) es un dropdown propio —no
el `<UserButton />` de Clerk— con exactamente dos acciones: «Ver perfil», que
abre el modal `openUserProfile()` de Clerk, y «Cerrar sesión».

La consecuencia es que **el cliente con sesión no tiene ninguna página suya en la
tienda**. Todo lo que puede hacer es abrir un modal de Clerk encima de la portada.
No hay URL donde ver sus datos, ni sitio donde vayan a aterrizar mañana sus
favoritos y sus pedidos. `docs/SETUP.md` §6 lista «perfil (Clerk)» como módulo
del cliente y §3 reserva `(storefront)/orders/` para el historial de pedidos,
pero ninguno de los dos existe todavía en el árbol.

Los servicios de favoritos y de compras **no existen**: no hay tabla `favorites`,
no hay `orders` ni `order_items` en `src/server/db/schema/`, y no hay repositorio
ni endpoint para ninguno de los dos. Esta feature construye la casa; el mobiliario
llega en sus propios specs.

## 2. Objetivo

Un cliente con sesión puede abrir `/account` desde el menú de su foto de perfil y
ver sus datos reales de Clerk, más las dos secciones donde vivirán sus favoritos
y sus compras, cada una con un estado vacío que lo devuelve al catálogo.

## 3. Alcance

### Incluye

- Ruta privada `/account`: Server Component que se verifica a sí mismo con
  `await auth.protect()` (`docs/SETUP.md` §6, fila «Page / layout»).
- Lectura del perfil con `currentUser()` de `@clerk/nextjs/server`, recortada a un
  DTO plano `AccountProfile` antes de llegar a la vista.
- Tres secciones ancladas en la misma página: `#perfil`, `#favoritos`, `#compras`,
  con una navegación lateral pegajosa en escritorio.
- Sección «Mi perfil»: avatar, nombre, correo primario con su estado de
  verificación, teléfono si existe, alta y último acceso; más un botón que abre el
  `openUserProfile()` de Clerk para editar (la edición sigue siendo de Clerk).
- Secciones «Mis favoritos» y «Mis compras»: **solo UI de estado vacío**, con copy
  directivo y CTA al catálogo. Sin datos, sin hook, sin service, sin endpoint.
- Entrada desde el dropdown de la foto de perfil: `AccountMenu` gana «Mi cuenta»
  → `/account` y renombra la acción del modal a «Gestionar mi cuenta».
- `metadata` con `robots: { index: false }`: es una página privada.

### No incluye (explícito)

- **Backend de favoritos.** Ni tabla, ni repositorio, ni Route Handler, ni hook,
  ni botón de «guardar» en la tarjeta de producto. El pedido es explícito: aún no
  existen esos servicios y este spec no los inventa.
- **Backend de compras.** Igual. `orders` y `order_items` están en
  `docs/SETUP.md` §5.3 pero sin schema ni spec, y su historial tiene su propia
  ruta reservada (`(storefront)/orders/`).
- **Edición de datos desde nuestra UI.** Nombre, foto, correo, contraseña y MFA se
  cambian en el modal de Clerk. No se construye formulario propio ni Server Action.
- **Borrado de cuenta.**
- **Direcciones de envío y métodos de pago.** Llegan con el checkout.
- **Mostrar el rol o los permisos del usuario.** `getEffectivePermissions()` no se
  invoca: esta página no autoriza nada por permiso, solo exige sesión.
- **Cambios de esquema.** Nada nuevo en Postgres. La tabla espejo `users` ni
  siquiera se lee (D-2).
- **Cambios en `src/proxy.ts`, `src/lib/permissions.ts` y `next.config.ts`.**
- **Enlace a `/account` desde el menú móvil y el footer.** El disparador del
  `AccountMenu` ya es visible en todos los breakpoints (verificado: `size-11`
  sin `lg:hidden` en `storefront-header.tsx:167`).
- **Theming de la UI de Clerk.** El modal sale con su apariencia por defecto.

## 4. Criterios de aceptación

- [x] **AC1** — Dado un visitante sin sesión, cuando abre `/account`, entonces
      recibe `307` a `/sign-in?redirect_url=…%2Faccount` y, tras iniciar sesión,
      aterriza en `/account` y no en la portada.
- [x] **AC2** — Dado un cliente con sesión, cuando abre `/account`, entonces
      recibe `200` y el **HTML inicial** ya contiene su nombre, su correo primario
      y la URL de su avatar de Clerk (no aparecen solo al hidratar).
- [x] **AC3** — Dada una cuenta sin `firstName` ni `lastName`, cuando se abre
      `/account`, entonces el título cae al correo primario y el avatar cae a sus
      iniciales o al icono de usuario; en ningún caso se pinta `null`, `undefined`
      ni una fila vacía.
- [x] **AC4** — Dado un correo primario con `verification.status === 'verified'`,
      cuando se abre la ficha, entonces la fila del correo muestra «Verificado»; y
      con cualquier otro estado muestra «Sin verificar». Una cuenta sin correo
      primario no renderiza la fila.
- [x] **AC5** — Dada una cuenta sin teléfono, cuando se abre la ficha, entonces la
      fila de teléfono **no se renderiza** (no queda un `dt` con un guion).
- [x] **AC6** — Dada la sección «Mis favoritos», cuando se abre `/account`,
      entonces muestra su estado vacío con un CTA que lleva a `/#catalogo`, y en
      todo el diff **no** existe ningún repositorio, service, hook o Route Handler
      de favoritos.
- [x] **AC7** — Dada la sección «Mis compras», entonces se cumple lo mismo que
      AC6 con su propio copy y su CTA.
- [x] **AC8** — Dado el menú de la foto de perfil, cuando se abre, entonces
      contiene «Mi cuenta» (navega a `/account` como navegación de cliente, sin
      recarga), «Gestionar mi cuenta» (abre el modal de Clerk) y «Cerrar sesión»,
      y ninguna de las tres etiquetas se repite.
- [x] **AC9** — Dado el payload RSC de `/account`, cuando se inspecciona, entonces
      **no** contiene `privateMetadata`, `unsafeMetadata`, `publicMetadata`,
      `banned`, `locked`, `externalId` ni el `raw` del objeto de Clerk.
- [x] **AC10** — Dada la navegación lateral, cuando se pulsa «Mis compras»,
      entonces la página desplaza a la sección `#compras`; y cuando se carga
      `/account#compras` directamente, entonces aterriza en esa sección.
- [x] **AC11** — Dada `/account`, cuando se lee su HTML, entonces incluye
      `<meta name="robots" content="noindex">`.
- [x] **AC12** — Dada `/account` a 390 px de ancho, cuando se navega, entonces la
      columna es única, no hay scroll horizontal en el `body` y todo objetivo
      táctil mide ≥ 44 px de alto.
- [x] **AC13** — Dado `prefers-reduced-motion: reduce`, cuando se carga
      `/account`, entonces todo el contenido es visible en su estado final y no se
      ejecuta ninguna animación de entrada.
- [x] **AC14** — Dado el proyecto completo, cuando se ejecuta
      `npm run typecheck && npm run lint && npm run build`, entonces los tres pasan
      y `/account` aparece como ruta **dinámica** en la salida del build.
- [x] **AC15** — Dado el diff completo, cuando se revisa, entonces `src/proxy.ts`,
      `src/lib/permissions.ts`, `next.config.ts` y `src/server/**` están sin tocar.

## 5. Modelo de datos

**Sin cambios de esquema.** No hay tablas ni columnas nuevas, ni migración, ni
`db:generate`. Esta feature no consulta Postgres en ningún punto: la única fuente
de datos es la Backend API de Clerk a través de `currentUser()`.

### 5.1 Proyección del perfil (no es una tabla)

`currentUser()` devuelve una **instancia de la clase `User`** de `@clerk/backend`
(verificado en `node_modules/@clerk/backend/dist/api/resources/User.d.ts`), con
32 propiedades entre las que van `privateMetadata`, `unsafeMetadata`, `banned`,
`locked`, `externalId` y el getter `raw`. Se recorta en el borde a un objeto plano
y serializable, con la misma disciplina de DTO de los specs 004 y 005:

```ts
// src/modules/account/types/account.types.ts — firma propuesta
export type AccountProfile = {
  fullName: string | null;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  imageUrl: string;
  // Fallback del avatar cuando Clerk no sirve foto propia (`hasImage === false`).
  initials: string;
  // ISO. `User.createdAt` y `User.lastSignInAt` llegan como Unix ms.
  createdAt: string;
  lastSignInAt: string | null;
};
```

Campos de Clerk deliberadamente **fuera** del DTO y por qué:

| Campo | Motivo |
|---|---|
| `privateMetadata`, `publicMetadata`, `unsafeMetadata` | Contenedores abiertos: lo que hoy está vacío mañana lleva datos internos y viajaría al navegador sin que nadie lo decida. |
| `banned`, `locked`, `passwordEnabled`, `totpEnabled`, `backupCodeEnabled` | Estado de seguridad de la cuenta. Se muestra y se cambia en el modal de Clerk, que es su dueño. |
| `externalId`, `id`, `primaryEmailAddressId` | Identificadores de sistema, sin lectura para el cliente. |
| `emailAddresses[]`, `phoneNumbers[]` completos | La ficha muestra el primario; la lista completa es material del modal de Clerk. |
| `externalAccounts[]`, `enterpriseAccounts[]`, `web3Wallets[]` | Fuera de alcance para esta primera vista. |
| `raw` | El JSON íntegro de la Backend API. Serializarlo anularía todo lo anterior. |

## 6. Contratos de API

**Ningún endpoint nuevo.** No hay Route Handler, no hay service de axios y no hay
hook de TanStack Query, porque no hay ningún dato propio que pedir: el perfil se
lee en el servidor y las otras dos secciones no tienen datos.

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/account` (page, no API) | cliente con sesión — `await auth.protect()` | — | HTML/RSC de la vista | 307 a `/sign-in?redirect_url=…` sin sesión |

Esto es la flecha `Server Component → recurso` de `docs/SETUP.md` §4, no el camino
`hook → service → Route Handler`. Ese camino existe para datos de **nuestra** base;
aquí el origen es Clerk y el consumidor es un componente de servidor, así que
montar service + hook + endpoint intermedio sería una capa con un solo consumidor
y ningún dato propio que validar (CLAUDE.md §6).

### 6.1 Validación Zod

**No aplica.** La regla 4 de CLAUDE.md pide Zod en todo Route Handler que reciba
entrada; esta feature no añade ninguno y la página no acepta parámetros de ruta,
query ni cuerpo. Añadir un schema aquí sería validar una entrada que no existe.

### 6.2 Contrato interno del mapeo

```ts
// src/modules/account/lib/profile.ts — firma propuesta
import type { User } from '@clerk/nextjs/server';

export function toAccountProfile(user: User): AccountProfile;
```

`import type { User } from '@clerk/nextjs/server'` está verificado como export
público (`node_modules/@clerk/nextjs/dist/types/server/index.d.ts:23`) y, al ser
`import type`, se borra en compilación: el archivo no arrastra código de servidor
al bundle.

## 7. Arquitectura y archivos afectados

```
src/server/**                          — SIN CAMBIOS (no se consulta Postgres)
src/proxy.ts                           — SIN CAMBIOS
src/lib/permissions.ts                 — SIN CAMBIOS
next.config.ts                         — SIN CAMBIOS

src/app/(storefront)/
  account/page.tsx                     NUEVO — Server Component + auth.protect() + metadata

src/modules/account/                   NUEVO módulo (solo datos, sin UI)
  types/account.types.ts               NUEVO — AccountProfile
  lib/profile.ts                       NUEVO — toAccountProfile()
  constants.ts                         NUEVO — ACCOUNT_SECTIONS

src/modules/storefront/components/
  account-nav.tsx                      NUEVO — server, rail de anclas
  account-section.tsx                  NUEVO — server, envoltura de sección
  account-empty.tsx                    NUEVO — server, estado vacío con CTA
  account-profile-card.tsx             NUEVO — server, ficha de identidad
  manage-account-button.tsx            NUEVO — cliente, openUserProfile()
  account-menu.tsx                     + ítem «Mi cuenta» → /account (D-10)
```

La UI vive en `modules/storefront/components/` y no en `modules/account/components/`
por el precedente verificado del spec 005: `product-detail.tsx`,
`related-products.tsx` y `product-spec-list.tsx` son componentes de una feature de
producto y viven en storefront, mientras que sus tipos viven en `modules/products`.
Es también lo que permite reutilizar `Eyebrow` (`section-heading.tsx`) y `Reveal`
sin importar de un módulo a otro.

## 8. Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| D-1 | La página es un Server Component que llama a `currentUser()` | Client Component con `useUser()` de `@clerk/nextjs` | Con `useUser()` el nombre y el correo aparecerían solo tras hidratar, y la comprobación de sesión quedaría en el cliente —cosmética, no frontera—. En servidor, `auth.protect()` es la verificación real del recurso (CLAUDE.md regla 8) y los datos van en el HTML inicial (AC2). Además ninguna de las tres secciones necesita interactividad salvo el botón del modal, que es una hoja cliente aislada. |
| D-2 | El perfil sale de **Clerk** (`currentUser()`), no de la fila espejo `users` vía `getCurrentUser()` | Leer la tabla `users` de Postgres | Es lo que pide el requerimiento («datos de Clerk»), y además es lo correcto hoy: `docs/SETUP.md` §7 deja el webhook de sincronización **sin marcar** —`CLERK_WEBHOOK_SIGNING_SECRET` vacía y endpoint no registrado—, así que `users.first_name` y `users.image_url` pueden ir por detrás de lo que el cliente acaba de cambiar en Clerk. Enseñarle a alguien su propia foto desactualizada es el peor sitio para esa deuda. Ahorra además una consulta a Neon por visita. |
| D-3 | `await auth.protect()` dentro de la page | Un `layout.tsx` que proteja `/account/**`, o un matcher en `src/proxy.ts` | `docs/SETUP.md` §6 fija la forma exacta por tipo de recurso: en una page, `auth.protect()` da el `307` a `/sign-in?redirect_url=…` (AC1). La regla 9 de CLAUDE.md prohíbe expresamente meter esa lógica en el proxy, y un layout no basta porque no todo recurso se alcanza atravesándolo. Con una sola ruta, un layout solo para proteger sería una capa vacía. |
| D-4 | Una sola ruta `/account` con tres secciones ancladas | Tres segmentos: `/account`, `/account/favorites`, `/account/orders` | `docs/SETUP.md` §3 ya reserva `(storefront)/orders/` para el historial de pedidos; crear además `/account/orders` daría dos casas al mismo contenido y obligaría a decidir cuál muere cuando llegue el spec de pedidos. Y hoy dos de las tres secciones están vacías: tres rutas con navegación propia para dos vacíos es estructura sin contenido que la sostenga. |
| D-5 | Secciones apiladas con un rail de anclas | `Tabs` de shadcn (ya instalado) | Tabs obliga a un boundary cliente sobre toda la vista y esconde por defecto dos tercios del contenido; con tres bloques cortos, de los cuales dos son un estado vacío, el scroll cuesta menos que el estado. Las anclas además son enlazables (`/account#compras`, AC10) y funcionan sin JavaScript. |
| D-6 | DTO plano `AccountProfile` en el borde | Pasar el `User` de Clerk a los componentes | `currentUser()` devuelve una instancia de clase con `privateMetadata`, `unsafeMetadata`, `banned`, `locked` y `raw` (§5.1). Hoy ningún hijo cliente lo recibiría, pero el día que uno lo reciba viaja entero al navegador y nadie lo nota en el diff. El recorte en el borde es lo que hace AC9 verificable. |
| D-7 | El avatar se pinta con un `<img>` plano renderizado en servidor, sobre un `<span>` redondo que lleva las iniciales (o el icono de usuario) como fallback puramente CSS | `next/image`, o `Avatar`/`AvatarImage` de shadcn | Dos descartes por razones distintas. **`next/image`**: verificado que `next.config.ts` solo permite `images.unsplash.com` y `cdn.memorykings.pe` en `remotePatterns`; `img.clerk.com` no está, así que la foto rompería, y añadir el host abre superficie del optimizador para un problema que no tenemos. **`AvatarImage` de shadcn (Radix)**: solo emite el `<img>` cuando su `imageLoadingStatus` pasa a `"loaded"`, y ese estado únicamente cambia dentro de un `useLayoutEffect`, que es un no-op en el servidor. En un Server Component la URL del avatar **no aparecería en el HTML inicial** y llegaría solo al hidratar, incumpliendo AC2 y la premisa de D-1. Que `account-menu.tsx` use `AvatarImage` no sirve de precedente: es un Client Component con `useUser()`, donde la imagen se resuelve al hidratar y eso ahí basta. Aquí el fallback se apila detrás del `<img>` con `position`/`object-cover`: si la URL falla, quedan las iniciales visibles sin una sola línea de lógica de carga en JS. |
| D-8 | La ficha de identidad es una lista de definición con filas de línea fina — el **mismo** dispositivo que `ProductSpecList` usa para la ficha técnica del producto | Rejilla de tarjetas, una por dato | La vista de cuenta es la ficha del cliente igual que la otra es la ficha del producto: reutilizar el dispositivo ya establecido da continuidad al lenguaje del storefront en vez de inventar un tercero. Y los pares clave/valor **son** el contenido, no decoración. Descartados por lo mismo los marcadores numerados `01/02/03`: las tres secciones no son una secuencia y numerarlas afirmaría un orden que no existe (`frontend-design`). |
| D-9 | Los estados vacíos son una invitación con CTA al catálogo, con el patrón icono-en-cuadro-suave que ya usa `FeaturesSection` (`bg-nx-accent-soft` + icono lucide) | Ilustración propia, o una caja gris con «No hay datos» | Una pantalla vacía es un sitio donde dirigir, no donde disculparse. Reutilizar el patrón visual existente evita inventar arte para un bloque que dentro de dos specs desaparece, y el CTA convierte el vacío en el único camino que hoy sí lleva a algo. |
| D-10 | El dropdown gana «Mi cuenta» → `/account` y el ítem del modal pasa de «Ver perfil» a «Gestionar mi cuenta» | Añadir «Mi cuenta» y dejar «Ver perfil» tal cual | Dos entradas contiguas que prometen lo mismo con destinos distintos es el bug de vocabulario clásico. La partición honesta es: leer es nuestro (`/account`), editar sigue siendo de Clerk (modal). El `DropdownMenuItem` admite `asChild` (se pasa por `...props` a `DropdownMenuPrimitive.Item`, verificado en `src/components/ui/dropdown-menu.tsx:61-82`), así que el ítem puede ser un `<Link>` real y no un `onSelect` con `router.push`. |
| D-11 | **Sin `loading.tsx`** para `/account` | Un esqueleto de carga como el de `/products/[slug]` | El spec 005 §12.2 documenta, con sondas sobre build de producción, que un `loading.tsx` de segmento abre un `Suspense` cuyo shell se emite de inmediato y adelanta la línea de estado de la respuesta. Aquí eso es más grave que un `200` en vez de un `404`: `auth.protect()` tiene que poder emitir su `307` **antes** del primer flush, o AC1 deja de cumplirse en la navegación dura. La página no lee de Neon, así que el esqueleto tampoco compraría gran cosa. |
| D-12 | `metadata` con `robots: { index: false }` | Dejar la metadata por defecto | Es una página privada. El `307` ya la protege, pero la URL puede acabar en un sitemap externo o en la barra de un rastreador; declararla `noindex` es una línea y evita que aparezca en resultados como una promesa rota (AC11). |
| D-13 | No se toca `mobile-menu.tsx` ni el footer | Añadir «Mi cuenta» también allí | Verificado: el disparador del `AccountMenu` en `storefront-header.tsx:167` no lleva `lg:hidden`, así que el dropdown ya es alcanzable en móvil. Duplicar la entrada crearía dos sitios que mantener y uno de ellos se olvidaría. |

**Skills.** Consultada `frontend-design` para D-8 y D-9: la vista de cuenta es UI
nueva sin referencia previa —`docs/design/` solo trae `index.html` y `mobile.html`
de la portada—, y su conclusión aquí es de contención: la identidad Nexbyte ya
está fijada por el spec 004, así que la única decisión visual libre era el
dispositivo estructural de la ficha, y se resuelve reutilizando el que ya existe
en vez de abrir un lenguaje nuevo. `web-design-guidelines` y `security-review`
están instaladas pero **auditan código**, no specs: le corresponden al reviewer
sobre el diff (AC9, AC12, AC13). `clerk-custom-ui` no aplica porque no se
personaliza la apariencia de ningún componente de Clerk (D-3 del alcance: el modal
sale por defecto). **No están instaladas** en esta sesión y por tanto no se han
usado: `superpowers:brainstorming`, `superpowers:writing-plans`,
`clerk-nextjs-patterns`, `vercel:nextjs` y `vercel:next-cache-components`.

## 9. Tareas

### Fase 1 — Contrato de datos

- [x] **T1** — Definir el tipo `AccountProfile` de §5.1 · archivo: `src/modules/account/types/account.types.ts` · verificación: `npm run typecheck`
- [x] **T2** — Implementar `toAccountProfile(user)`: correo primario y su `verification.status === 'verified'`, teléfono primario, `createdAt`/`lastSignInAt` de Unix ms a ISO, iniciales derivadas de `firstName`/`lastName` con caída al correo · archivo: `src/modules/account/lib/profile.ts` · verificación: `npm run typecheck`
- [x] **T3** — Definir `ACCOUNT_SECTIONS` (`perfil` / `favoritos` / `compras` con su etiqueta), fuente única del rail y de los `id` de sección · archivo: `src/modules/account/constants.ts` · verificación: `npm run typecheck`

### Fase 2 — Piezas de UI

- [x] **T4** — `AccountSection`: `<section id scroll-mt-24>` con `Eyebrow`, `h2` y `children`; una sola responsabilidad, sin saber qué sección es · archivo: `src/modules/storefront/components/account-section.tsx` · verificación: `npm run typecheck`
- [x] **T5** — `AccountEmpty`: icono en cuadro `bg-nx-accent-soft`, título, cuerpo y CTA (`href` + etiqueta) según D-9 · archivo: `src/modules/storefront/components/account-empty.tsx` · verificación: AC6, AC7
- [x] **T6** — `ManageAccountButton`: Client Component hoja, sin props, `useClerk().openUserProfile()` · archivo: `src/modules/storefront/components/manage-account-button.tsx` · verificación: `npm run typecheck`
- [x] **T7** — `AccountProfileCard`: recibe `AccountProfile`, pinta avatar + nombre y la lista de definición de D-8; omite las filas sin dato y monta `ManageAccountButton` · archivo: `src/modules/storefront/components/account-profile-card.tsx` · verificación: AC3, AC4, AC5
- [x] **T8** — `AccountNav`: rail pegajoso (`hidden lg:block sticky top-24`) con un ancla por entrada de `ACCOUNT_SECTIONS` · archivo: `src/modules/storefront/components/account-nav.tsx` · verificación: AC10, AC12

### Fase 3 — La ruta

- [x] **T9** — `page.tsx` de `/account`: `await auth.protect()`, `currentUser()`, `redirect('/sign-in')` si es `null`, `toAccountProfile()`, composición de las tres secciones y `metadata` con `robots: { index: false }` · archivo: `src/app/(storefront)/account/page.tsx` · verificación: AC1, AC2, AC9, AC11, AC14

### Fase 4 — Entrada desde el header

- [x] **T10** — `AccountMenu`: nuevo `DropdownMenuItem asChild` con `<Link href="/account">Mi cuenta</Link>` y renombrado de «Ver perfil» a «Gestionar mi cuenta» · archivo: `src/modules/storefront/components/account-menu.tsx` · verificación: AC8

### Fase 5 — Cierre

- [x] **T11** — Verificación final y comprobación de que el diff no toca `src/server/**`, `src/proxy.ts`, `src/lib/permissions.ts` ni `next.config.ts` · verificación: `npm run typecheck && npm run lint && npm run build` (AC14, AC15)

## 10. Riesgos y consideraciones

- **Una llamada a Clerk por visita.** El propio `currentUser.d.ts` avisa: usa
  `GET /v1/users/{id}` de la Backend API, se deduplica por request gracias a
  `fetch()` pero **no** entre requests, y cuenta contra el límite de la Backend
  API. `/account` es dinámica por construcción, así que cada visita es una llamada
  a Clerk. Con el tráfico actual es irrelevante; el día que moleste, la salida es
  la fila espejo de Postgres, y para eso hace falta el webhook (§11).
- **PII en pantalla.** La vista muestra correo y teléfono del **dueño de la
  sesión** y de nadie más: `currentUser()` resuelve por el `userId` del token, no
  por un parámetro. No se escribe en `audit_logs` —no hay mutación— y esos valores
  no deben acabar en ningún `console.log` ni en `metadata` de un log
  (`docs/SETUP.md` §5.2, regla dura 3).
- **`auth.protect()` pasa y `currentUser()` devuelve `null`.** Ocurre si la sesión
  es válida pero la Backend API no resuelve el usuario. T9 redirige a `/sign-in`
  en lugar de renderizar media ficha; si la causa fuera una caída de Clerk, el
  redirect no arregla nada pero tampoco muestra una página rota. Es el caso borde
  a vigilar en review.
- **Fuga por el payload RSC.** El DTO recorta bien, pero `AccountProfileCard` y
  `AccountNav` deben quedarse en el servidor: la única hoja cliente es
  `ManageAccountButton`, y no recibe props a propósito.
- **Cabeceras de caché.** `/account` no lleva `revalidate` ni hereda
  `CATALOG_CACHE_CONTROL`. Servir una página privada con `Cache-Control: public`
  sería un incidente, no un bug: revisarlo si alguien añade cabeceras a nivel de
  `next.config.ts`.
- **El `loading.tsx` que no hay que añadir.** D-11 lo explica. Es exactamente el
  archivo que alguien creará «para mejorar la percepción de carga» y romperá AC1
  en silencio, porque el `307` seguirá funcionando en navegación de cliente.
- **Estados vacíos que envejecen.** El día que existan favoritos y pedidos, si el
  spec correspondiente no sustituye estos dos bloques, la tienda le dirá al cliente
  que no ha comprado nada mientras su pedido está en camino. `AccountEmpty` es un
  marcador con fecha de caducidad y así está anotado en §11.
- **Regresión en el dropdown.** T10 toca el único menú de sesión de la tienda.
  El fallo silencioso sería romper «Cerrar sesión» al reordenar los ítems; AC8
  pide comprobar las tres acciones, no solo la nueva.

## 11. Fuera de alcance / deuda aceptada

| Diferido | Cuándo retomarlo |
|---|---|
| Backend de favoritos: tabla, repositorio, endpoints, hook y botón de guardar en la tarjeta | Su propio spec. Es lo que convierte la sección `#favoritos` de marcador en función; hasta entonces el estado vacío es la verdad. |
| Historial de compras real | Con el spec de pedidos, que además tiene su ruta ya reservada en `docs/SETUP.md` §3 (`(storefront)/orders/`). Habrá que decidir entonces si `#compras` muestra las últimas y enlaza a `/orders`, o si absorbe la ruta. |
| Leer el perfil de la fila espejo `users` en vez de Clerk | Cuando el webhook `user.created/updated/deleted` esté registrado y verificado (`docs/SETUP.md` §7, único ítem sin marcar del checklist). Antes de eso la fila espejo puede mentir. |
| Edición de datos con formulario propio (RHF + Zod + Server Action) | Solo si el modal de Clerk se queda corto. Hoy cubre nombre, foto, correos, contraseña y MFA, y mantenerlo cuesta cero. |
| Direcciones de envío y métodos de pago | Con el checkout. |
| Rol y permisos visibles en la cuenta | Si algún día el cliente necesita saberlo. Hoy `customer` no otorga ningún permiso (`docs/SETUP.md` §5.1) y mostrar «sin permisos» no informa de nada. |
| Borrado de cuenta desde la tienda | Necesita decidir qué pasa con los pedidos del usuario borrado; es una decisión de negocio, no de UI. |
| Avatar optimizado con `next/image` | Si el peso de la foto llega a importar. Requiere añadir `img.clerk.com` a `remotePatterns` y aceptar esa superficie (D-7). |
| Enlace a `/account` desde el menú móvil y el footer | Si la analítica muestra que el dropdown no se encuentra en móvil (D-13). |
| Theming de la UI de Clerk para que el modal case con la paleta Nexbyte | Cuando el salto visual moleste; la skill `clerk-custom-ui` cubre exactamente eso. |
