import type { DashboardPeriod } from '../schemas/dashboard.schema';

// Un KPI es siempre el mismo trío: valor del período, valor del anterior y
// variación. Tres tipos separados solo repetirían la forma.
export type MetricComparison = {
  // Entero: céntimos o unidades, nunca float (AC18).
  value: number;
  previousValue: number;
  // `null` = el período anterior fue 0 y no hay base para el porcentaje (D-8).
  changePercent: number | null;
};

export type RevenuePoint = {
  // 'YYYY-MM-DD' en America/Lima, un punto por día del rango. Texto y no `Date`:
  // ya es la clave del eje X y volver a parsearlo desharía el huso (D-20).
  day: string;
  revenueCents: number;
};

export type TopProductRow = {
  productId: string;
  // Nombre ACTUAL del catálogo, no el congelado en la línea: lo que se pregunta es
  // qué producto vende, y un renombrado partiría el ranking en dos (D-10).
  name: string;
  unitsSold: number;
  // sum(price_cents_snapshot * quantity): lo que se cobró, no el precio de hoy.
  revenueCents: number;
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
    // Viajan para que la UI pueda rotular el gráfico sin recalcular el rango y para
    // que un bug de zona horaria sea visible en la respuesta (D-7).
    range: { from: string; to: string };
    previousRange: { from: string; to: string };
    timeZone: string;
    lowStockThreshold: number;
    // Alimenta el «Actualizado a las HH:mm» que hace visible el polling.
    generatedAt: string;
  };
};
