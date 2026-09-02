'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { userKeys } from '../constants';
import type {
  AssignRolesInput,
  InviteUserValues,
  UpdateUserInput,
} from '../schemas/user.schema';
import {
  inviteUser,
  setUserActive,
  setUserRoles,
} from '../services/user.service';

export function useInviteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: InviteUserValues) => inviteUser(input),
    onSuccess: async (result) => {
      // El listado no cambia todavía —la fila nace cuando el webhook `user.created`
      // llega—, pero se invalida igual por si la persona ya se había registrado.
      await queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success(`Invitación enviada a ${result.email}`);
    },
  });
}

export function useSetUserRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssignRolesInput }) =>
      setUserRoles(id, input),
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success(`Roles de ${user.email} actualizados`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useSetUserActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      setUserActive(id, input),
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success(
        user.isActive ? `${user.email} vuelve a tener acceso` : `${user.email} ya no tiene acceso`,
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
