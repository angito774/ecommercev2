---
id: 015
title: Dashboard de métricas en administración
status: done
module: dashboard
scope: admin
created: 2026-09-16
---

# 015 — Dashboard de métricas en administración

## 1. Contexto

`/admin` no existe como página: `src/app/(admin)/admin/` solo contiene un
`.gitkeep` y el `layout.tsx`, así que quien entra al panel por la raíz recibe un
404 y tiene que adivinar una subruta. Las seis secciones construidas
(productos, categorías, pedidos, usuarios, roles, bitácora) son listados
operativos: ninguna responde «¿cómo va el negocio?».

Con el spec 007 hay ventas reales en `orders` y con el spec 014 hay un panel para
consultarlas una por una, pero nadie puede ver el agregado. `docs/SETUP.md` §6
reserva desde el arranque un «Dashboard con métricas (Recharts: ventas, pedidos,
top productos, stock bajo)» y §3 anota la ruta `app/api/admin/metrics/route.ts`.
El propio spec 014 dejó las métricas fuera de alcance por escrito y apuntando
aquí.

Este spec construye esa página y cierra el hueco de la raíz del panel.

## 2. Objetivo

Una persona con `dashboard.read` abre `/admin` y ve, para el período que elija
(hoy, 7 o 30 días), cuánto se ha vendido, cuántos pedidos ha habido, el ticket
promedio con su variación frente al período anterior, la curva de ventas por día,
los cinco productos que más ingresos generaron y qué productos están por agotarse.

## 3. Alcance

### Incluye

- Página `/admin` (raíz del panel) protegida con
  `requirePagePermission('dashboard.read')` y su entrada en la navegación.
- Permiso nuevo `dashboard.read` en el catálogo y en la matriz rol × permiso.
- Selector de período `Hoy | 7 días | 30 días` que gobierna todo el dashboard con
  un único parámetro.
- Tres KPI: ventas totales, número de pedidos y ticket promedio, cada uno con su
  valor y su variación porcentual frente al período inmediatamente anterior de
  igual duración.
- Gráfico de ventas por día (Recharts) sobre el período seleccionado.
- Top 5 de productos por ingresos del período.
- Widget de stock bajo: productos activos por debajo del umbral, **estado actual**,
  sin relación con el período.
- `GET /api/admin/metrics` con los cuatro bloques en una sola respuesta.
- Refresco automático por *polling* cada 60 s mientras la pestaña está visible.

### No incluye (explícito)

- WebSockets, SSE ni ninguna forma de *push*. Decisión tomada y descartada
  explícitamente (D-3).
- Exportación a CSV/PDF de ninguna métrica.
- Rango de fechas libre, comparación contra el mismo período del año anterior,
  ni desglose por categoría, cliente o método de pago.
- Métricas de conversión, carritos abandonados, visitas o cualquier dato que hoy
  no esté en la base: no hay analítica de tráfico en el proyecto.
- Umbral de stock configurable por producto o por categoría (queda constante,
  D-12) y cualquier acción de reposición desde el widget.
- Navegación desde el dashboard a los detalles (no se enlaza el top de productos
  con su ficha ni el stock bajo con su formulario): el alcance es mirar, no operar.
- Mutaciones de cualquier tipo. El dashboard es de solo lectura y no escribe en
  `audit_logs`.
- Listado de clientes, que `docs/SETUP.md` §6 sigue dando por pendiente.

## 4. Criterios de aceptación

- [ ] AC1 — Dado un usuario sin sesión, cuando pide `GET /api/admin/metrics`,
      entonces recibe `401` con `{ message }`, nunca un `307` al formulario.
- [ ] AC2 — Dado un usuario con sesión y sin `dashboard.read`, cuando pide
      `GET /api/admin/metrics`, entonces recibe `403` con `{ message }` sin que se
      llegue a validar la query.
- [ ] AC3 — Dado un usuario sin `dashboard.read`, cuando abre `/admin`, entonces
      recibe `403` renderizado por `src/app/forbidden.tsx` y la entrada
      «Dashboard» no aparece en la navegación del panel.
- [ ] AC4 — Dada una petición sin `period`, cuando llega al endpoint, entonces se
      resuelve con el valor por defecto `7d` y responde `200`.
- [ ] AC5 — Dado un `period` fuera de `today | 7d | 30d`, cuando llega al
      endpoint, entonces responde `400` con `{ message, issues }`.
- [ ] AC6 — Dado `period=7d`, cuando se calculan los KPI, entonces el rango actual
      cubre exactamente 7 días completos en `America/Lima` terminando al final de
      hoy, y el anterior los 7 días inmediatamente previos, sin solaparse ni dejar
      hueco entre ambos.
- [ ] AC7 — Dado un pedido creado a las 23:00 hora de Lima (04:00 UTC del día
      siguiente), cuando se consulta `period=today`, entonces ese pedido cuenta
      dentro del día en curso y no en el siguiente.
- [ ] AC8 — Dados los KPI, cuando se calculan, entonces solo intervienen pedidos
      con `status = 'paid'`; los `pending`, `payment_failed` y `canceled` no suman
      ni al importe ni al conteo.
- [ ] AC9 — Dado un período anterior con cero ventas, cuando se calcula la
      variación, entonces `changePercent` vale `null` y la UI muestra «Sin datos
      del período anterior», nunca `Infinity`, `NaN` ni `100 %`.
