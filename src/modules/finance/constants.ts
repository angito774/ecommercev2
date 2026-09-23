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

// ── Comprobante de compra e IGV (spec 024) ──────────────────────────────────

export const PURCHASE_IGV_CARD_TITLE = 'IGV de compras';

// El subtítulo de la cifra principal: dice que lo que se pinta arriba es solo lo que da
// derecho a crédito, porque los dos números nunca se presentan sumados (AC14, D-10).
export const PURCHASE_IGV_CREDITABLE_LABEL = 'Con derecho a crédito fiscal';

export const PURCHASE_IGV_NON_CREDITABLE_LABEL = 'Sin derecho a crédito fiscal';

// Un rango sin IGV de compras no es un error ni una carga: es S/ 0.00 con su copy
// (AC15). Dice «sin IGV» y no «sin comprobantes» porque los dos recuentos que disparan
// este estado solo cuentan filas con `igv_cents is not null`: un rango entero de recibos
// por honorarios sí tiene comprobantes declarados y aun así llega aquí. Tampoco
// distingue «no hubo facturas» de «nadie las anotó» (§10).
export const EMPTY_PURCHASE_IGV_MESSAGE = 'Sin IGV de compras en el rango.';

// El aviso del encabezado: el IGV de compras es un dato al lado, no un sumando del
// resultado del período (§3).
export const PURCHASE_IGV_INFORMATIVE_NOTE =
  'El IGV de compras es informativo y no entra en el resultado del período: se publica para el cálculo del crédito fiscal, no para restarlo de los gastos.';

// La celda de las filas sin comprobante: un guion con texto accesible, nunca «S/ 0.00»
// —que diría «un IGV de cero»— ni una celda en blanco (AC19).
export const NO_RECEIPT_LABEL = 'Sin comprobante declarado';

export const NO_IGV_LABEL = 'Este comprobante no lleva IGV';

// ── Formulario ──────────────────────────────────────────────────────────────

export const HAS_RECEIPT_SWITCH_LABEL = '¿Tiene comprobante?';

export const HAS_RECEIPT_SWITCH_HINT =
  'Actívalo si el gasto llegó con factura, boleta o recibo. Sin comprobante el gasto se registra igual.';

// Lo que el usuario no debe intentar teclear: el IGV no es un campo (AC7).
export const IGV_COMPUTED_HINT =
  'El IGV lo calcula el sistema a partir del importe y del tipo de comprobante. No se teclea.';

export const SUPPLIER_RUC_HINT =
  'Once dígitos. Se comprueba el dígito verificador, no que el proveedor exista en SUNAT.';

export const SUPPLIER_NAME_HINT = 'Razón social tal y como figura en el comprobante.';

export const RECEIPT_SERIES_HINT = 'Opcional, pero serie y número van juntos.';

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
