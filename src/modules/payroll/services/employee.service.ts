import { api } from '@/lib/axios';

import type {
  CreateEmployeeInput,
  EmployeeQueryParams,
  UpdateEmployeeInput,
} from '../schemas/employee.schema';
import type { EmployeeListResponse, EmployeeRow } from '../types/employee.types';

const EMPLOYEES_URL = '/admin/employees';

// Único punto del módulo que habla con la API de personal. Los componentes lo consumen
// a través de los hooks, nunca directamente (docs/SETUP.md §4, regla dura 2).
export async function fetchEmployees(params: EmployeeQueryParams): Promise<EmployeeListResponse> {
  const { data } = await api.get<EmployeeListResponse>(EMPLOYEES_URL, { params });
  return data;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<EmployeeRow> {
  const { data } = await api.post<EmployeeRow>(EMPLOYEES_URL, input);
  return data;
}

export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
): Promise<EmployeeRow> {
  const { data } = await api.patch<EmployeeRow>(`${EMPLOYEES_URL}/${id}`, input);
  return data;
}

// `DELETE` en la ruta, baja lógica en la base: devuelve la misma fila con
// `isActive: false` (AC7).
export async function deactivateEmployee(id: string): Promise<EmployeeRow> {
  const { data } = await api.delete<EmployeeRow>(`${EMPLOYEES_URL}/${id}`);
  return data;
}
