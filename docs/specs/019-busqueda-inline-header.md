---
id: 019
title: Búsqueda inline en el header (sin modal)
status: done
module: storefront
scope: client
created: 2026-09-17
reference: https://simple.ripley.com.pe/ (solo comportamiento observado, no código)
supersedes: spec 004 D-12 (parcial), D-17 (parcial) · spec 013 D-12 (búsqueda sticky de móvil)
---

# 019 — Búsqueda inline en el header

## 1. Contexto

Hoy buscar en la tienda cuesta dos gestos y un cambio de contexto: el header
pinta un `<button>` con aspecto de campo (`storefront-header.tsx`, líneas 139-150)
que abre un `CommandDialog` a pantalla completa (`search-dialog.tsx`), montado en
diferido desde `storefront-overlays.tsx` bajo el pestillo `searchMounted`. El
overlay atrapa el foco, tapa la página y bloquea el scroll —comportamiento de
`Dialog` de Radix—, y al cerrarse hay que devolver el foco a mano al disparador
(spec 004, I-5 y AC10).

El usuario reporta que ese modal sobra: la búsqueda es la acción principal de una
tienda con catálogo y debe ocurrir donde ya está el campo. El patrón de
referencia observado en `simple.ripley.com.pe` es un autocomplete clásico: campo
siempre visible en la cabecera, resultados en un panel anclado bajo el campo
mientras se escribe, sin overlay de pantalla completa, sin bloqueo de scroll y
sin trampa de foco.

### Estado verificado del código (2026-09-17)

Todo lo siguiente se comprobó leyendo los archivos y `node_modules`, no de memoria:

- `search-dialog.tsx` usa `CommandDialog` + `Command shouldFilter={false}`,
  debounce de `SEARCH_DEBOUNCE_MS` (300 ms) y `useCatalogProducts` con
  `pageSize: CATALOG_SEARCH_LIMIT` (6), `sort: 'featured'`, `page: 1`.
- `ui.store.ts` expone `searchOpen`, `setSearchOpen`, `searchMounted`,
  `searchTrigger` y `setSearchTrigger`. `setSearchOpen` además cierra carrito y
  menú. `setCartOpen`/`setMenuOpen` ponen `searchOpen: false`.
- Consumidores de ese estado, en todo `src/`: **solo tres archivos** —
  `search-dialog.tsx`, `storefront-header.tsx` y `storefront-overlays.tsx`.
  `mobile-bottom-nav.tsx` **no** tiene entrada de búsqueda (solo Inicio,
  Categorías, Carrito, Cuenta).
- `storefront-header.tsx` tiene **tres** disparadores de búsqueda: el botón ancho
  `hidden lg:flex`, el icono `lg:hidden` y la fila compacta `absolute top-full`
  que aparece con `stuck` bajo `md` (spec 013, T17/AC14).
- `AnimatedSearchPlaceholder` devuelve un `<span>`, no un `placeholder`: rota
  frases con `setInterval`, arranca solo tras el montaje (guarda de hidratación) y
  se detiene con `useReducedMotion()`.
- `--nx-header-h` se declara en `globals.css` (`4rem`, y `6.8125rem` desde
  `min-width: 64rem`) y la consumen `catalog-sidebar`, `account-nav`,
  `checkout-summary` (`sticky top`) y el `scroll-mt` de cinco secciones ancladas.
  El spec 013 §11 deja anotado que **no** contempla la fila de búsqueda sticky de
  móvil, porque esa fila flota en `absolute`.
- `cmdk@1.1.1` (dependencia directa en `package.json`) aporta, sin `Dialog`:
  `role="combobox"` + `aria-autocomplete="list"` + `aria-controls` +
  `aria-activedescendant` + `aria-labelledby` en el input; `role="listbox"` en la
  lista; `role="option"` + `aria-selected` en los ítems; y manejo de
  `ArrowUp`, `ArrowDown`, `Home`, `End` y `Enter`. **No maneja `Escape`** (no
  aparece la tecla en `dist/index.mjs`): lo resolvía el `Dialog`.
- `cmdk` renderiza un `<label cmdk-label hidden>` con el texto de la prop `label`
  del root y lo enlaza por `aria-labelledby`: con `<Command label="…">` el input
  tiene nombre accesible sin añadir markup.
- `cmdk` esparce las props del consumidor **antes** de sus propios atributos
  (`createElement(D.input, { ref, ...props, "cmdk-input":"", …, "aria-expanded": true, … })`),
  así que `aria-expanded` queda fijado a `true` y no se puede sobrescribir por prop.
