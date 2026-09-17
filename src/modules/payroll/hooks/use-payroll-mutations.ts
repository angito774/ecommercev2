'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { formatPeriodLabel } from '../lib/payroll-dates';
import { payrollKeys } from '../constants';
import type { CreatePayrollPaymentInput } from '../schemas/payroll.schema';
import { registerPayment, voidPayment } from '../services/payroll-payment.service';

export function useRegisterPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePayrollPaymentInput) => registerPayment(input),
    onSuccess: async (payment) => {
      // Solo la lista de pagos: registrar un pago no cambia ninguna ficha de personal.
      await queryClient.invalidateQueries({ queryKey: payrollKeys.lists() });
      toast.success(
        `Pago de ${formatPeriodLabel(payment.period)} registrado para ${payment.employeeFullName}`,
      );
    },
  });
}

export function useVoidPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => voidPayment(id),
    onSuccess: async (payment) => {
      await queryClient.invalidateQueries({ queryKey: payrollKeys.lists() });
      toast.success(
        `Pago de ${formatPeriodLabel(payment.period)} anulado para ${payment.employeeFullName}`,
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
