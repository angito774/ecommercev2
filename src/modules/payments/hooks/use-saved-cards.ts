'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import {
  CARD_SETUP_FRESHNESS_MS,
  CARD_SETUP_MAX_POLLS,
  CARD_SETUP_POLL_INTERVAL_MS,
  paymentMethodKeys,
  SAVED_CARDS_STALE_TIME_MS,
} from '../constants';
import { fetchSavedCards } from '../services/payment-method.service';
import type { SavedCard } from '../types/payment-method.types';

type UseSavedCardsOptions = {
  /** Cierto solo al volver de Stripe con `?card=added`. Abre la ventana de D-16. */
  poll?: boolean;
};

// La señal de que el webhook ya escribió la fila del alta recién completada. Se mira
// la antigüedad y no el número de tarjetas porque la lista puede venir de una caché
// previa y no hay con qué compararla.
function hasFreshCard(cards: SavedCard[] | undefined): boolean {
  if (!cards) return false;

  const threshold = Date.now() - CARD_SETUP_FRESHNESS_MS;
  return cards.some((card) => new Date(card.createdAt).getTime() >= threshold);
}

// El webhook es eventualmente consistente: entre que el cliente vuelve de Stripe y la
// fila existe pasan segundos. Un `refetch` único al montar le enseñaría su lista sin
// la tarjeta que acaba de guardar, y un polling indefinido dejaría la sección girando
// para siempre. La ventana es acotada y tiene estado terminal explícito (D-16, AC13).
export function useSavedCards({ poll = false }: UseSavedCardsOptions = {}) {
  // En estado y no en un ref: agotar la ventana es información que la UI pinta, así
  // que tiene que provocar un render.
  const [attempts, setAttempts] = useState(0);
  // El query param sobrevive a cualquier acción posterior del cliente, así que por sí
  // solo no distingue «el webhook todavía no ha llegado» de «la lista está vacía
  // porque el cliente acaba de eliminar la tarjeta». Esto cierra la ventana a mano
  // cuando ya no tiene sentido esperar nada.
  const [closed, setClosed] = useState(false);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: paymentMethodKeys.list(),
    queryFn: fetchSavedCards,
    staleTime: SAVED_CARDS_STALE_TIME_MS,
  });

  const open = poll && !closed;
  const arrived = hasFreshCard(query.data?.data);
  const spent = attempts >= CARD_SETUP_MAX_POLLS;
  const waiting = open && !arrived && !spent;

  useEffect(() => {
    if (!waiting) return;

    const timer = setTimeout(() => {
      setAttempts((count) => count + 1);
      // `queryClient` en vez de `query.refetch`: su identidad es estable entre
      // renders, así que el temporizador no se reinicia en cada uno.
      void queryClient.invalidateQueries({ queryKey: paymentMethodKeys.list() });
    }, CARD_SETUP_POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [waiting, attempts, queryClient]);

  return {
    query,
    /** La tarjeta recién guardada todavía no aparece y quedan intentos. */
    waiting,
    /** Se agotaron los intentos sin verla: hace falta un aviso accionable (AC13). */
    exhausted: open && spent && !arrived,
    /** Cierra la ventana de espera de forma definitiva para este montaje. */
    stopWaiting: useCallback(() => setClosed(true), []),
  };
}
