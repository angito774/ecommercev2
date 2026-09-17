import { api } from '@/lib/axios';

import type {
  CreatePayrollPaymentInput,
  PayrollQueryParams,
} from '../schemas/payroll.schema';
import type { PayrollListResponse, PayrollPaymentRow } from '../types/payroll.types';

// El nombre del archivo es distinto del `payroll.service.ts` de servidor a propósito:
// uno transporta por axios y el otro orquesta repositorios, y tener los dos con el
// mismo nombre haría que un import equivocado compilara.
const PAYROLL_URL = '/admin/payroll';

export async function fetchPayrollPayments(
  params: PayrollQueryParams,
): Promise<PayrollListResponse> {
  const { data } = await api.get<PayrollListResponse>(PAYROLL_URL, { params });
  return data;
}

export async function registerPayment(
  input: CreatePayrollPaymentInput,
): Promise<PayrollPaymentRow> {
  const { data } = await api.post<PayrollPaymentRow>(PAYROLL_URL, input);
  return data;
}

// `DELETE` en la ruta, anulación lógica en la base: devuelve la fila con
// `status: 'voided'` y su importe intacto (AC15).
export async function voidPayment(id: string): Promise<PayrollPaymentRow> {
  const { data } = await api.delete<PayrollPaymentRow>(`${PAYROLL_URL}/${id}`);
  return data;
}