- [ ] AC10 — Dado un período sin ninguna venta, cuando se carga el dashboard,
      entonces los tres KPI muestran `0` (`S/ 0.00` y `0 pedidos`), el gráfico
      muestra su mensaje de «sin ventas» y el top de productos su empty-state.
      **No es un error ni un estado de carga.**
- [ ] AC11 — Dado `period=30d` con ventas solo en 3 días, cuando se pinta el
      gráfico, entonces la serie tiene 30 puntos —uno por día del rango, los días
      sin ventas a `0`— y no 3.
- [ ] AC12 — Dado el top de productos, cuando un producto se vendió en varias
      líneas del período, entonces aparece una sola vez con la suma de
      `price_cents_snapshot * quantity`, y la lista trae como mucho 5 filas
      ordenadas por ingreso descendente.
- [ ] AC13 — Dado el widget de stock bajo, cuando se cambia el período, entonces
      su contenido **no** cambia: refleja el stock actual, no el histórico.
- [ ] AC14 — Dado el widget de stock bajo, cuando se resuelve, entonces lista solo
      productos activos con `stock < 10`, ordenados por stock ascendente, máximo
      10 filas; si no hay ninguno, muestra un empty-state afirmativo («Ningún
      producto por debajo del umbral»).
- [ ] AC15 — Dado el dashboard cargado, cuando pasan 60 s con la pestaña visible,
      entonces los datos se vuelven a pedir sin intervención; con la pestaña en
      segundo plano no se dispara ninguna petición.
- [ ] AC16 — Dado un cambio de período, cuando se pulsa otra opción, entonces se
      pide una sola vez el nuevo período y los datos previos siguen visibles
      mientras llega la respuesta (sin salto de altura ni parpadeo a esqueleto).
- [ ] AC17 — Dado un fallo de red o un `500`, cuando falla la consulta, entonces
      cada sección muestra su estado de error con un botón de reintentar, y el
      estado de carga (esqueletos) mientras la primera petición está en vuelo.
- [ ] AC18 — Dado cualquier importe de la respuesta, cuando se inspecciona el
      JSON, entonces es un entero en céntimos; la división por 100 solo ocurre en
      el formateo de la vista.
- [ ] AC19 — Dada la variación de un KPI, cuando se muestra, entonces el signo se
      comunica con icono y texto además del color, nunca solo con color.

## 5. Modelo de datos

**Sin cambios de esquema.** No hay tablas nuevas, columnas nuevas ni valores
nuevos en ningún enum, y por tanto **no hay migración**. El dashboard solo agrega
sobre lo que ya existe:

| Tabla | Archivo | Uso en este spec |
|---|---|---|
| `orders` | `src/server/db/schema/order.ts` | `status`, `amount_total_cents`, `created_at` — KPI y serie diaria |
| `order_items` | `src/server/db/schema/order-item.ts` | `product_id`, `price_cents_snapshot`, `quantity` — top de productos |
| `products` | `src/server/db/schema/product.ts` | `name`, `sku`, `stock`, `is_active` — nombre del top y widget de stock bajo |

Índices existentes que sostienen las consultas: `orders_status_idx` (todas las
lecturas filtran `status = 'paid'`) y `order_items_order_id_idx` (el join del
top). No se añade ningún índice en este spec; el compromiso está en §10.

Lo único que cambia como **dato semilla** es el catálogo de permisos, que no es
migración sino `npm run db:seed` (idempotente: `seedPermissions` hace
`onConflictDoUpdate` por `code` y `seedRolePermissions` `onConflictDoNothing`).

```ts
// src/lib/permissions.ts — una entrada nueva en PERMISSIONS (pasa de 17 a 18)
{
  code: 'dashboard.read',
  resource: 'dashboard',
  action: 'read',
  description: 'Ver el dashboard de métricas del panel.',
},
```

Matriz rol × permiso resultante. Verificado contra `ROLE_PERMISSION_MATRIX`: los
cuatro roles que hoy abren el panel son exactamente `super_admin`, `admin`,
`manager` y `audit`; `employee` y `customer` tienen el conjunto vacío.

| Rol | `dashboard.read` |
|---|---|
| `super_admin` | sí |
| `admin` | sí |
| `manager` | sí |
| `audit` | sí |
| `employee`, `customer` | no |

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/metrics` | `dashboard.read` | query: `period?` | `DashboardMetricsResponse` | 400, 401, 403, 500 |

Errores con el contrato ya vigente: `toErrorResponse()` y `badRequest()` de
`src/lib/api-guard.ts`, cuerpo `{ message }` (más `issues` en el 400 de
validación), que es lo que espera el interceptor de `src/lib/axios.ts`.

Una respuesta sin ventas es `200`, no `404` ni `204`: el recurso «métricas del
período» existe siempre; lo que puede estar vacío son sus listas (AC10).

### Zod — `src/modules/dashboard/schemas/dashboard.schema.ts`

```ts
export const DASHBOARD_PERIODS = ['today', '7d', '30d'] as const;

