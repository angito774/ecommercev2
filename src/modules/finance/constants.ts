import type { OriginalDocumentKind } from '@/lib/electronic-documents';

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
  // Clave propia y no una rama de `summary`: son dos endpoints distintos y compartir
  // clave haría que una invalidación arrastrara a la otra pantalla (spec 026, D-1).
  taxes: (range: FinanceRange) => [...financeKeys.all, 'taxes', range] as const,
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

// ── Ventas confirmadas y declarables (spec 025) ─────────────────────────────

// Solo la etiqueta cambia: el cálculo y el campo del contrato (`revenueCents`) son los
// de siempre (D-3, AC3). Se rotula «confirmadas» y no «por ventas» porque ahora hay dos
// cifras de ventas en la misma pantalla y el rótulo tiene que decir cuál es cuál.
export const CONFIRMED_SALES_CARD_TITLE = 'Ventas confirmadas';

export const DECLARABLE_SALES_CARD_TITLE = 'Ventas declarables';

// El pie de la card «Ventas confirmadas»: dice qué mide, porque el primer instinto ante
// dos números distintos es pensar que uno está mal (§10).
export const CONFIRMED_SALES_HINT = 'Cobrado por Stripe';

export const DECLARABLE_SALES_HINT = 'Emitido ante SUNAT, neto de correcciones';

// Etiquetas cortas del desglose: en un pie de card de dos filas, «Boleta de venta
// electrónica» de `ELECTRONIC_DOCUMENT_KIND_LABELS` ocupa más que el importe que
// acompaña. `Record` total sobre `OriginalDocumentKind`, así que añadir un `kind` sin
// padre rompería el typecheck aquí en vez de pintar el código crudo.
export const DECLARABLE_SALES_KIND_LABELS: Record<OriginalDocumentKind, string> = {
  boleta: 'Boletas',
  factura: 'Facturas',
};

// La etiqueta del importe negativo. Un total en negativo es real y frecuente —las notas
// de crédito emitidas en el rango corrigen ventas facturadas en otro—, y el glifo «−» a
// secas no lo comunica: se lee como un importe positivo más. Va en minúscula porque
// sigue a la cifra («-S/ 1,000.00 crédito neto» — Intl es-PE pone el signo antes
// del símbolo, no antes de la cifra), no la encabeza.
export const DECLARABLE_SALES_NET_CREDIT_LABEL = 'crédito neto';

// Un rango sin comprobantes emitidos no es un error ni una carga: es S/ 0.00 con su copy
// (AC14). Dice «no se emitió» y no «faltan datos» porque el desglose oculta a propósito
// las familias sin filas, y el copy no debe sugerir que se perdió algo (§10).
export const EMPTY_DECLARABLE_SALES_MESSAGE = 'No se emitió ningún comprobante en el rango.';

// El indicador de salud. Solo aparece con conteo mayor que cero (D-12): una línea
// permanente que casi siempre dice cero es ruido que se deja de leer.
export const UNINVOICED_ORDERS_LINK_LABEL = 'Ir a pedidos';

// El indicador cuenta, no resuelve: la emisión y sus reintentos viven en `/admin/orders`
// (§3). Si el número crece mes a mes, el problema es que nadie está emitiendo, no esta
// pantalla (§10).
export const UNINVOICED_ORDERS_HINT =
  'Están cobrados, pero todavía no tienen comprobante emitido ante SUNAT. La emisión es manual y se hace desde el panel de pedidos.';

// El enlace va a `/admin/orders` **a secas** (D-11): aquella tabla guarda sus filtros en
// `useState` y no lee la URL, así que una query string no filtraría nada y el enlace
// prometería algo que no pasa.
export const UNINVOICED_ORDERS_HREF = '/admin/orders';

// El aviso del encabezado: las dos cifras casi nunca coinciden, y eso no es un fallo
// (§10). Se dice aquí, arriba del todo, porque es interpretación y no código.
export const DECLARABLE_SALES_INFORMATIVE_NOTE =
  'Las ventas confirmadas son lo cobrado por Stripe; las declarables, lo emitido ante SUNAT neto de notas de crédito y débito. Casi nunca coinciden: la emisión es manual, un pedido cobrado el día 30 puede facturarse el 1, y una corrección posterior cambia lo facturado sin devolver el cobro.';

// ── Impuestos: IGV y Renta RER (spec 026) ───────────────────────────────────

export const TAXES_IGV_BLOCK_TITLE = 'IGV del período';

