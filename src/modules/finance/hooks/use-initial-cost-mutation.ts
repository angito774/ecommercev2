'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { pricingKeys } from '../constants';
import type { SetInitialCostInput } from '../schemas/pricing.schema';
import { setInitialCost } from '../services/pricing.service';

// Invalida **solo** el listado de precio unitario: el costo no entra todavía en el
// resultado del resumen financiero (spec 021 §3, fuera de alcance), así que refrescar
// `financeKeys` daría a entender que aquella cifra cambió.
export function useSetInitialCost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetInitialCostInput }) =>
      setInitialCost(id, input),
    onSuccess: async (product) => {
      // La fila se actualiza sin recargar la página (AC26).
      await queryClient.invalidateQueries({ queryKey: pricingKeys.lists() });
      toast.success(`Costo inicial de "${product.name}" registrado`);
    },
  });
}
