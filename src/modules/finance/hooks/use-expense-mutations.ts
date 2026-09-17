'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { expenseKeys, financeKeys } from '../constants';
import type { CreateExpenseInput, UpdateExpenseInput } from '../schemas/finance.schema';
import { createExpense, deleteExpense, updateExpense } from '../services/finance.service';

// Las tres mutaciones invalidan el listado **y** el resumen: cualquiera de ellas cambia
// el importe de «Gastos», el resultado y el desglose por categoría, así que refrescar
// solo la tabla dejaría las tarjetas mintiendo hasta la siguiente recarga (AC18).
function invalidateFinance(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: expenseKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  ]);
}

export function useCreateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateExpenseInput) => createExpense(input),
    onSuccess: async (expense) => {
      await invalidateFinance(queryClient);
      toast.success(`Gasto "${expense.concept}" registrado`);
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateExpenseInput }) =>
      updateExpense(id, input),
    onSuccess: async (expense) => {
      await invalidateFinance(queryClient);
      toast.success(`Gasto "${expense.concept}" actualizado`);
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: async (expense) => {
      await invalidateFinance(queryClient);
      toast.success(`Gasto "${expense.concept}" eliminado`);
    },
    // El diálogo de borrado no tiene dónde pintar el error —no es un formulario— así
    // que el toast es su único canal. Las otras dos lo marcan en el campo.
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
