'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { employeeKeys, payrollKeys } from '../constants';
import type { CreateEmployeeInput, UpdateEmployeeInput } from '../schemas/employee.schema';
import {
  createEmployee,
  deactivateEmployee,
  updateEmployee,
} from '../services/employee.service';

// El listado de pagos muestra el nombre y el código del empleado desde el join, así que
// editar la ficha deja rancia también esa tabla. Las tres mutaciones invalidan las dos
// listas en vez de dejar que una pestaña muestre el nombre anterior.
function invalidatePayroll(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: employeeKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: payrollKeys.lists() }),
  ]);
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateEmployeeInput) => createEmployee(input),
    onSuccess: async (employee) => {
      await invalidatePayroll(queryClient);
      toast.success(`${employee.firstName} ${employee.lastName} se dio de alta`);
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEmployeeInput }) =>
      updateEmployee(id, input),
    onSuccess: async (employee) => {
      await invalidatePayroll(queryClient);
      toast.success(`Ficha de ${employee.firstName} ${employee.lastName} actualizada`);
    },
  });
}

export function useDeactivateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateEmployee(id),
    onSuccess: async (employee) => {
      await invalidatePayroll(queryClient);
      toast.success(`${employee.firstName} ${employee.lastName} se dio de baja`);
    },
    // El diálogo de baja no tiene dónde pintar el error —no es un formulario— así que
    // el toast es su único canal. El formulario sí lo marca sobre el campo.
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