- `CommandInput` de shadcn envuelve el campo en `InputGroup` con `h-8!` y un
  `div p-1 pb-0`: chrome de paleta de comandos que el `className` del consumidor
  no alcanza (solo llega al `<input>` interior).
- `command.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `sheet.tsx` y `select.tsx`
  están instalados; **`popover` no**.

## 2. Objetivo

Un visitante puede escribir directamente en el campo de búsqueda del header y ver
los resultados en un panel anclado bajo él, sin que se abra ningún modal, sin que
se bloquee el scroll de la página y sin perder el sitio donde estaba.

## 3. Alcance

### Incluye

- Campo de búsqueda real (`<input>`) siempre visible en el header, en la fila 1
  desde 768 px y en una fila propia bajo 768 px.
- Panel de resultados flotante anclado al campo, no modal, con los mismos datos y
  el mismo debounce que hoy.
- Teclado completo sin modal: `↑ ↓ Home End Enter` (cmdk), `Escape` propio,
  `⌘K`/`Ctrl+K` para enfocar el campo, `Tab` para salir.
- Limpieza del estado de búsqueda en `ui.store.ts` y del pestillo de montaje
  diferido del buscador.
- Ajuste de `--nx-header-h` y `scroll-padding-top` por el crecimiento del header
  en móvil.
- Eliminación de `search-dialog.tsx` y de `animated-search-placeholder.tsx`.

### No incluye (explícito)

- **Ninguna dependencia npm nueva.** `cmdk` ya es dependencia directa.
- **Ningún cambio de esquema, repositorio, Route Handler, service ni hook de
  datos.** Se sigue consumiendo `useCatalogProducts` tal cual está.
- **El carrito y el menú móvil siguen siendo overlays modales.** Este spec no
  toca `cart-drawer.tsx` ni `mobile-menu.tsx`.
- **El bugfix del header pegajoso** que se está resolviendo en paralelo. Aquí se
  asume un header visible y se documenta la interferencia en §10; no se
  reimplementa el `sticky` ni el estado `stuck`.
- Historial de búsquedas, sugerencias de términos servidas por la API, búsqueda
  acotada por categoría y ruta `/search` dedicada → §11.

## 4. Criterios de aceptación

- [x] **AC1** — Dado el header en cualquier ancho, cuando la página carga,
      entonces hay un `<input>` de búsqueda visible y enfocable, y **no** existe
      ningún `<button>` que abra un diálogo de búsqueda. _(navegador)_
- [x] **AC2** — Dado el campo de búsqueda, cuando el visitante escribe un término,
      entonces tras el debounce de 300 ms aparece un panel anclado bajo el campo
      con los resultados de `GET /api/products?q=`, y `document.body` **no**
      recibe bloqueo de scroll ni `pointer-events: none`: la página sigue
      desplazándose y el resto de la interfaz sigue siendo clicable. _(navegador)_
- [x] **AC3** — Dado el panel abierto, cuando se pulsa `↓` y `↑`, entonces la
      opción activa cambia, el `aria-activedescendant` del input la refleja, la
      opción visible se desplaza dentro del panel y el foco del navegador **nunca
      sale del input**. _(navegador: flechas y resaltado; `aria-activedescendant`
      por lectura de código)_
- [x] **AC4** — Dado un término escrito y ninguna opción movida con flechas,
      cuando se pulsa `Enter`, entonces se aplica el término al catálogo
      (`catalogQuery`), la categoría vuelve a `all` y se navega a `/#catalogo`.
      Con una opción de producto activa, `Enter` navega a `/products/<slug>` y no
      añade nada al carrito. _(navegador)_
- [x] **AC5** — Dado el panel abierto, cuando se pulsa `Escape`, entonces el panel
      se cierra, el término se conserva y el foco sigue en el input. Con el panel
      ya cerrado, un segundo `Escape` vacía el campo. _(navegador)_
- [x] **AC6** — Dado el panel abierto, cuando se hace clic fuera del buscador o se
      tabula fuera de él, entonces el panel se cierra sin robar el foco ni
      devolverlo a ningún disparador. _(navegador: clic fuera; tabulación por
      lectura de código)_
- [x] **AC7** — Dado el foco fuera del buscador, cuando se pulsa `⌘K` o `Ctrl+K`,
      entonces el foco entra en el campo visible en ese breakpoint, su contenido
      queda seleccionado y no se abre ningún diálogo. _(navegador)_