export const dashboardMetricsQuerySchema = z.object({
  // `7d` por defecto: «hoy» a las 09:00 es un punto solo y no dibuja curva; 30d
  // es el rango caro. Una semana es lo que responde «¿cómo vamos?» sin pedir nada.
  period: z.enum(DASHBOARD_PERIODS).default('7d'),
});

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
export type DashboardMetricsQueryParams = z.output<typeof dashboardMetricsQuerySchema>;
```

El schema es el único sitio donde se enumeran los períodos: el selector de la UI
deriva sus opciones de `DASHBOARD_PERIODS`, así que añadir `90d` es una línea y no
tres archivos.

### Salida — `src/modules/dashboard/types/dashboard.types.ts`

```ts
// Un KPI es siempre el mismo trío: valor del período, valor del anterior y
// variación. Tres tipos separados solo repetirían la forma.
export type MetricComparison = {
  value: number;           // entero: céntimos o unidades, nunca float
  previousValue: number;
  changePercent: number | null;  // null = el período anterior fue 0 (D-8)
};

export type RevenuePoint = {
  day: string;             // 'YYYY-MM-DD' en America/Lima, un punto por día del rango
  revenueCents: number;
};

export type TopProductRow = {
  productId: string;
  name: string;            // nombre ACTUAL del catálogo (D-10)
  unitsSold: number;
  revenueCents: number;    // sum(price_cents_snapshot * quantity)
};

export type LowStockRow = {
  id: string;
  sku: string;
  name: string;
  stock: number;
};

export type DashboardMetrics = {
  kpis: {
    revenueCents: MetricComparison;
    orderCount: MetricComparison;
    averageTicketCents: MetricComparison;
  };
  revenueSeries: RevenuePoint[];
  topProducts: TopProductRow[];
  lowStock: LowStockRow[];
};

