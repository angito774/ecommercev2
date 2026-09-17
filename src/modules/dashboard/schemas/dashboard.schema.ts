import { z } from 'zod';

// Único sitio donde se enumeran los períodos: el selector de la UI deriva sus
// opciones de aquí, así que añadir `90d` es una línea y no tres archivos.
export const DASHBOARD_PERIODS = ['today', '7d', '30d'] as const;

export const dashboardMetricsQuerySchema = z.object({
  // `7d` por defecto: «hoy» a las 09:00 es un punto solo y no dibuja curva; 30d
  // es el rango caro. Una semana es lo que responde «¿cómo vamos?» sin pedir nada.
  period: z.enum(DASHBOARD_PERIODS).default('7d'),
});

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
export type DashboardMetricsQueryParams = z.output<typeof dashboardMetricsQuerySchema>;
