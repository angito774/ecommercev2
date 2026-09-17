import type { DashboardPeriod } from './schemas/dashboard.schema';

// El spec de Inventario lo hará configurable y esta constante será su default
// (D-12).
export const LOW_STOCK_THRESHOLD = 10;

// Tope de filas del widget: es un aviso de un vistazo, no el inventario. Quien
// necesite la lista entera la tiene en /admin/products ordenada por stock.
export const LOW_STOCK_LIMIT = 10;

export const TOP_PRODUCTS_LIMIT = 5;

// Zona de referencia del negocio: se cobra en PEN y se formatea en es-PE. Agrupar
// en UTC pondría una venta de las 20:00 de Lima en el día siguiente (D-6).
export const REPORTING_TIME_ZONE = 'America/Lima';

// Perú no aplica horario de verano desde 1994, así que el desfase es constante y
// el cálculo del rango es aritmética de enteros: ni `Intl` en el camino caliente ni
// una librería de zonas horarias. Mover `REPORTING_TIME_ZONE` a un país con DST
// invalida esta constante y obliga a volver a `Intl` (§10).
export const REPORTING_UTC_OFFSET_MINUTES = -300;

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