- [x] **AC8** — Dado un lector de pantalla, cuando llegan los resultados, entonces
      una región `aria-live="polite"` anuncia el número de resultados para el
      término, el input tiene nombre accesible y su `aria-expanded` vale `true`
      solo mientras el panel está abierto. _(lectura de código, sin lector de
      pantalla real)_
- [x] **AC9** — Dado un ancho de 390 px, cuando se carga la tienda, entonces el
      campo de búsqueda ocupa una fila propia del header, mide ≥ 44 px de alto,
      no hay scroll horizontal y al enfocarlo **iOS Safari no hace zoom** (tamaño
      de fuente ≥ 16 px). _(lectura de código: no se pudo forzar un viewport
      móvil real en la sesión de Chrome disponible)_
- [x] **AC10** — Dado que el header crece en móvil, cuando se salta a `#catalogo`,
      `#ofertas`, `#categorias`, `#ventajas` o a cualquier ancla de `/account`,
      entonces el encabezado de destino queda por debajo del header y no tapado, y
      el sidebar del catálogo se pega bajo el header, no detrás de él. _(navegador
      en desktop: salto a `#catalogo` verificado; el resto por lectura de código)_
- [x] **AC11** — Dado un término sin coincidencias, cuando termina la consulta,
      entonces el panel muestra el mensaje de «sin resultados» **y** conserva la
      opción de ver el término en el catálogo, de modo que `Enter` siempre hace
      algo. _(navegador)_
- [x] **AC12** — Dado que la consulta falla, cuando se renderiza el panel,
      entonces muestra el mensaje de error real que propaga el interceptor de
      axios, no un texto genérico ni un panel vacío. _(lectura de código)_
- [x] **AC13** — Dado `git grep`, cuando termina la implementación, entonces no
      queda ninguna referencia a `searchOpen`, `setSearchOpen`, `searchMounted`,
      `searchTrigger`, `setSearchTrigger`, `SearchDialog` ni
      `AnimatedSearchPlaceholder`, y los archivos `search-dialog.tsx` y
      `animated-search-placeholder.tsx` están borrados. _(comando)_
- [x] **AC14** — Dado `package.json`, cuando termina la implementación, entonces
      sus dependencias son idénticas a las del inicio. _(comando)_
- [x] **AC15** — Dado `prefers-reduced-motion: reduce`, cuando se usa el buscador,
      entonces el placeholder no rota y el panel aparece sin animación de entrada.
      _(lectura de código)_

## 5. Modelo de datos

**Sin cambios de esquema.** No se crean ni modifican tablas, columnas, índices ni
migraciones. Los resultados salen de la misma proyección `CatalogProduct` que ya
devuelve `GET /api/products`.

## 6. Contratos de API

