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

const MONTH_NAMES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/**
 * '2026-09-01' → '01 sep 2026', partiendo la cadena y **sin** construir un `Date`
 * (D-12, AC18). `new Date('2026-09-01')` se interpreta como medianoche UTC, así que en
 * Lima (−05:00) se pintaría como 31 de agosto: un bug silencioso que solo aparece en
 * producción y solo para los pagos del día 1.
 */
export function formatIsoDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day} ${MONTH_NAMES[Number(month) - 1]} ${year}`;
}
