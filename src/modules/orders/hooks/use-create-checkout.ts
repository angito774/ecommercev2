'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { CheckoutInput } from '../schemas/checkout.schema';
import { createCheckout } from '../services/checkout.service';

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (input: CheckoutInput) => createCheckout(input),
    onSuccess: ({ url }) => {
      // Navegación dura, no `router.push()`: el destino es `checkout.stripe.com`,
      // fuera de la aplicación, y el router de Next no puede llevarnos allí.
      window.location.assign(url);
    },
    onError: (error) => {
      // El interceptor de `src/lib/axios.ts` ya colapsó la respuesta a su `message`,
      // así que el 409 llega con el nombre del producto agotado (AC4).
      toast.error(error.message);
    },
    // Sin `invalidateQueries`: el carrito vive en Zustand y no hay caché de servidor
    // que refrescar. Vaciarlo aquí sería prematuro —el pago aún no ha ocurrido— y
    // dejaría al cliente sin carrito si cancela en Stripe.
  });
}