**Sin endpoints nuevos y sin cambios de contrato.** Se consume el mismo que hoy
usa el diálogo, con los mismos parámetros:

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/products` | público | `q`, `page=1`, `pageSize=CATALOG_SEARCH_LIMIT`, `sort=featured` (query, `catalogQuerySchema`) | `CatalogProductListResponse` | 400, 500 |

No se escriben schemas Zod nuevos: la entrada la valida `catalogQuerySchema` en el
Route Handler existente y el tipo de los parámetros lo infiere `CatalogQueryInput`.
Ningún componente llama a `axios`: el consumo sigue pasando por
`useCatalogProducts()` → `fetchCatalogProducts()` (CLAUDE.md, reglas 2 y 4).

### Contrato de comportamiento del buscador

Estado interno de `HeaderSearch` (no global, ver D-3):

| Estado | Tipo | Origen del cambio |
|---|---|---|
| `term` | `string` | escritura en el input, botón de limpiar, `Escape` con panel cerrado |
| `open` | `boolean` | `true` al escribir con `term !== ''`; `false` por `Escape`, clic fuera, `focusout`, selección de una opción |

Derivado: la consulta se habilita con `enabled: open && debouncedTerm.length > 0`.

Orden de las opciones del panel (importa, ver D-5):

1. `Buscar «<término>» en el catálogo` — siempre presente mientras haya término;
   es la **primera** opción y por tanto la que cmdk marca activa por defecto.
2. Grupo `Productos` — hasta `CATALOG_SEARCH_LIMIT` resultados.

## 7. Arquitectura y archivos afectados

Todo vive en la capa de presentación del storefront más un archivo de estilos
globales. **No se toca `src/server/`, `src/app/api/`, `src/modules/products/`
(services, hooks, schemas, repositorios) ni `src/components/ui/`.**

- `src/modules/storefront/hooks/` — **NEW** `use-animated-placeholder.ts`.
  Directorio nuevo en el módulo (hoy solo hay `components`, `lib`, `store`).
  Devuelve la frase actual como `string` y admite una bandera para congelar la
  rotación; conserva la guarda de hidratación y la de `useReducedMotion()` que
  hoy tiene `AnimatedSearchPlaceholder`.
- `src/modules/storefront/components/header-search.tsx` — **NEW**. Contenedor y
  dueño del estado: root de `Command`, input, `term`/`open`, `useDebounce` +
  `useCatalogProducts`, región `aria-live`, teclado, cierre por clic fuera y por
  `focusout`, corrección de `aria-expanded` y `aria-controls`, botón de limpiar,
  pista `⌘K`, navegación con `useRouter` y escritura en `ui.store`
  (`setCatalogQuery`, `setCategoryFilter`). El debounce y la región viven aquí y
  no en el panel porque este componente permanece montado con el panel cerrado:
  montarlos con el panel haría que la primera pulsación —y cada reapertura—
  consultara sin esperar los 300 ms, y que la región naciera junto a su propio
  contenido, que es justo cuando los lectores de pantalla no la anuncian.
- `src/modules/storefront/components/header-search-results.tsx` — **NEW**.
  Cuerpo del panel, presentacional: recibe término, resultados y estado por prop
  y pinta carga, error, vacío, opción de reserva y grupo de productos.
- `src/modules/storefront/components/storefront-header.tsx` — **MODIFY**. Monta
  `HeaderSearch` en la fila 1 desde `md` y en una fila propia bajo `md`; elimina
  los tres disparadores actuales (botón ancho, icono móvil y fila `stuck`) y el
  `openSearch`/`setSearchTrigger`; conserva el atajo `⌘K` apuntando al input
  visible.
- `src/modules/storefront/components/storefront-overlays.tsx` — **MODIFY**.
  Deja de importar y montar `SearchDialog`; `cartMounted` y `menuMounted` siguen
  igual.
- `src/modules/storefront/store/ui.store.ts` — **MODIFY**. Se eliminan
  `searchOpen`, `setSearchOpen`, `searchMounted`, `searchTrigger` y
  `setSearchTrigger`; `setCartOpen` y `setMenuOpen` dejan de escribir `searchOpen`.
- `src/app/globals.css` — **MODIFY**. Nuevo valor de `--nx-header-h` bajo 768 px
  y `scroll-padding-top` en el scope del storefront.
- `src/modules/storefront/components/catalog-section.tsx`,
  `deals-section.tsx`, `categories-section.tsx`, `features-section.tsx` y
  `account-section.tsx` — **MODIFY**. Su
  `scroll-mt-[calc(var(--nx-header-h)+1.5rem)]` pasa a `scroll-mt-6`: con el
  `scroll-padding-top` de la raíz, los dos descuentos se sumaban y el ancla
  quedaba a dos alturas de header del destino (16 rem en móvil frente a los
  7,25 rem que tapa la cabecera). El alto lo descuenta ahora solo la raíz; el
  `scroll-mt` conserva únicamente el respiro de 1,5 rem.
- `src/modules/storefront/components/search-dialog.tsx` — **DELETE**.
- `src/modules/storefront/components/animated-search-placeholder.tsx` — **DELETE**.

### Anatomía del buscador

```
<div role="search">                      ← landmark; solo uno expuesto por breakpoint
  <Command label="Buscar productos"      ← cmdk: label oculta + roles + teclado
           shouldFilter={false}>         ← el filtrado lo hace Postgres (spec 004, D-13)
    <div class="relative">
      <CommandPrimitive.Input … />       ← role=combobox, aria-activedescendant
      <button aria-label="Limpiar" />    ← visible solo con término
      <kbd>⌘K</kbd>                      ← visible solo sin término y sin foco
      {open && (
        <div class="absolute top-full">  ← panel anclado, NO portal, NO modal
          <HeaderSearchResults … />      ← CommandList + opciones
        </div>
      )}
    </div>
  </Command>
