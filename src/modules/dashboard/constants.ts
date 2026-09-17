import type { DashboardPeriod } from './schemas/dashboard.schema';

// `LOW_STOCK_THRESHOLD` vive en `@/modules/products/constants`: «menos de N
// unidades» es una propiedad del producto, no del dashboard, y el módulo de
// inventario no debe importar de aquí para saber qué es poco stock (spec 016, D-2).

// Tope de filas del widget: es un aviso de un vistazo, no el inventario. Quien
// necesite la lista entera la tiene en /admin/products ordenada por stock.
export const LOW_STOCK_LIMIT = 10;

export const TOP_PRODUCTS_LIMIT = 5;

// `REPORTING_TIME_ZONE` y `REPORTING_UTC_OFFSET_MINUTES` viven en `@/lib/reporting`:
// «la zona horaria con la que el negocio corta sus días» no es una propiedad del
// dashboard, y el módulo de finanzas no debe importar de aquí para saber cuándo
// empieza un día (spec 017, D-9).

// Duración en días de cada ventana. La ventana anterior mide lo mismo, así que
// este número gobierna las dos y no pueden divergir.
export const PERIOD_DAYS: Record<DashboardPeriod, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
};

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: 'Hoy',
  '7d': '7 días',
  '30d': '30 días',
};

// 60 s con la pestaña visible. `refetchIntervalInBackground` se queda en su
// default (`false`): una pestaña olvidada toda la noche serían ~480 consultas
// agregadas a Neon sin nadie mirando (D-3, D-4).
export const DASHBOARD_REFETCH_INTERVAL_MS = 60_000;

export const dashboardKeys = {
  all: ['dashboard'] as const,
  // El período entra en la clave: cambiar de rango es otra consulta, no una
  // invalidación de la anterior, y `keepPreviousData` necesita distinguirlas.
  metrics: (period: DashboardPeriod) => [...dashboardKeys.all, 'metrics', period] as const,
};

// Copys de los estados vacíos. Viven juntos porque los cuatro dicen la misma cosa
// con distintas palabras —«no hay datos» no es «hubo un error»— y separarlos por
// componente hace que uno se desalinee del resto.
export const EMPTY_REVENUE_MESSAGE = 'Sin ventas en el período seleccionado.';

export const EMPTY_TOP_PRODUCTS_MESSAGE =
  'Ningún producto se vendió en el período seleccionado.';

export const EMPTY_LOW_STOCK_MESSAGE = 'Ningún producto por debajo del umbral.';

// `null` en `changePercent` no es un fallo: es que el período anterior fue 0 y sin
// base no hay porcentaje que calcular (D-8, AC9).
export const NO_PREVIOUS_PERIOD_MESSAGE = 'Sin datos del período anterior';

export const DASHBOARD_ERROR_MESSAGE = 'No se pudieron cargar las métricas.';
