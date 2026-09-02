import { api } from '@/lib/axios';

import type { RolesResponse } from '../types/role.types';

const BASE_URL = '/admin/roles';

export async function fetchRoles(): Promise<RolesResponse> {
  const { data } = await api.get<RolesResponse>(BASE_URL);
  return data;
}