</div>
```

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1.** Se conserva `cmdk` pero sin `CommandDialog`: `Command` + `CommandList` + `CommandGroup` + `CommandItem` renderizados en línea | Panel de autocomplete escrito a mano | Verificado en `node_modules/cmdk/dist/index.mjs`: aporta `role=combobox/listbox/option`, `aria-autocomplete`, `aria-controls`, `aria-activedescendant`, `aria-selected` y el manejo de `↑ ↓ Home End Enter`. Es exactamente la mitad de spec 004 D-12 que sigue haciendo falta; lo único que aportaba el `Dialog` —trampa de foco, scroll lock, overlay— es justo lo que este spec viene a quitar. Escribirlo a mano son ~80 líneas y el riesgo de accesibilidad va entero para nosotros. |
| **D-2.** El campo usa `CommandPrimitive.Input` de `cmdk`, no `CommandInput` de shadcn | Reestilar `CommandInput` con `className` | `CommandInput` envuelve el campo en un `div p-1 pb-0` + `InputGroup h-8!` con `!important`, y el `className` del consumidor solo llega al `<input>` interior: el chrome de paleta de comandos es inalcanzable. No es «escribir a mano un componente de shadcn» (CLAUDE.md §6): es usar la misma primitiva que shadcn usa, en un componente de feature. El resto (`Command`, `CommandList`, `CommandGroup`, `CommandItem`) sí se reutiliza de shadcn sin tocarlo. |
| **D-3.** `term` y `open` son `useState` del propio `HeaderSearch`, no estado de `ui.store` | Mantener `searchOpen` en Zustand | Spec 004 D-16 subió el estado al store porque el disparador vivía en el header y el contenido en `storefront-overlays`, en otra rama del árbol. Al fusionarlos en un componente desaparece el motivo. Se suprimen cinco miembros del store y dos invariantes cruzados (`setCartOpen` cerrando la búsqueda). `catalogQuery` y `categoryFilter` **siguen** en el store: esos sí los lee el catálogo desde otra rama. |
| **D-4.** `aria-expanded` se corrige con un `useLayoutEffect` sin array de dependencias que escribe el atributo sobre el nodo del input | Aceptar `aria-expanded="true"` permanente | `cmdk` esparce las props del consumidor **antes** de sus propios atributos, así que la prop no gana; y como React reaplica el atributo en cada commit, el efecto tiene que correr también en cada commit. Anunciar «expandido» con el panel cerrado es una mentira al lector de pantalla (WCAG 4.1.2). Tres líneas, comentadas con la causa aguas arriba. |
| **D-5.** La opción «Buscar «término» en el catálogo» va **primera**, no última | Dejarla al final como hoy | `cmdk` marca activa la primera opción tras cada cambio de lista. Con la opción de reserva arriba, `Enter` sin tocar las flechas hace lo que espera cualquiera de un campo de búsqueda —buscar— y `↓` baja a los productos. Con ella al final habría que controlar `value` del root a mano en cada resultado para conseguir lo mismo, y `↓` no tendría a dónde ir. |
| **D-6.** Sin scrim ni telón tras el panel | Atenuar la página, como hace la referencia | Un telón que captura clics reintroduce media modalidad: gasta un clic del visitante (el primero solo cierra) y hay que decidir qué pasa al hacer scroll con él puesto. Sin telón, el panel es lo que dice ser: una capa flotante no modal. El contraste lo da `bg-popover` + sombra, no el oscurecimiento del fondo. |
| **D-7.** El panel se cierra por `Escape`, clic fuera (`pointerdown` en `document`) y `focusout` del contenedor; **no** se cierra al hacer scroll | Cerrar también en `scroll` | El panel está anclado a un header pegajoso: se desplaza con él y nunca queda huérfano, así que cerrarlo al desplazarse sería arbitrario. En móvil, además, el teclado virtual dispara eventos de scroll al abrirse y cerraría el panel recién abierto. |
| **D-8.** Dos instancias de `HeaderSearch` (fila 1 desde `md`, fila propia bajo `md`), con el atajo `⌘K` viviendo en `storefront-header` y eligiendo el input visible por `offsetParent === null` | Una sola instancia movida por CSS | Las dos filas son contenedores distintos del DOM; ninguna propiedad CSS mueve un nodo entre ellos. La instancia oculta va con `display:none` (`hidden`/`md:hidden`), así que sale del árbol de accesibilidad —solo hay un landmark `role="search"` expuesto— y su término vacío deja la consulta deshabilitada. El criterio `offsetParent === null` es el mismo ya revisado en spec 004 AC10. |
| **D-9.** El buscador entra en la fila 1 desde `md` (768 px) y ocupa fila propia **bajo** `md` | Repartir en `lg`, como hoy el botón | Con el corte en `lg` la franja 768–1023 px se quedaría sin campo (ni fila móvil ni fila de escritorio). 768 px es además el breakpoint donde ya cambian `MobileBottomNav` y el `--nx-fab-bottom`, así que no se estrena un corte nuevo. |
| **D-10.** El campo usa `font-size: 16px` en móvil (`text-base`, `md:text-sm`) | `text-sm` en todos los anchos | iOS Safari hace zoom automático al enfocar un input con fuente < 16 px, y con un header pegajoso el zoom deja la página descuadrada. Es la única forma de cumplir AC9 sin desactivar el zoom del viewport, que rompería la pauta de responsive. |
| **D-11.** `AnimatedSearchPlaceholder` pasa de componente a hook `useAnimatedPlaceholder()` | Mantener el `<span>` superpuesto al input | Con un `<input>` real el texto de invitación es el atributo `placeholder`, que es un `string`, no un nodo. Además la rotación se congela mientras el campo tiene foco o contenido: texto que cambia solo bajo el cursor es ruido. Se conservan intactas las dos guardas que costaron sangre: primer render = `PHRASES[0]` (hidratación) y parada bajo `prefers-reduced-motion`. |
| **D-12.** El buscador deja de cargarse con `next/dynamic` y entra en el chunk del header | Mantener el `dynamic` de spec 004 D-17 | Un campo que hay que poder usar desde el primer píxel no se puede diferir: diferirlo dejaría un input que no responde hasta que descargue su chunk, que es peor que el modal actual. `cart-drawer` y `mobile-menu` **siguen** diferidos, así que D-17 se mantiene para lo que sigue estando detrás de un clic. Coste esperado: `cmdk` (~5 kB gz) pasa del chunk diferido al del header. |
| **D-13.** `--nx-header-h` sube bajo 768 px y se añade `scroll-padding-top` en `[data-surface='storefront']` | Dejar la variable como está | La fila de búsqueda entra **en el flujo** del header, no en `absolute top-full` como la fila `stuck` de spec 013 (que se elimina): ahora sí cambia la altura real. Seis `scroll-mt` y tres `sticky top` derivan de esa variable y quedarían descalibrados. El `scroll-padding-top` en la raíz cubre además el criterio WCAG 2.2 AA «Focus Not Obscured»: al tabular, un control enfocado no puede quedar tapado por el header pegajoso. |
| **D-14.** Elegir un producto **conserva** el término en el campo y solo cierra el panel | Vaciar el campo al navegar, como hoy el diálogo | Un campo de búsqueda persistente muestra qué se buscó; vaciarlo al volver atrás obligaría a reescribir. El diálogo lo vaciaba porque desaparecía de la vista. |

**Skills consultadas.** `ui-ux-pro-max` (`--domain ux`) para el patrón de
autocomplete y los criterios de foco: de ahí salen D-13 (WCAG 2.2 AA «Focus Not
Obscured (Minimum)», que recomienda literalmente `scroll-padding-top:
var(--header-height)` para cabeceras pegajosas) y AC11 («No results» debe ofrecer
una salida, nunca un panel vacío). `web-design-guidelines` está instalada pero
necesita `WebFetch` para descargar sus reglas y esa herramienta no está
disponible en la sesión del agente `spec`; el resto de criterios de accesibilidad
proviene de los specs 004 y 011 y del código verificado.

## 9. Tareas

Ordenadas por dependencia: hook → componentes nuevos → componentes existentes →
store → estilos → borrados → cierre. Cada una toca un archivo.

- [x] **T1** — `useAnimatedPlaceholder(frozen: boolean): string`: mismas frases y
      mismo intervalo que `AnimatedSearchPlaceholder`, primer render siempre
      `PHRASES[0]`, intervalo detenido con `useReducedMotion()` o con `frozen` ·
      archivo: `src/modules/storefront/hooks/use-animated-placeholder.ts` ·
      verificación: `npm run typecheck` (AC15)

- [x] **T2** — `HeaderSearchResults`: recibe el término, el término consultado,
      los resultados, el estado de carga/error y los dos manejadores
      (`onSelectProduct`, `onSeeAllInCatalog`); pinta la opción de reserva
      **primera**, luego el grupo `Productos`, y los estados de carga, error y sin
      resultados · archivo:
      `src/modules/storefront/components/header-search-results.tsx` ·
      verificación: `npm run typecheck` (AC2, AC8, AC11, AC12)

- [x] **T3** — `HeaderSearch`: `<div role="search">` + `Command label="Buscar
      productos" shouldFilter={false}`, `CommandPrimitive.Input` con
      `enterKeyHint="search"`, `text-base md:text-sm`, placeholder del hook de T1,
      botón de limpiar (≥ 44 px) y pista `⌘K` (visible solo sin término y sin
      foco); estado `term`/`open`, `useDebounce` + `useCatalogProducts` y región
      `aria-live="polite"` con el conteo; cierre por `Escape`, `pointerdown` fuera
      y `focusout`; corrección de `aria-expanded` y `aria-controls` por
      `useLayoutEffect`; panel `absolute top-full` con `max-h` y scroll
      interno; acepta `inputRef` por prop · archivo:
      `src/modules/storefront/components/header-search.tsx` · verificación:
      `npm run typecheck` (AC1, AC3, AC4, AC5, AC6, AC8, AC9, AC14)

