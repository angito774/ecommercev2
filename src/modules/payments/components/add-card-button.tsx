'use client';

import { Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { CARD_STORAGE_DISCLOSURE } from '../constants';
import { useCreateCardSetup } from '../hooks/use-create-card-setup';

// El opt-in es este botón, así que el texto de al lado no es adorno: Stripe exige
// declarar qué se guarda, qué no y para qué antes de que el cliente entre al
// formulario (§10). Va aquí y no en un tooltip porque tiene que leerse sin gesto
// previo.
//
// En todo el componente no hay un solo `<input>` que reciba un número de tarjeta: el
// formulario es de Stripe y el único gesto nuestro es abrirlo (D-2, AC4).
export function AddCardButton() {
  const mutation = useCreateCardSetup();

  return (
    <div className="flex flex-col gap-3">
      <Button
        className="h-11 w-fit rounded-full px-5"
        onClick={() => mutation.mutate()}
        // Sin esto, un doble clic crearía dos Checkout Sessions y, en el primer alta,
        // dos Customers en Stripe.
        disabled={mutation.isPending}
      >
        {mutation.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Plus className="size-4" aria-hidden />
        )}
        {mutation.isPending ? 'Abriendo Stripe…' : 'Agregar tarjeta'}
      </Button>

      <p className="text-muted-foreground max-w-[62ch] text-sm leading-relaxed">
        {CARD_STORAGE_DISCLOSURE}
      </p>
    </div>
  );
}
