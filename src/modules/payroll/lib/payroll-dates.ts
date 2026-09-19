// Fechas del módulo de nómina, todas puras y todas sobre cadenas.
//
// Sin ninguna lógica de huso horario y sin importar `@/lib/reporting` (D-13): aquí el
// servidor no deriva ninguna fecha de `now()` —el periodo y la fecha de pago son datos
// de entrada obligatorios del cuerpo— y el único instante que pone es `created_at`. El
// valor inicial del formulario lo calcula el navegador con su fecha local, que en Perú
// es Lima. Importar la constante del dashboard invertiría la dependencia y duplicarla
// garantizaría que un día discrepen.

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 'AAAA-MM' del mes en curso según la fecha **local** de quien mira la pantalla. */
export function currentPayrollPeriod(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

// `timeZone: 'UTC'` sobre un `Date.UTC` del día 1: sin fijar el huso, enero se pintaría
// como diciembre del año anterior en cualquier navegador con desfase negativo.
const periodFormatter = new Intl.DateTimeFormat('es-PE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** 'Septiembre 2026'. El periodo llega ya validado como 'AAAA-MM' por Zod. */
export function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const label = periodFormatter.format(new Date(Date.UTC(year, month - 1, 1)));

  // `Intl` entrega «septiembre de 2026» en es-PE; el módulo la muestra capitalizada y
  // sin la preposición, que en una celda de tabla sobra.
  const clean = label.replace(' de ', ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// `formatIsoDate()` vivía aquí y se mudó a `formatDayKey()` en `src/lib/utils.ts` al
// aparecer su tercer consumidor (spec 020, D-17). El módulo la sigue usando desde allí;
// lo que queda en este archivo es lo que solo la nómina necesita: el periodo mensual.