- [x] **T4** — Header: montar `HeaderSearch` en la fila 1 con `hidden md:flex` y
      en una fila propia bajo la fila 1 con `md:hidden`; eliminar el botón ancho,
      el botón-icono móvil y la fila `stuck` de búsqueda; reducir el atajo `⌘K` a
      enfocar y seleccionar el input visible (`offsetParent === null`); quitar
      `openSearch`, `setSearchOpen` y `setSearchTrigger` · archivo:
      `src/modules/storefront/components/storefront-header.tsx` · verificación:
      `npm run build` y `⌘K` enfocando el campo correcto en 390 px, 800 px y
      1440 px (AC1, AC7, AC9)

- [x] **T5** — Overlays: quitar el `dynamic` de `SearchDialog`, su render y la
      suscripción a `searchMounted`; `cartMounted` y `menuMounted` intactos ·
      archivo: `src/modules/storefront/components/storefront-overlays.tsx` ·
      verificación: `npm run typecheck` (AC13)

- [x] **T6** — Store: eliminar `searchOpen`, `setSearchOpen`, `searchMounted`,
      `searchTrigger` y `setSearchTrigger`, y quitar `searchOpen: false` de
      `setCartOpen` y `setMenuOpen` · archivo:
      `src/modules/storefront/store/ui.store.ts` · verificación:
      `npm run typecheck` en verde y `git grep -n "searchOpen\|searchMounted\|searchTrigger" src/`
      sin resultados (AC13)

