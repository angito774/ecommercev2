import type { OriginalDocumentKind } from '@/lib/electronic-documents';
import type { PurchaseReceiptType } from '@/lib/purchase-receipts';
import type { expenses } from '@/server/db/schema';

import type { ExpenseCategory } from '../schemas/finance.schema';

// Inferido del schema Drizzle, nunca redeclarado a mano (CLAUDE.md regla 5).
type Expense = typeof expenses.$inferSelect;

// Se reexporta desde donde se produce en vez de redeclararse: `lib/finance-range.ts`
// es quien lo construye y quien lo consume el schema Zod, y una segunda declaración
// aquí sería la copia que se desalinea.
export type { FinanceRange } from '../lib/finance-range';

export type ExpenseCategoryTotal = {
  category: ExpenseCategory;
  amountCents: number;
  count: number;
};

// El comprobante de compra de un gasto, publicado como fila completa y no como seis
// campos sueltos: el componente hace una comprobación, no seis.
//
// **No** publica si otorga crédito fiscal: es derivable de `type` con
// `grantsTaxCredit()`, que es un módulo puro que el cliente puede importar. Publicarlo
// sería una segunda fuente de la misma regla (AC16).
export type ExpenseReceipt = {
  type: PurchaseReceiptType;
  supplierRuc: string;
  supplierName: string;
  series: string | null;
  number: string | null;
  /** `null` cuando el tipo no es afecto a IGV (§5.1). Nunca `0`. */
  igvCents: number | null;
};

// Los dos números del IGV de compras del período, siempre separados: sumarlos invitaría
// a descontar IGV de comprobantes que no dan derecho a crédito (AC14, D-10).
export type PurchaseIgvTotals = {
  /** Suma del IGV de los comprobantes que otorgan crédito fiscal. */
  creditableCents: number;
  creditableCount: number;
  /** El resto del IGV calculado del período. Se publica, nunca se suma al anterior. */
  nonCreditableCents: number;
  nonCreditableCount: number;
};

// Una fila por familia de comprobante, neta de **sus propias** correcciones: la nota de
// crédito de una factura no descuenta del total de boletas (AC12). La familia es la del
// padre cuando el documento es una corrección, y por eso solo puede valer `boleta` o
// `factura`: son los dos únicos `kind` sin padre.
export type DeclarableSalesByKind = {
  kind: OriginalDocumentKind;
  /** Originales menos notas de crédito más notas de débito, en céntimos. */
  amountCents: number;
  /** Comprobantes originales contados. */
  documentCount: number;
  /** Notas de crédito y débito contadas. Explica por qué el neto no es el bruto. */
  adjustmentCount: number;
};

export type DeclarableSales = {
  /** Suma exacta de `byKind[].amountCents`: se deriva de ellas, no de otra consulta (AC13). */
  amountCents: number;
  /** Solo las familias con al menos un documento contado, `boleta` antes que `factura`. */
  byKind: DeclarableSalesByKind[];
  /**
   * Pedidos `paid` del rango sin comprobante original `issued`. Es la brecha entre las
   * dos cifras, no un error: la emisión es manual (022, D-8).
   */
  uninvoicedOrderCount: number;
};

// ── Utilidad del período (spec 027) ─────────────────────────────────────────

// Un nivel del estado de resultados. El margen viaja al lado del importe y no se
// recalcula en la vista: es la misma regla de redondeo que el resto del módulo.
export type ProfitLevel = {
  amountCents: number;
  /** `null` cuando el ingreso neto no es positivo. Nunca `0`, `Infinity` ni `NaN` (AC21, AC22). */
  marginPercent: number | null;
};

// El costo de lo vendido y **su nivel de confianza**, juntos. Separarlos permitiría
// pintar el importe sin la advertencia, que es exactamente el error que este spec evita.
export type CostOfGoodsSold = {
  /** Suma de `cost_cents_snapshot × quantity`. Las líneas sin costo aportan `0` aquí. */
  amountCents: number;
  /** Líneas vendidas contadas en el rango. */
  lineCount: number;
  /**
   * Líneas sin `cost_cents_snapshot`. `> 0` ⇒ el COGS del rango es **parcial** y la
   * utilidad bruta está sobreestimada. Nunca se resuelve asumiendo `0` (D-3).
   */
  uncostedLineCount: number;
};

// El estado de resultados del rango. Se publican también los sustraendos, no solo los
// tres totales: tres números sin las restas que los separan no se pueden auditar a ojo.
export type PeriodProfit = {
  /**
   * Ingresos netos **sin IGV** de las ventas declarables. Base de los tres márgenes y el
   * mismo número que la base de Renta de `/admin/finance/taxes` (AC8).
   */
  netRevenueCents: number;
  cogs: CostOfGoodsSold;
  /** `netRevenueCents − cogs.amountCents`. */
  gross: ProfitLevel;
  /** Gastos del rango **netos del IGV con derecho a crédito fiscal** (§5.3, AC14). */
  operatingExpensesCents: number;
  payrollCents: number;
  payrollPaymentCount: number;
  /** `gross − operatingExpenses − payroll`. */
  operating: ProfitLevel;
  /** Renta RER estimada del rango. El IGV **no** entra aquí (D-10). */
  incomeTaxCents: number;
  /** `operating − incomeTax`. */
  net: ProfitLevel;
};

