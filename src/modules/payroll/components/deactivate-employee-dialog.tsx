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

import { useDeactivateEmployee } from '../hooks/use-employee-mutations';
import type { EmployeeRow } from '../types/employee.types';

type DeactivateEmployeeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeRow | null;
};

export function DeactivateEmployeeDialog({
  open,
  onOpenChange,
  employee,
}: DeactivateEmployeeDialogProps) {
  const deactivateMutation = useDeactivateEmployee();

  async function handleConfirm() {
    if (!employee) return;

    try {
      await deactivateMutation.mutateAsync(employee.id);
      onOpenChange(false);
    } catch {
      // El toast de error lo emite el hook; el diálogo permanece abierto para que se
      // pueda reintentar.
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Dar de baja a {employee?.firstName} {employee?.lastName}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {/* La baja es lógica y conviene decirlo: quien pulsa aquí espera un borrado
                y lo que ocurre es otra cosa (AC7). */}
            La ficha no se borra: deja de aparecer en la planilla activa y ya no se le
            pueden registrar pagos, pero su historial de pagos sigue siendo consultable
            desde el filtro de estado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deactivateMutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={deactivateMutation.isPending}
          >
            {deactivateMutation.isPending ? 'Dando de baja…' : 'Dar de baja'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
