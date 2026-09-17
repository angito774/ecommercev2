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

export type FinanceSummary = {
  // Lo cobrado: `sum(amount_total_cents)` de los pedidos `paid`, envío incluido
  // (D-10). Mismo número que el KPI de ventas del dashboard para igual rango.
  revenueCents: number;
  orderCount: number;
  expensesCents: number;
  expenseCount: number;
  // revenueCents − expensesCents. Puede ser negativo (AC9).
  netCents: number;
  // null = no hubo ingresos en el rango; sin base no hay porcentaje (D-12, AC10).
  marginPercent: number | null;
  // Solo las categorías con al menos una fila, orden descendente por importe. El
  // porcentaje de cada barra lo calcula la vista: es un dato de pintado.
  expensesByCategory: ExpenseCategoryTotal[];
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
