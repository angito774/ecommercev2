'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { adminOrderKeys } from '@/modules/orders/constants';

import { ISSUE_SUCCESS_MESSAGE } from '../constants';
import { issueDocument } from '../services/invoicing.service';

type IssueDocumentVariables = {
  documentId: string;
  /** El pedido cuyo detalle hay que refrescar: el documento se lee siempre dentro de él. */
  orderId: string;
};

/**
 * Invalida **el detalle del pedido** y no una lista de comprobantes: el documento no tiene
 * pantalla propia, se ve dentro del `Sheet` del pedido, así que ese detalle es literalmente
 * la consulta que quedó desactualizada.
 *
 * El listado de `/admin/orders` no se invalida: sus columnas —estado del pedido, cliente,
 * total— no cambian al emitir, y refrescarlo daría a entender que sí.
 *
 * El error **no** se traga con un toast y ya: se deja propagar para que el componente pueda
 * pintar el aviso del rechazo permanente junto al documento, que es donde se lee (AC12).
 * El toast de fallo cubre el caso en que el sheet se cierre mientras la petición viaja.
 */
export function useIssueDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId }: IssueDocumentVariables) => issueDocument(documentId),
    onSuccess: async (document, { orderId }) => {
      await queryClient.invalidateQueries({ queryKey: adminOrderKeys.detail(orderId) });
      toast.success(`${ISSUE_SUCCESS_MESSAGE} ${document.label ?? ''}`.trim());
    },
    onError: (error: Error, { orderId }) => {
      // El documento quedó `failed` con su `attempt_count` incrementado y su `last_error`
      // escrito, así que la fila del sheet tiene que releerse aunque la emisión fallara:
      // sin esto, la pantalla seguiría diciendo «pendiente, 0 intentos» tras un rechazo.
      void queryClient.invalidateQueries({ queryKey: adminOrderKeys.detail(orderId) });
      toast.error(error.message);
    },
  });
}