export type DashboardMetricsResponse = {
  data: DashboardMetrics;
  meta: {
    period: DashboardPeriod;
    // Instantes ISO del intervalo semiabierto [from, to) realmente consultado.
    // Viajan para que la UI pueda rotular el gráfico sin recalcular el rango y
    // para que un bug de zona horaria sea visible en la respuesta (D-7).
    range: { from: string; to: string };
    previousRange: { from: string; to: string };
    timeZone: string;        // 'America/Lima'
    lowStockThreshold: number;
    generatedAt: string;     // ISO; alimenta el «Actualizado a las HH:mm»
  };
};
```

Ejemplo de cuerpo (`period=7d`, recortado a dos puntos de serie):

```json
{
  "data": {
    "kpis": {
      "revenueCents": { "value": 1284900, "previousValue": 990000, "changePercent": 29.8 },
      "orderCount": { "value": 14, "previousValue": 11, "changePercent": 27.3 },
      "averageTicketCents": { "value": 91779, "previousValue": 90000, "changePercent": 2 }
    },
    "revenueSeries": [
      { "day": "2026-09-10", "revenueCents": 0 },
      { "day": "2026-09-11", "revenueCents": 349900 }
    ],
    "topProducts": [
      { "productId": "…", "name": "Laptop …", "unitsSold": 3, "revenueCents": 1049700 }
    ],
    "lowStock": [{ "id": "…", "sku": "MK-001", "name": "Mouse …", "stock": 2 }]
  },
  "meta": {
    "period": "7d",
    "range": { "from": "2026-09-10T05:00:00.000Z", "to": "2026-09-17T05:00:00.000Z" },
    "previousRange": { "from": "2026-09-03T05:00:00.000Z", "to": "2026-09-10T05:00:00.000Z" },
    "timeZone": "America/Lima",
    "lowStockThreshold": 10,
    "generatedAt": "2026-09-16T14:02:11.417Z"
  }
}
```

### Reglas de cálculo (normativas)

**Rango.** Zona horaria de referencia `America/Lima` (D-6). El rango es el
intervalo **semiabierto** `[from, to)`:

```
to           = inicio del día siguiente al de hoy, en Lima
from         = to − N días
previousTo   = from
previousFrom = from − N días
N = 1 (today) | 7 (7d) | 30 (30d)
```

Ambas ventanas duran exactamente N días, son contiguas y no se solapan (AC6). El
día en curso está incompleto por definición; eso se advierte en la UI y se acepta
(§10).

**Variación.** `changePercent = redondeo1((value − previousValue) / previousValue × 100)`.
Si `previousValue === 0` → `null`, incluso cuando `value` también es 0: sin base
no hay porcentaje, y devolver `100` o `0` sería inventarse un dato (AC9, D-8).

**Ticket promedio.** `orderCount === 0 → 0`; si no,
`Math.round(revenueCents / orderCount)`, entero en céntimos. La división nunca
llega a la respuesta como decimal (AC18).

**Serie diaria.** Un punto por cada día del rango, en orden ascendente, los días
sin ventas con `revenueCents: 0` (AC11).

**Stock bajo.** `is_active = true AND stock < 10`, orden `stock asc, name asc`,
máximo 10 filas. Ignora el `period` por completo (AC13).

## 7. Arquitectura y archivos afectados

- `src/server/db/schema/` — sin cambios.
- `src/lib/permissions.ts` — `dashboard.read` en `PERMISSIONS` y en los cuatro
  roles de `ROLE_PERMISSION_MATRIX`.
- `src/server/repositories/metrics.repository.ts` — **nuevo**: `findKpiTotals()`,
  `findRevenueSeries()`, `findTopProducts()`, `findLowStockProducts()`.
- `src/app/api/admin/metrics/route.ts` — **nuevo**: `GET`.
- `src/modules/dashboard/schemas/dashboard.schema.ts` — Zod compartido
  cliente/servidor.
- `src/modules/dashboard/types/dashboard.types.ts` — tipos de salida.
- `src/modules/dashboard/constants.ts` — umbral, límites, zona horaria, intervalo
  de polling, `dashboardKeys`, etiquetas y copys de empty-state.
- `src/modules/dashboard/lib/period-range.ts` + `.test.ts` — `resolvePeriodRange()`
  y `toReportingDayKey()`, puros.
- `src/modules/dashboard/lib/metrics-math.ts` + `.test.ts` — `percentChange()` y
  `averageTicketCents()`, puros.
- `src/modules/dashboard/lib/revenue-series.ts` + `.test.ts` — relleno de días sin
  ventas.
- `src/modules/dashboard/services/dashboard.service.ts` — `fetchDashboardMetrics()`.
- `src/modules/dashboard/hooks/use-dashboard-metrics.ts` — `useDashboardMetrics()`.
- `src/modules/dashboard/components/` — `dashboard-overview.tsx` (contenedor),
  `period-selector.tsx`, `kpi-card.tsx`, `revenue-chart.tsx`,
  `top-products-list.tsx`, `low-stock-widget.tsx`.
- `src/app/(admin)/admin/page.tsx` — **nuevo**: Server Component con el guard.
  Sustituye al `.gitkeep`, que se elimina.
- `src/app/(admin)/admin/layout.tsx` — entrada «Dashboard» al principio de
  `NAV_ITEMS`.
- `docs/SETUP.md` — §6, el dashboard deja de estar pendiente.

Componentes shadcn: `card`, `skeleton`, `table`, `button` y `separator` ya están
en `src/components/ui/`. Falta **`toggle-group`** para el selector de período
(D-15): `npx shadcn@latest add toggle-group`. **No** se instala el `chart` de
shadcn (D-13).

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| D-1: El dashboard es la página raíz `/admin` | Una ruta `/admin/dashboard` con `/admin` redirigiendo | Hoy `/admin` es un 404 con layout. Un redirect añade un salto para llegar al mismo sitio, y la raíz del panel es justamente lo que un dashboard debe ocupar |
| D-2: Permiso propio `dashboard.read`, no reutilizar `orders.read` | Exigir `orders.read` + `products.read` | La página mezcla cuatro dominios; exigir dos permisos deja indefinido qué se ve con uno solo. Un permiso por recurso es la regla del catálogo desde el spec 002, y `resource: 'dashboard'` hace explícito que lo que se concede es el agregado, no las filas |
| D-3: Refresco por *polling* de 60 s con `refetchInterval` de TanStack Query | WebSockets / SSE | Los datos son agregados que cambian cuando entra un pedido, no un flujo continuo. SSE obligaría a un handler de larga duración —caro y frágil en serverless— y a una fuente de eventos que hoy no existe (el webhook de Stripe no publica nada hacia dentro). El polling es una opción de configuración del hook que ya usamos; se descartó el push a conciencia y se retomará si algún día hay un bus de eventos |
| D-4: `refetchIntervalInBackground` se deja en su valor por defecto (`false`) | Poner `true` para tener el dato fresco al volver | Una pestaña olvidada abierta toda la noche serían ~480 consultas agregadas a Neon sin nadie mirando. Al volver a la pestaña el intervalo dispara igual |
| D-5: Un solo endpoint con los cuatro bloques | Cuatro endpoints (`/kpis`, `/series`, …) | Es una pantalla que se carga entera y se refresca entera; cuatro rutas serían cuatro `authorize()`, cuatro round-trips y cuatro estados de error para un solo botón de reintentar. Las cuatro consultas se lanzan en paralelo dentro del handler, así que el coste es el de la más lenta |
| D-6: Los días se agrupan en `America/Lima`, con desfase fijo de −05:00 | Agrupar en UTC (lo que hace `created_at::date` a secas) | El proyecto formatea todo en `es-PE`, cobra en `PEN` y lo usa un equipo en una sola zona. En UTC, una venta de las 20:00 de Lima aparecería en el día siguiente y el KPI «hoy» estaría vacío hasta las 05:00. Perú no aplica horario de verano desde 1994, así que el desfase es constante y el cálculo es aritmética de enteros: ni `Intl` en el camino caliente ni una librería de zonas horarias |
| D-7: El rango se calcula en el servidor y viaja en `meta` | Que el navegador mande `from`/`to`, como hace el historial de cliente (spec 008) | Aquí el agrupado por día ocurre en SQL, así que el servidor tiene que conocer la zona de todos modos; que además el cliente propusiera el rango daría dos fuentes de verdad para el mismo bucket. Publicarlo en `meta` mantiene la respuesta autoexplicativa y hace visible un error de zona sin depurar |
| D-8: `changePercent: null` cuando el período anterior es 0 | `100`, `0`, `Infinity` o omitir el campo | `x/0` es `Infinity` y `0/0` es `NaN`; ambos se serializan como `null` en JSON por accidente y rompen cualquier `toFixed`. Decidirlo explícitamente convierte el caso en un estado con copy propio («Sin datos del período anterior») en vez de en un «+∞ %». `100 %` sería mentir: pasar de 0 a 1 venta no es un crecimiento del 100 % |
| D-9: KPI actual y anterior en **una** consulta con agregados condicionales (`filter (where …)`) sobre `[previousFrom, to)` | Dos consultas, una por ventana | Es un solo recorrido del mismo índice en vez de dos, y elimina la ventana de tiempo entre ambas lecturas: con dos consultas, un pedido que entra entre la primera y la segunda podría contarse en las dos o en ninguna |
| D-10: El top agrupa por `order_items.product_id` y muestra `products.name` (actual), pero factura con `price_cents_snapshot` | Agrupar por `name_snapshot` | Lo que se pregunta es «qué producto vende», y agrupar por el nombre congelado parte en dos filas un producto que se renombró, falseando el ranking. El importe, en cambio, tiene que ser el que se cobró de verdad, no el precio de hoy: por eso el nombre es actual y el precio es snapshot. El `innerJoin` a `products` es seguro porque `order_items.product_id` es `notNull` con FK `restrict` |
| D-11: Las sumas se castean a `::bigint` y se convierten con `Number()` | `::int` | `sum(amount_total_cents)` en `int4` desborda a partir de ~21 500 000 PEN acumulados en la ventana, y el fallo sería un `500` en producción un buen mes. `Number.MAX_SAFE_INTEGER` cubre unos 90 mil millones de soles en céntimos, así que el entero sigue siendo exacto |
| D-12: `LOW_STOCK_THRESHOLD = 10`, constante del módulo | Columna `min_stock` por producto o variable de entorno | No hay dato de reposición ni de rotación que justifique un umbral por SKU, y una variable de entorno esconde el número donde nadie lo lee. Queda documentado como **provisional**: un futuro spec de Inventario lo hará configurable y esta constante será su valor por defecto |
| D-13: Gráfico con Recharts directo, sin instalar el `chart` de shadcn | `npx shadcn@latest add chart` | Es un único `AreaChart` de una sola serie: lo que aporta el wrapper de shadcn —temas por serie, leyenda y tooltip configurables— no se usa, y a cambio pinta un `chart.tsx` de ~350 líneas cuyo pin de Recharts hay que reconciliar con el `recharts@2.15.4` que el proyecto ya declara y que hoy **no tiene ningún consumidor** (verificado). La regla de CLAUDE.md §6 es no escribir a mano componentes que shadcn provee; Recharts no es uno de ellos |
| D-14: `AreaChart` de una serie, sin leyenda, con `CartesianGrid` recesivo y tooltip con crosshair | `LineChart`, o barras por día | La magnitud acumulada por día se lee mejor con área: el relleno comunica «cuánto», que es la pregunta. Con una sola serie la leyenda sobra —el título ya la nombra (regla de `dataviz`)— y las barras sugerirían categorías comparables entre sí más que una evolución |
| D-15: El color de la serie es `var(--primary)`, no `var(--chart-1)` | Usar los tokens `--chart-*` del tema | Verificado en `src/app/globals.css`: `--chart-1` es `oklch(0.87 0 0)` **y el mismo valor en `.dark`**, un gris claro que sobre la superficie clara no pasa el contraste. `dataviz` exige que los pasos de modo oscuro se elijan, no se hereden; `--primary` sí está definido por tema y funciona contra ambas superficies sin añadir tokens nuevos |
| D-16: La variación se comunica con icono + texto + color | Solo el color (verde/rojo) | Color solo es inaccesible para daltonismo y en impresión (`dataviz`, y `web-design-guidelines`). El icono (`ArrowUp`/`ArrowDown` de lucide) y el sufijo «vs. período anterior» hacen el signo legible sin color (AC19) |
| D-17: Un período sin ventas dibuja un empty-state, no una línea plana en 0 | Pintar los 30 ceros | Una recta sobre el eje se lee como «vendimos poco», no como «no hay nada»; el mensaje explícito no admite esa lectura. Los ceros siguen estando en la respuesta (AC11): la decisión es de render |
| D-18: El período vive en `useState` del contenedor | Zustand, o estado en la URL (`?period=7d`) | Un solo consumidor y muere al desmontar: mismo criterio que D-13 del spec 014 y que la regla 6 de CLAUDE.md. La URL sería compartible, pero obliga a `useSearchParams` con su frontera de Suspense para un dashboard que nadie enlaza a un compañero |
| D-19: El relleno de días sin ventas se hace en TypeScript puro, no con `generate_series` en SQL | `generate_series` en la consulta | La función es de unas quince líneas y se prueba con `npm test` sin base de datos, que es exactamente lo que este proyecto hace con las funciones de dominio (`order-transitions`, `group-orders-by-day`). En SQL solo se verificaría a mano contra Neon |
| D-20: El día viaja como texto `'YYYY-MM-DD'` resuelto con `to_char(...)` en SQL | Devolver un `date` y formatearlo en JS | Un `date` que cruza el driver vuelve a ser un `Date` en UTC y el `toISOString().slice(0,10)` desplazaría el día que acabamos de calcular con tanto cuidado. El texto ya es la clave del eje X y no se vuelve a parsear |
| D-21: `authorize('dashboard.read')` en la primera línea del handler, antes de leer la query | Validar primero y autorizar después | Mismo criterio que el spec 014 (AC2): sin permiso no se debe poder enumerar el contrato a base de `400` antes de recibir el `403` |

## 9. Tareas

- [x] **T1** — Añadir `dashboard.read` a `PERMISSIONS` y repartirlo a
      `super_admin`, `admin`, `manager` y `audit` en `ROLE_PERMISSION_MATRIX` ·
      archivo: `src/lib/permissions.ts` · verificación: `npm test && npm run typecheck`
- [x] **T2** — Ejecutar el seed y comprobar que el catálogo queda en 18 permisos y
      que los cuatro roles resuelven `dashboard.read` · comando: `npm run db:seed` ·
      verificación: salida del seed + `npm run db:studio`
- [x] **T3** — Constantes del módulo: `LOW_STOCK_THRESHOLD = 10`,
      `LOW_STOCK_LIMIT = 10`, `TOP_PRODUCTS_LIMIT = 5`,
      `REPORTING_TIME_ZONE = 'America/Lima'`,
      `REPORTING_UTC_OFFSET_MINUTES = -300`, `PERIOD_DAYS`, `PERIOD_LABELS`,
      `DASHBOARD_REFETCH_INTERVAL_MS = 60_000`, `dashboardKeys` y los copys de
      empty-state · archivo: `src/modules/dashboard/constants.ts` · verificación:
      `npm run typecheck`
- [x] **T4** — Schema Zod `dashboardMetricsQuerySchema` con `DASHBOARD_PERIODS` y
      el default `7d` · archivo:
      `src/modules/dashboard/schemas/dashboard.schema.ts` · verificación:
      `npm run typecheck`
- [x] **T5** — Tests del schema: query vacía → `7d`, cada valor válido, rechazo de
      `90d` y de `''` · archivo:
      `src/modules/dashboard/schemas/dashboard.schema.test.ts` · verificación:
      `npm test`
- [x] **T6** — `resolvePeriodRange(period, now)` → `{ current, previous }` como
      instantes `Date` del intervalo semiabierto, y `toReportingDayKey(instant)`
      → `'YYYY-MM-DD'` en Lima · archivo:
      `src/modules/dashboard/lib/period-range.ts` · verificación: `npm run typecheck`
- [x] **T7** — Tests de `period-range` (patrón de `order-transitions.test.ts`):
      duración exacta de 1/7/30 días en cada período; `previous.to === current.from`
      sin solape ni hueco; un `now` de `2026-09-16T03:00:00Z` —que en Lima aún es
      el día 15— resuelve el día 15 y no el 16 (AC7); un `now` de
      `2026-09-16T04:59:59Z` y otro de `2026-09-16T05:00:00Z` caen en días
      distintos · archivo: `src/modules/dashboard/lib/period-range.test.ts` ·
      verificación: `npm test`
- [x] **T8** — `percentChange(value, previousValue): number | null` (un decimal,
      `null` si el anterior es 0) y `averageTicketCents(revenueCents, orderCount)`
      (entero, 0 si no hay pedidos) · archivo:
      `src/modules/dashboard/lib/metrics-math.ts` · verificación: `npm run typecheck`
- [x] **T9** — Tests de `metrics-math`: subida, bajada, sin cambio, anterior en 0
      con actual > 0 → `null`, ambos en 0 → `null`, y que ningún caso devuelve
      `Infinity` ni `NaN`; ticket promedio con 0 pedidos → 0 y redondeo al céntimo ·
      archivo: `src/modules/dashboard/lib/metrics-math.test.ts` · verificación:
      `npm test`
- [x] **T10** — `fillRevenueSeries(rows, range)`: un punto por día del rango en
      orden ascendente, `0` donde no hubo ventas (D-19) · archivo:
      `src/modules/dashboard/lib/revenue-series.ts` · verificación: `npm run typecheck`
- [x] **T11** — Tests de `revenue-series`: rango de 7 días con 2 días con datos →
      7 puntos; rango de 1 día sin datos → 1 punto en 0; orden ascendente
      garantizado aunque las filas lleguen desordenadas · archivo:
      `src/modules/dashboard/lib/revenue-series.test.ts` · verificación: `npm test`
- [x] **T12** — Tipos de salida: `MetricComparison`, `RevenuePoint`,
      `TopProductRow`, `LowStockRow`, `DashboardMetrics`,
      `DashboardMetricsResponse` · archivo:
      `src/modules/dashboard/types/dashboard.types.ts` · verificación:
      `npm run typecheck`
- [x] **T13** — Repositorio: `findKpiTotals(range)` con los cuatro agregados
      condicionales en una sola consulta sobre `[previousFrom, to)` y
      `status = 'paid'`, sumas en `::bigint` (D-9, D-11) · archivo:
      `src/server/repositories/metrics.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T14** — Repositorio: `findRevenueSeries(range)` agrupando por
      `to_char((created_at at time zone 'America/Lima')::date, 'YYYY-MM-DD')`,
      orden ascendente (D-20) · archivo:
      `src/server/repositories/metrics.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T15** — Repositorio: `findTopProducts(range, limit)` con
      `order_items ⋈ orders ⋈ products`, `sum(price_cents_snapshot * quantity)`,
      `sum(quantity)`, `group by product_id, products.name`, orden por ingreso
      descendente con desempate estable y `limit` (D-10) · archivo:
      `src/server/repositories/metrics.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T16** — Repositorio: `findLowStockProducts(threshold, limit)` sobre
      productos activos, orden `stock asc, name asc`. Sin parámetro de rango: la
      firma misma deja claro que no depende del período (AC13) · archivo:
      `src/server/repositories/metrics.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T17** — Route Handler `GET /api/admin/metrics`:
      `authorize('dashboard.read')` primero (D-21), `safeParse` de la query →
      `badRequest`, `resolvePeriodRange`, las cuatro lecturas en `Promise.all`,
      composición de KPI con `percentChange`/`averageTicketCents`, relleno de la
      serie y `meta` completo · archivo: `src/app/api/admin/metrics/route.ts` ·
      verificación: `npm run typecheck`
- [x] **T18** — Service axios `fetchDashboardMetrics(params)` sobre
      `/admin/metrics` · archivo:
      `src/modules/dashboard/services/dashboard.service.ts` · verificación:
      `npm run typecheck`
- [x] **T19** — Hook `useDashboardMetrics(period)` con
      `queryKey: dashboardKeys.metrics(period)`,
      `refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS` y
      `placeholderData: keepPreviousData` (AC15, AC16) · archivo:
      `src/modules/dashboard/hooks/use-dashboard-metrics.ts` · verificación:
      `npm run typecheck`
- [x] **T20** — Instalar el componente que falta · comando:
      `npx shadcn@latest add toggle-group` · verificación: existe
      `src/components/ui/toggle-group.tsx` y `npm run typecheck`
- [x] **T21** — `PeriodSelector`: `ToggleGroup` de selección única derivado de
      `DASHBOARD_PERIODS`, con `aria-label` y sin permitir deselección · archivo:
      `src/modules/dashboard/components/period-selector.tsx` · verificación:
      `npm run typecheck`
- [x] **T22** — `KpiCard`: `Card` con título, valor formateado (`formatPrice` para
      los importes), indicador de variación con icono + texto (D-16) y esqueleto
      propio · archivo: `src/modules/dashboard/components/kpi-card.tsx` ·
      verificación: `npm run typecheck`
- [x] **T23** — `RevenueChart`: `ResponsiveContainer` + `AreaChart` de una serie,
      `var(--primary)` con degradado hacia transparente, grid recesivo, eje Y
      formateado en soles, tooltip con `formatPrice`, y el empty-state cuando toda
      la serie es 0 (D-14, D-15, D-17) · archivo:
      `src/modules/dashboard/components/revenue-chart.tsx` · verificación:
      `npm run typecheck`
- [x] **T24** — `TopProductsList`: lista ordenada con posición, nombre, unidades e
      ingreso; esqueleto, error con reintento y empty-state · archivo:
      `src/modules/dashboard/components/top-products-list.tsx` · verificación:
      `npm run typecheck`
- [x] **T25** — `LowStockWidget`: tabla compacta (producto, SKU, stock) con el
      umbral visible en el encabezado y la nota de que no depende del período;
      esqueleto, error y empty-state afirmativo (AC14) · archivo:
      `src/modules/dashboard/components/low-stock-widget.tsx` · verificación:
      `npm run typecheck`
- [x] **T26** — `DashboardOverview`: `"use client"`, estado del período en
      `useState` (D-18), el hook, el «Actualizado a las HH:mm» desde
      `meta.generatedAt` y el reparto de `isLoading`/`isError`/`refetch` a las
      cuatro secciones · archivo:
      `src/modules/dashboard/components/dashboard-overview.tsx` · verificación:
      `npm run typecheck`
- [x] **T27** — Página raíz del panel con
      `requirePagePermission('dashboard.read')`, `metadata` y encabezado; eliminar
      `src/app/(admin)/admin/.gitkeep` · archivo:
      `src/app/(admin)/admin/page.tsx` · verificación: `npm run build`
- [x] **T28** — Entrada «Dashboard» como primer elemento de `NAV_ITEMS`, con
      `href: '/admin'`, icono `LayoutDashboard` y `permission: 'dashboard.read'` ·
      archivo: `src/app/(admin)/admin/layout.tsx` · verificación: `npm run typecheck`
- [x] **T29** — Documentar en `docs/SETUP.md` §6 que el dashboard queda construido
      (spec 015): permiso, endpoint, zona horaria de los agregados, umbral de stock
      y el polling; retirarlo de «Pendientes» dejando solo el listado de clientes ·
      archivo: `docs/SETUP.md` · verificación: lectura
- [x] **T30** — Cierre: `npm run typecheck && npm run lint && npm test && npm run build`
      en verde y recorrido manual de AC3, AC10, AC13, AC15 y AC16 con una cuenta
      `super_admin` y otra sin `dashboard.read`
      - [x] Parte automatizada, 2026-09-16: `typecheck` ✓ · `lint` ✓ (0 errores; 8
            avisos preexistentes, ninguno del módulo dashboard) · `test` ✓ 731/731,
            46 nuevos · `build` ✓ con `/admin` y `/api/admin/metrics` en el listado
            de rutas. Comprobado además contra el servidor de desarrollo: sin sesión,
            `GET /api/admin/metrics` responde `401` con `{ message }` y no un `307`
            (AC1), y `GET /admin` responde `307` al formulario.
      - [x] **Verificación humana (nelson.nc421@gmail.com, 2026-09-17):** recorrido
            manual de AC3, AC10, AC13, AC15 y AC16 en `/admin` — los 4 pasos del
            checklist pasaron.
      - [x] **Bug encontrado durante T30 y corregido, 2026-09-17**:
            `GET /api/admin/metrics` devolvía `500` en todo período. Causa raíz:
            `findRevenueSeries()` reutilizaba el objeto `REPORTING_DAY` en `select`,
            `groupBy` y `orderBy`, pero Drizzle lo renderizaba con distinta
            cualificación de columna en cada cláusula (`"created_at"` en el
            `select`, `"orders"."created_at"` en `groupBy`/`orderBy`), y Postgres
            exige coincidencia textual exacta entre el `SELECT` y el `GROUP BY`
            (error `42803`). Fix: agrupar y ordenar por posición ordinal
            (`groupBy(sql\`1\`)`, `orderBy(sql\`1\`)`) en vez de repetir la
            expresión. No detectado por los tests unitarios porque prueban solo
            funciones puras (`period-range`, `metrics-math`, `revenue-series`), no
            la query real contra Postgres — ese hueco de cobertura queda anotado en
            §10.

