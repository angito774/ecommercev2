'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { useSetUserActive } from '../hooks/use-user-mutations';
import type { UserWithRoles } from '../types/user.types';

type ToggleUserActiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithRoles | null;
};

export function ToggleUserActiveDialog({
  open,
  onOpenChange,
  user,
}: ToggleUserActiveDialogProps) {
  const setActiveMutation = useSetUserActive();
  const isRevoking = user?.isActive ?? false;

  async function handleConfirm() {
    if (!user) return;

    try {
      await setActiveMutation.mutateAsync({ id: user.id, input: { isActive: !user.isActive } });
      onOpenChange(false);
    } catch {
      // El toast de error lo emite el hook; el diálogo permanece abierto para que el
      // admin pueda reintentar.
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isRevoking ? `Quitar el acceso a ${user?.email}` : `Devolver el acceso a ${user?.email}`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isRevoking
              ? 'Dejará de tener cualquier permiso del panel de inmediato, aunque su sesión siga abierta. Su cuenta no se borra y puedes devolverle el acceso cuando quieras.'
              : 'Recuperará todos los permisos de los roles que ya tenía asignados.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={setActiveMutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={setActiveMutation.isPending}
          >
            {setActiveMutation.isPending
              ? 'Guardando…'
              : isRevoking
                ? 'Quitar acceso'
                : 'Devolver acceso'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
