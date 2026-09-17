import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseQueryParams,
} from './schemas/finance.schema';
import type { FinanceRange } from './types/finance.types';

export const EXPENSE_PAGE_SIZE = 20;

// Mapa total sobre `ExpenseCategory`: el `Record` obliga a que añadir un valor al enum
// rompa el typecheck aquí en vez de pintar el código crudo en la tabla (D-4).
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  suppliers: 'Proveedores',
  logistics: 'Logística',
  rent: 'Alquiler',
  utilities: 'Servicios',
  marketing: 'Marketing',
  software: 'Software',
  taxes: 'Tributos',
  other: 'Otros',
};

export const ALL_EXPENSE_CATEGORIES = 'all';

// El centinela va al frente y no se ordena con el resto: es «sin filtro», no una
// categoría más.
export const EXPENSE_CATEGORY_OPTIONS = [
  { value: ALL_EXPENSE_CATEGORIES, label: 'Todas las categorías' },
  ...EXPENSE_CATEGORIES.map((category) => ({
    value: category,
    label: EXPENSE_CATEGORY_LABELS[category],
  })),
];

export const financeKeys = {
  all: ['finance'] as const,
  // El rango entra en la clave: cambiar de mes es otra consulta, no una invalidación
  // de la anterior, y `keepPreviousData` necesita distinguirlas.
  summary: (range: FinanceRange) => [...financeKeys.all, 'summary', range] as const,
};

export const expenseKeys = {
  all: ['expenses'] as const,
  lists: () => [...expenseKeys.all, 'list'] as const,
  list: (params: ExpenseQueryParams) => [...expenseKeys.lists(), params] as const,
};

// Los copys viven juntos porque todos dicen la misma cosa con distintas palabras
// —«no hay datos» no es «hubo un error»— y separarlos por componente hace que uno se
// desalinee del resto.
export const EMPTY_EXPENSES_TITLE = 'Sin gastos en el rango';

export const EMPTY_EXPENSES_MESSAGE =
  'Nadie ha registrado gastos con fecha dentro de estas fechas.';

export const NO_RESULTS_TITLE = 'Sin resultados';

export const NO_RESULTS_MESSAGE = 'Ningún gasto del rango pertenece a esa categoría.';

export const EMPTY_BREAKDOWN_MESSAGE = 'Sin gastos registrados en el rango.';

// `null` en `marginPercent` no es un fallo: es que el rango no tuvo ingresos y sin
// base no hay porcentaje que calcular (D-12, AC10).
export const NO_REVENUE_MESSAGE = 'Sin ingresos en el rango';

export const FINANCE_SUMMARY_ERROR_MESSAGE = 'No se pudo cargar el resumen financiero.';
