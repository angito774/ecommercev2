import { api } from '@/lib/axios';

import type {
  AssignRolesInput,
  InviteUserValues,
  UpdateUserInput,
  UserQueryParams,
} from '../schemas/user.schema';
import type { InvitationResult, UserListResponse, UserWithRoles } from '../types/user.types';

const BASE_URL = '/admin/users';

export async function fetchUsers(params: UserQueryParams): Promise<UserListResponse> {
  const { data } = await api.get<UserListResponse>(BASE_URL, { params });
  return data;
}

export async function inviteUser(input: InviteUserValues): Promise<InvitationResult> {
  const { data } = await api.post<InvitationResult>(BASE_URL, input);
  return data;
}

export async function setUserActive(
  id: string,
  input: UpdateUserInput,
): Promise<UserWithRoles> {
  const { data } = await api.patch<UserWithRoles>(`${BASE_URL}/${id}`, input);
  return data;
}

export async function setUserRoles(
  id: string,
  input: AssignRolesInput,
): Promise<UserWithRoles> {
  const { data } = await api.put<UserWithRoles>(`${BASE_URL}/${id}/roles`, input);
  return data;
}
