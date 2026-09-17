'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { payrollKeys } from '../constants';
import type { PayrollQueryParams } from '../schemas/payroll.schema';
import { fetchPayrollPayments } from '../services/payroll-payment.service';

export function usePayrollPayments(params: PayrollQueryParams) {
  return useQuery({
    queryKey: payrollKeys.list(params),
    queryFn: () => fetchPayrollPayments(params),
    placeholderData: keepPreviousData,
  });
}
