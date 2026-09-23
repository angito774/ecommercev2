'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { adminOrderKeys } from '@/modules/orders/constants';

import { ADJUSTMENT_SUCCESS_MESSAGE } from '../constants';
import type { OrderAdjustmentInput } from '../schemas/order-adjustment.schema';
import { adjustOrder } from '../services/invoicing.service';

type AdjustOrderVariables = {
  orderId: string;
  input: OrderAdjustmentInput;
};

/**
 * Invalida **el detalle y el listado**, a diferencia de `useIssueDocument()`, que solo
 * invalida el detalle: un ajuste no cambia `order_status` —el enum no crece (§3)— pero sí
 * cambia lo que el pedido tiene devuelto, y esa cifra es la que la tabla usará el día que
 * la muestre. Invalidar de más cuesta una consulta; invalidar de menos deja la pantalla
 * afirmando que no se devolvió nada.
 *
 * El error **no** se traga con un toast y ya: se deja propagar para que el diálogo
 * permanezca abierto con el mensaje del servidor —el 409 de la carrera, el 400 del saldo,
 * el 502 de Stripe— junto al campo que hay que corregir (AC22). El toast cubre el caso en
 * que el sheet se cierre mientras la petición viaja.
 */
export function useAdjustOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, input }: AdjustOrderVariables) => adjustOrder(orderId, input),
    onSuccess: async (_result, { orderId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminOrderKeys.detail(orderId) }),
        queryClient.invalidateQueries({ queryKey: adminOrderKeys.lists() }),
      ]);
      toast.success(ADJUSTMENT_SUCCESS_MESSAGE);
    },
    onError: (error: Error, { orderId }) => {
      // El dinero pudo salir aunque la `tx B` fallara, y el pedido pudo moverlo otro
      // administrador: en los dos casos la pantalla que se está mirando ya no describe la
      // realidad, así que se relee antes de dejar que nadie vuelva a pulsar.
      void queryClient.invalidateQueries({ queryKey: adminOrderKeys.detail(orderId) });
      toast.error(error.message);
    },
  });
}