## 10. Riesgos y consideraciones

- **El día en curso siempre compara peor.** `today` a las 10:00 contrasta diez
  horas contra las veinticuatro de ayer, y la variación sale negativa aunque el
  día vaya bien. Es inherente a comparar contra un período completo; se mitiga con
  el rótulo «vs. período anterior» y el rango explícito en la UI. Truncar la
  ventana anterior a la misma fracción transcurrida se evaluó y se descartó: hace
  el número más difícil de explicar de lo que arregla.
- **Coste del polling.** Cuatro consultas agregadas cada 60 s por pestaña visible.
  Con el equipo actual es despreciable; si crecen los usuarios del panel, la
  salida es subir el intervalo o cachear la respuesta unos segundos en el handler,
  no cambiar de arquitectura.
- **Índice.** Todas las lecturas filtran `status = 'paid'` con rango de
  `created_at`. `orders_status_idx` cubre la primera mitad; el rango se resuelve
  con filtro. Si el volumen lo pide, el siguiente paso es un
  `orders_status_created_at_idx` compuesto — con una medición delante, no ahora.
- **Desbordamiento de enteros.** Resuelto por D-11 (`::bigint`). Queda anotado
  porque es el tipo de fallo que solo aparece cuando el negocio va bien.
- **Sin N+1.** Las cuatro consultas son fijas e independientes del número de
  filas; ninguna se ejecuta dentro de un bucle. El top agrega en la base, no en
  memoria.
