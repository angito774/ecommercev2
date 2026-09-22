import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseQueryParams,
} from './schemas/finance.schema';
import type { PricingQueryParams } from './schemas/pricing.schema';
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

// ── Precio unitario (spec 021) ──────────────────────────────────────────────

export const PRICING_PAGE_SIZE = 20;

// Mismo valor que ya se repite en categories, inventory, orders, payroll, products
// y users — esta es la séptima copia, deuda preexistente al spec 021, no la
// segunda. Consolidarla tocaría seis módulos fuera del alcance de este spec;
// importarlo desde cualquiera de ellos acoplaría finanzas a otro dominio por una
// constante de UI, así que se duplica aquí también a propósito.
export const PRICING_SEARCH_DEBOUNCE_MS = 300;

export const pricingKeys = {
  all: ['pricing'] as const,
  lists: () => [...pricingKeys.all, 'list'] as const,
  list: (params: PricingQueryParams) => [...pricingKeys.lists(), params] as const,
};

// `null` en `averageCostCents` no es un fallo ni un cero: es que ese producto todavía no
// tiene ninguna compra registrada ni costo inicial cargado. La tabla arranca con todas
// sus filas así, que es honesto y no un error (§10, AC5).
export const NO_COST_LABEL = 'Sin costo registrado';

export const NO_COST_HINT =
  'Sin compras registradas ni costo inicial: no hay margen que calcular.';

// Los copys viven juntos porque todos dicen la misma cosa con distintas palabras —«no hay
// datos» no es «hubo un error»— y separarlos por componente hace que uno se desalinee.
export const EMPTY_PRICING_TITLE = 'Sin productos activos';

export const EMPTY_PRICING_MESSAGE =
  'El catálogo no tiene ningún producto activo del que calcular un margen.';

export const NO_PRICING_RESULTS_TITLE = 'Sin resultados';

export const NO_PRICING_RESULTS_MESSAGE =
  'Ningún producto activo coincide con esa búsqueda por nombre o SKU.';

export const PRICING_ERROR_MESSAGE = 'No se pudo cargar el precio unitario.';

// El aviso del diálogo, y no solo del spec: las notas de inventario no se editan ni se
// anulan (spec 020, D-9), así que el promedio no se puede deshacer y el costo inicial es
// irrepetible por diseño (§10, D-4).
export const INITIAL_COST_IRREVERSIBLE_NOTE =
  'El costo inicial se registra una sola vez y no se puede editar ni borrar después. A partir de ahí solo lo mueven las notas de ingreso por compra.';

// El 409 del segundo intento: el cuerpo es válido y lo que está en conflicto es el estado
// del recurso, igual que cancelar un pedido que ya no está `pending` (D-5).
export const COST_ALREADY_SET_MESSAGE =
  'Este producto ya tiene un costo registrado. El costo inicial solo se carga una vez.';
