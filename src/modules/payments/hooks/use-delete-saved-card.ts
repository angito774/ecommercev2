'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { paymentMethodKeys } from '../constants';
import { deleteSavedCard } from '../services/payment-method.service';

export function useDeleteSavedCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteSavedCard(id),
    onSuccess: async () => {
      // La lista se refresca sin recargar la página (AC11). Se invalida la clave raíz
      // porque la baja afecta a cualquier consulta del módulo, no solo al listado.
      await queryClient.invalidateQueries({ queryKey: paymentMethodKeys.all });
      toast.success('Tarjeta eliminada');
    },
    onError: (error) => {
      // El 502 explica que el fallo es de Stripe y que la tarjeta sigue ahí; el
      // diálogo se queda abierto para reintentar (AC12).
      toast.error(error.message);
    },
  });
}
