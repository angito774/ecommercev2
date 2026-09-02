'use client';

import { useQuery } from '@tanstack/react-query';

import { roleKeys } from '../constants';
import { fetchRoles } from '../services/role.service';

// Los 6 roles nacen del seed y no cambian sin un despliegue: el diálogo de
// asignación y la matriz de /admin/roles comparten esta caché sin refetch al
// enfocar la ventana.
export function useRoles() {
  return useQuery({
    queryKey: roleKeys.list(),
    queryFn: fetchRoles,
    staleTime: Infinity,
  });
}