- [x] **T7** — Estilos: nuevo valor de `--nx-header-h` bajo 768 px (fila 1 de
      4 rem + la fila de búsqueda, medida sobre el header ya construido) y
      `scroll-padding-top: var(--nx-header-h)` en `[data-surface='storefront']`,
      y `scroll-mt-6` en las cinco secciones ancladas para que el alto del header
      no se descuente dos veces · archivos: `src/app/globals.css`,
      `catalog-section.tsx`, `deals-section.tsx`, `categories-section.tsx`,
      `features-section.tsx`, `account-section.tsx` · verificación: saltar a `#catalogo`,
      `#ofertas`, `#categorias`, `#beneficios` y a las anclas de `/account` a
      390 px sin que el encabezado quede tapado, y el sidebar del catálogo pegado
      bajo el header a 1440 px (AC10)

- [x] **T8** — Borrar `search-dialog.tsx` · verificación:
      `npm run build` (AC13)

- [x] **T9** — Borrar `animated-search-placeholder.tsx` · verificación:
      `npm run build` (AC13)

- [x] **T10** — Cierre: `npm run typecheck && npm run lint && npm run build` en
      verde, `git diff package.json` sin dependencias nuevas, y repaso manual de
      AC2 (sin scroll lock: `document.body` sin `overflow:hidden` ni
      `pointer-events:none` con el panel abierto), AC5, AC6 y AC15 ·
      verificación: AC14 y la lista completa de §4

## 10. Riesgos y consideraciones

- **`--nx-header-h` es el punto frágil.** La consumen `catalog-sidebar.tsx`,
  `account-nav.tsx`, `checkout-summary.tsx` (posición `sticky`) y el `scroll-mt`
  de `catalog-section`, `deals-section`, `categories-section`,
  `features-section` y `account-section`. Ya se ha descalibrado tres veces en
  este proyecto (spec 011 R3, R4, R9 y R10). El valor de T7 debe **medirse sobre
  el header renderizado**, no estimarse.
