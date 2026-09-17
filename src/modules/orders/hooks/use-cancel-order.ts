'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { adminOrderKeys } from '../constants';
import { cancelOrder } from '../services/admin-order.service';

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => cancelOrder(id),
    onSuccess: async () => {
      // `adminOrderKeys.all` y no solo la lista: el sheet abierto muestra el estado
      // del pedido y quedaría diciendo «Pendiente» sobre una orden ya cancelada
      // (AC12).
      await queryClient.invalidateQueries({ queryKey: adminOrderKeys.all });
      // Sin el número de pedido: quien confirma acaba de leerlo en el diálogo, y
      // formatearlo aquí duplicaría el `formatOrderNumber` que vive en los
      // componentes.
      toast.success('El pedido queda cancelado.');
    },
    onError: (error) => {
      // El 409 llega aquí con el mensaje que nombra el estado actual: el interceptor
      // de axios colapsa la respuesta a su `message` (AC13).
      toast.error(error.message);
    },
  });
}
