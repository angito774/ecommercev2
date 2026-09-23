import { api } from '@/lib/axios';

import type {
  CreateExpenseInput,
  ExpenseQueryParams,
  UpdateExpenseInput,
} from '../schemas/finance.schema';
import type {
  ExpenseListResponse,
  ExpenseMutated,
  FinanceRange,
  FinanceSummaryResponse,
  FinanceTaxesResponse,
} from '../types/finance.types';

const SUMMARY_URL = '/admin/finance/summary';
const TAXES_URL = '/admin/finance/taxes';
const EXPENSES_URL = '/admin/expenses';

// Único punto del módulo que habla con la API. Los componentes lo consumen a través de
// los hooks, nunca directamente (docs/SETUP.md §4, regla dura 2).
export async function fetchFinanceSummary(range: FinanceRange): Promise<FinanceSummaryResponse> {
  const { data } = await api.get<FinanceSummaryResponse>(SUMMARY_URL, { params: range });
  return data;
}

// Endpoint propio y no un campo del resumen (D-1): las dos pantallas se miran en momentos
// distintos y ninguna consume los campos de la otra.
export async function fetchFinanceTaxes(range: FinanceRange): Promise<FinanceTaxesResponse> {
  const { data } = await api.get<FinanceTaxesResponse>(TAXES_URL, { params: range });
  return data;
}

export async function fetchExpenses(params: ExpenseQueryParams): Promise<ExpenseListResponse> {
  const { data } = await api.get<ExpenseListResponse>(EXPENSES_URL, { params });
  return data;
}

export async function createExpense(input: CreateExpenseInput): Promise<ExpenseMutated> {
  const { data } = await api.post<ExpenseMutated>(EXPENSES_URL, input);
  return data;
}

export async function updateExpense(
  id: string,
  input: UpdateExpenseInput,
): Promise<ExpenseMutated> {
  const { data } = await api.patch<ExpenseMutated>(`${EXPENSES_URL}/${id}`, input);
  return data;
}

export async function deleteExpense(id: string): Promise<ExpenseMutated> {
  const { data } = await api.delete<ExpenseMutated>(`${EXPENSES_URL}/${id}`);
  return data;
}
