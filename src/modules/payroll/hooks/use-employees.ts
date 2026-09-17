'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { employeeKeys } from '../constants';
import type { EmployeeQueryParams } from '../schemas/employee.schema';
import { fetchEmployees } from '../services/employee.service';

export function useEmployees(params: EmployeeQueryParams) {
  return useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: () => fetchEmployees(params),
    // Sin esto la tabla se vacía en cada cambio de página o de filtro y la altura
    // salta; con datos previos solo se marca como "fetching".
    placeholderData: keepPreviousData,
  });
}