- **Conflicto con el bugfix de header pegajoso en curso.** Los dos trabajos
  modifican `storefront-header.tsx`. Si el bugfix introduce ocultar/mostrar el
  header con el scroll, el panel de resultados se iría con él: hay que
  comprobar que no queda un panel abierto sobre un header que se ha ido, y
  cerrarlo si eso ocurre. Conviene implementar este spec **después** del bugfix.
- **Regresión de accesibilidad de spec 004 AC10/AC11.** El modal daba trampa de
  foco y devolución del foco «gratis». Sin él, todo el comportamiento de teclado
  es responsabilidad de `HeaderSearch`: `Escape`, `focusout`, y que las flechas
  no saquen el foco del input. Es lo que hay que probar primero.
- **`aria-expanded` cableado aguas arriba.** Si una actualización de `cmdk`
  cambia el orden del spread, el `useLayoutEffect` de D-4 pasa a ser redundante
  pero inofensivo. Debe llevar comentario con la causa, o el siguiente que lo lea
  lo borrará por «innecesario».
- **Peso del bundle del header.** `cmdk` deja de estar diferido (D-12). Es el
  precio de tener un campo usable desde el primer píxel; si el LCP de la portada
  se resintiera, la palanca es diferir el **panel** (`HeaderSearchResults`) con
  `next/dynamic` al primer carácter, manteniendo el input eager. No se hace de
  entrada: sería optimizar sin medida.
- **Altura del header en móvil.** El header pasa a ocupar dos filas bajo 768 px
  de forma permanente. Con la barra de avisos arriba y `MobileBottomNav` abajo,
  el contenido útil a 390×844 se reduce. Si resultara excesivo, la alternativa
  —compactar la fila 1 móvil a marca + campo + carrito, moviendo `ThemeToggle` y
  el bloque de sesión al menú móvil— está descrita en §11 y no se hace aquí
  porque obligaría a pasar el `authSlot` de Clerk también al `Sheet`.
- **Dos instancias montadas.** Ambas tienen su propio estado; si un visitante
  escribe en escritorio y luego reduce la ventana a móvil, el campo móvil aparece
  vacío. Es aceptable: el término aplicado al catálogo sí sobrevive, porque vive
  en `catalogQuery`.
- **1 px de desfase con el header pegado, deuda aceptada.** Con `data-stuck=true`
  el header añade `border-b`, así que su alto real es 7,3125 rem frente a los
  7,25 rem de `--nx-header-h`. La diferencia es de 1 px en el hueco de los anclajes
  y del `sticky top`: se registra y no se corrige, porque encadenar la variable al
  estado `stuck` obligaría a escribirla desde JavaScript en cada scroll.
- **Carrera de debounce.** Sin cambios respecto a hoy: TanStack Query cachea por
  `catalogKeys.list(params)`, así que respuestas fuera de orden no se pisan.

## 11. Fuera de alcance / deuda aceptada

- **Fila 1 móvil compacta** (marca + campo + carrito, con tema y sesión movidos al
  menú). Recuperaría ~3,75 rem de alto en móvil, pero obliga a pasar el `authSlot`
  de Clerk al `Sheet` del menú y a revisar la cabecera completa. Se retoma si la
  altura del header en móvil resulta molesta en uso real.
- **Historial de búsquedas recientes.** Requiere persistencia en `localStorage`
  versionada, como el carrito, y una decisión de privacidad. Hoy el panel sin
  término simplemente no se abre.
- **Sugerencias de términos servidas por la API** (el «Prueba con…» sigue siendo
  una lista fija en el cliente). Necesitaría un endpoint nuevo y probablemente un
  índice de texto completo en Postgres: es un spec propio.
- **Resaltado del fragmento coincidente** en el nombre del producto. Cosmético;
  con `ilike` en el servidor habría que devolver los offsets o recalcularlos en
  cliente.
- **Búsqueda acotada por categoría** («en Laptops»), como hace la referencia.
  Depende de un selector junto al campo y de cruzar `q` con `category`, que el
  endpoint ya soporta pero el panel no expone.
- **Ruta `/search` dedicada.** Hoy el término aterriza en `#catalogo` de la
  portada (spec 004 D-10) porque no existe `/products`. Sigue siendo deuda
  heredada del spec 011 §11, no de este.
- **Imagen real en los resultados.** El panel seguirá usando `CategoryArt`, igual
  que hoy: los productos del seed no tienen `image_url`.
