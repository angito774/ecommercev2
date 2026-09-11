'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { createCardSetup } from '../services/payment-method.service';

export function useCreateCardSetup() {
  return useMutation({
    mutationFn: createCardSetup,
    onSuccess: ({ url }) => {
      // Navegación dura, no `router.push()`: el destino es `checkout.stripe.com`,
      // fuera de la aplicación, y el router de Next no puede llevarnos allí.
      window.location.assign(url);
    },
    onError: (error) => {
      // El interceptor de `src/lib/axios.ts` ya colapsó la respuesta a su `message`,
      // así que el 409 llega con el texto del tope y el 502 con el de Stripe (AC12,
      // AC15).
      toast.error(error.message);
    },
    // Sin `invalidateQueries`: la tarjeta todavía no existe. La escribe el webhook y
    // la lista se refresca sola al volver con `?card=added` (D-7, D-16).
  });
}