- **Hueco de cobertura: ninguna consulta del repositorio se prueba contra Postgres
  real.** Los 46 tests de este spec cubren solo funciones puras (`period-range`,
  `metrics-math`, `revenue-series`). El bug de T30 (`findRevenueSeries` fallaba con
  `42803` en producción/desarrollo real, ver T30) pasó typecheck, lint y los 731
  tests sin que nadie lo notara hasta el recorrido manual. Mismo patrón de riesgo
  para `findKpiTotals` y `findTopProducts`: sus agregados condicionales y sus joins
  tampoco se ejercitan contra una base real en la suite. Queda anotado como deuda
  para cuando el proyecto tenga tests de integración con Postgres.
- **Zona horaria cableada.** `America/Lima` es una constante, no configuración. Si
  algún día hay operación en otro huso, el agregado por día deja de ser correcto
  para quien mire desde allí. El desfase fijo de −05:00 (D-6) además **no** vale
  para un país con horario de verano: mover esta constante a otra zona exige
  volver al cálculo con `Intl`.
- **Datos existentes.** Los pedidos previos al spec 007 no existen; los `pending`
  antiguos que nunca se pagaron quedan fuera de todos los KPI por diseño (AC8) y
  eso puede hacer que el dashboard muestre menos pedidos que el panel de
  `/admin/orders` para el mismo rango. Es correcto: allí se cuenta todo, aquí se
  cuenta lo cobrado.
