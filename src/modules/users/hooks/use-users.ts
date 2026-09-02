'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { userKeys } from '../constants';
import type { UserQueryParams } from '../schemas/user.schema';
import { fetchUsers } from '../services/user.service';

export function useUsers(params: UserQueryParams) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => fetchUsers(params),
    // Sin esto la tabla se vacía en cada cambio de página o de filtro y la altura
    // salta; con datos previos solo se marca como "fetching".
    placeholderData: keepPreviousData,
  });
}