export type FinanceSummary = {
  /**
   * Ventas **confirmadas**: lo cobrado, `sum(amount_total_cents)` de los pedidos `paid`,
   * envío incluido (017, D-10). Mismo número que el KPI de ventas del dashboard para
   * igual rango. El nombre del campo no cambia en el spec 025 —solo la etiqueta de la
   * card— porque renombrarlo tocaría service, hook y componentes sin mover un solo
   * número (025, D-3).
   */
  revenueCents: number;
  orderCount: number;
  /** Importe **registrado** de los gastos, con IGV incluido: lo que salió de caja (D-8). */
  expensesCents: number;
  expenseCount: number;
  // Solo las categorías con al menos una fila, orden descendente por importe. El
  // porcentaje de cada barra lo calcula la vista: es un dato de pintado.
  expensesByCategory: ExpenseCategoryTotal[];
  // Dato al lado, no un sumando: el IGV de compras no resta de ninguno de los tres
  // niveles de utilidad (027, D-10, AC20).
  purchaseIgv: PurchaseIgvTotals;
  /**
   * Ventas **declarables**: lo facturado ante SUNAT neto de correcciones. Es la cifra de la
   * que cuelga la utilidad; las confirmadas se publican al lado como la caja (025, §3).
   */
  declarableSales: DeclarableSales;
  /**
   * **Reemplaza** a `netCents` y `marginPercent` del spec 017 (027, D-11): dos cifras de
   * «ganancia» distintas en la misma pantalla es peor que una sola bien definida, y la
   * vieja pierde siempre esa comparación —es la que la propia pantalla llevaba un spec
   * entero advirtiendo que no era utilidad—.
   */
  profit: PeriodProfit;
};

export type FinanceSummaryResponse = {
  data: FinanceSummary;
  meta: {
    // El rango realmente consultado, resuelto en el servidor: la UI rotula con esto
    // y un error de huso queda visible en la respuesta.
    range: { from: string; to: string };
    timeZone: string;
    generatedAt: string;
  };
};

// ── Impuestos (spec 026) ────────────────────────────────────────────────────

// Los dos lados del IGV del período y su resta. Nunca se publican sumados ni
// pre-etiquetados: el signo es el dato y la etiqueta es de la vista (D-5).
export type IgvSettlement = {
  /** IGV de las ventas declarables del rango: originales + notas de débito − notas de crédito. */
  debitCents: number;
  /** Comprobantes originales contados en el débito. */
  debitDocumentCount: number;
  /** Notas de crédito y débito contadas. Explica por qué el débito no es el bruto. */
  debitAdjustmentCount: number;
  /**
   * IGV de compras **con derecho a crédito fiscal**. Sale de `findExpenseTotals()`, la
   * misma función que alimenta la card «IGV de compras» del resumen, así que las dos
   * pantallas no pueden discrepar (AC13).
   */
  creditCents: number;
  creditReceiptCount: number;
  /** `debitCents − creditCents`, con signo. Positivo = por pagar; negativo = saldo a favor. */
  netCents: number;
};

// Estimado del rango, no la declaración. La **tasa no viaja en la respuesta**: es
// derivable de un módulo puro que el cliente puede importar, y publicarla sería una
// segunda fuente de la misma regla (D-8, mismo criterio que `grantsTaxCredit()` en 024).
export type IncomeTaxEstimate = {
  /** Ingresos netos del rango, **sin IGV**. Se publica con su signo real. */
  baseCents: number;
  /** `round(base × 1.5 %)` en aritmética entera; `0` cuando la base no es positiva (D-6). */
  estimatedCents: number;
};

export type FinanceTaxes = {
  igv: IgvSettlement;
  incomeTax: IncomeTaxEstimate;
};

export type FinanceTaxesResponse = {
  data: FinanceTaxes;
  meta: {
    // El rango realmente consultado, resuelto en el servidor: la UI rotula con esto y
    // un error de huso queda visible en la respuesta. Misma forma que el resumen.
    range: { from: string; to: string };
    timeZone: string;
    generatedAt: string;
  };
};

// `incurredOn` ya es `string` en el tipo inferido gracias a `mode: 'string'`, así que
// no repite la deuda de `ProductListResponse` (spec 016 §11), donde dos campos se
// declaran `Date` y JSON entrega `string`.
export type ExpenseRow = Pick<
  Expense,
  'id' | 'concept' | 'amountCents' | 'category' | 'incurredOn' | 'createdById'
> & {
  /** ISO: JSON no transporta `Date` y el tipo del cliente no debe mentir. */
  createdAt: string;
  /** `firstName` + `lastName` de quien registró; `null` si Clerk no los dio. */
  createdByName: string | null;
  createdByEmail: string;
  /** `null` = gasto sin comprobante formal, que es todo lo anterior al spec 024 (AC21). */
  receipt: ExpenseReceipt | null;
};

// Las mutaciones no devuelven marcas de tiempo, y no por olvido: `createdAt` y
// `updatedAt` cruzarían el JSON como `string` bajo un tipo `Date`. El cliente solo
// necesita el concepto para el toast e invalida las listas igualmente.
export type ExpenseMutated = Pick<
  Expense,
  'id' | 'concept' | 'amountCents' | 'category' | 'incurredOn' | 'createdById'
>;

export type ExpenseListResponse = {
  data: ExpenseRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    range: { from: string; to: string };
    // Resueltos en el servidor; la UI solo oculta controles. La frontera real es el
    // 403 de cada verbo (AC17).
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  };
};