- **Seguridad.** El dashboard publica agregados del negocio completo. `audit`
  —solo lectura— lo recibe porque ya ve pedidos, productos y bitácora: no accede a
  nada que no pudiera reconstruir sumando lo que ya puede leer. No viaja ninguna
  PII: ni cliente, ni correo, ni dirección.
- **Sin auditoría.** No se escribe en `audit_logs`: `audit_logs` registra
  mutaciones y aquí no hay ninguna. Registrar lecturas es otro spec y otra
  política de retención.
- **Rollback.** Sin migración: revertir es revertir el código. El permiso
  `dashboard.read` quedaría huérfano en la tabla, lo cual es inocuo —
  `isPermissionCode()` descarta lo que no está en el catálogo del código—, pero
  `/admin` volvería a ser un 404.

## 11. Fuera de alcance / deuda aceptada

- **Umbral de stock configurable.** `LOW_STOCK_THRESHOLD = 10` es provisional
  (D-12). Se retoma en el spec de Inventario, que es donde existirán reposición y
  rotación; esta constante será su valor por defecto.
- **Rango de fechas libre y comparativa interanual.** Se añaden cuando alguien
  necesite cerrar un mes concreto. El schema ya es el único punto de cambio.
- **Desglose por categoría, cliente o método de pago.** No se ha pedido; añadirlo
  ahora sería adivinar qué corte importa.
- **Exportación de métricas.** Igual que en el spec 014: cuando haya quien la
  consuma.
- **Enlaces desde el dashboard al detalle** (producto del top → su ficha, stock
  bajo → su formulario). Barato de añadir después y fuera del objetivo de mirar de
  un vistazo.
- **Caché de la respuesta.** El handler no cachea: depende de la sesión y el
  polling ya acota la carga. Si hiciera falta, el sitio es el handler, no el hook.
- **Métricas de tráfico y conversión.** Requieren analítica que el proyecto no
  tiene. Spec propio si alguna vez se instala.