export const TAXES_INCOME_TAX_BLOCK_TITLE = 'Renta RER estimada';

// «Débito» y «crédito» con su origen entre paréntesis: son los términos de la
// declaración, pero quien mira la pantalla no tiene por qué saber cuál es cuál.
export const IGV_DEBIT_LABEL = 'Débito fiscal (ventas)';

export const IGV_CREDIT_LABEL = 'Crédito fiscal (compras)';

// Las tres etiquetas del neto. El servidor publica `netCents` con signo y la etiqueta la
// elige la vista (D-5): un «IGV por pagar» en negativo sería mentira, y el cero tiene su
// propio caso porque «S/ 0.00 por pagar» se lee como un importe pendiente (AC16).
export const IGV_NET_PAYABLE_LABEL = 'IGV por pagar';

export const IGV_NET_CREDIT_BALANCE_LABEL = 'Saldo a favor';

export const IGV_NET_ZERO_LABEL = 'Sin IGV por pagar';

// El crédito de compras sale de la misma función que la card «IGV de compras» del
// resumen, y solo de los comprobantes que dan derecho a crédito fiscal (AC13, AC14).
export const IGV_CREDIT_HINT = 'Solo comprobantes con derecho a crédito fiscal';

// La etiqueta de un importe negativo del bloque de IGV. Un débito negativo es real —las
// notas de crédito del rango corrigen IGV facturado en otro— y el «-» de `formatPrice`
// no lo comunica: en una fila de `text-sm` se lee como un importe positivo más (017,
// AC9). Copy propio y no el de ventas declarables: lo que queda en negativo aquí es el
// impuesto, no la venta. Va en minúscula porque sigue a la cifra, no la encabeza.
export const IGV_NEGATIVE_AMOUNT_LABEL = 'corrección neta de IGV';

export const INCOME_TAX_BASE_LABEL = 'Base de cálculo · ingresos netos sin IGV';

// Mismo criterio que `IGV_NEGATIVE_AMOUNT_LABEL`, con su propio copy: esta cifra son
// ingresos sin IGV, no el impuesto.
export const INCOME_TAX_BASE_NEGATIVE_LABEL = 'corrección neta de ingresos';

export const INCOME_TAX_ESTIMATE_LABEL = 'Renta estimada del rango';

// Un rango sin comprobantes emitidos y sin compras con crédito no es un error ni una
// carga: es S/ 0.00 con su copy (AC21).
export const EMPTY_TAXES_IGV_MESSAGE =
  'No se emitió ningún comprobante ni se registró ninguna compra con crédito fiscal en el rango.';

export const EMPTY_INCOME_TAX_MESSAGE =
  'Sin ingresos netos en el rango: no hay base sobre la que estimar la Renta.';

// Base negativa y base cero acaban las dos en un estimado de `0` (D-6, AC18), pero no
// significan lo mismo: una es «no hubo actividad» y la otra «se corrigió más de lo que se
// emitió». Sin esta frase, las dos se leen igual en pantalla.
export const NEGATIVE_INCOME_TAX_BASE_MESSAGE =
  'Las correcciones del rango superan lo emitido: no hay base positiva sobre la que estimar la Renta.';

export const FINANCE_TAXES_ERROR_MESSAGE = 'No se pudo cargar el cálculo de impuestos.';

// El aviso del saldo a favor. Es el malentendido más probable de toda la pantalla (§10):
// se muestra siempre, no solo cuando el neto es negativo (AC20).
export const IGV_CREDIT_BALANCE_NOTE =
  'El saldo a favor es informativo del rango elegido: este panel no lo arrastra al período siguiente ni registra qué declaraciones se presentaron. El neto tampoco descuenta retenciones, percepciones ni detracciones, así que no es «lo que hay que pagar», sino el resultado de restar el crédito fiscal al débito.';

// El aviso del estimado de Renta. Permanente y no condicional (D-13): un aviso que
// aparece y desaparece enseña a ignorarlo, y la declaración real tampoco coincide con un
// rango elegido a mano aunque las fechas cuadren (AC19).
export const RER_ESTIMATE_NOTE =
  'La Renta del Régimen Especial es un estimado sobre los ingresos netos del rango elegido. La declaración real es mensual y exacta: se presenta por mes calendario, con el cronograma de SUNAT y sobre los libros del contribuyente. Lo mismo vale para el IGV, que también se declara por mes completo.';

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
