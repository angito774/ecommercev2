'use client';

import { useQuery } from '@tanstack/react-query';

import { ORDER_RECEIPT_STALE_TIME_MS, orderKeys } from '../constants';
import { fetchOrderReceipt } from '../services/order.service';

// `enabled` va atado a la apertura del diálogo: resolver la boleta cuesta una
// llamada de red a Stripe dentro del request, y hacerla por cada fila de la lista
// convertiría el historial en 60 viajes a un tercero (§10).
export function useOrderReceipt(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: orderKeys.receipt(orderId),
    queryFn: () => fetchOrderReceipt(orderId),
    enabled,
    // Sin reintentos automáticos: los 409 y 404 de este endpoint no mejoran
    // repitiendo, y el 502 ya tiene su botón de «Reintentar» explícito (AC12).
    // Reintentar solo retrasaría el mensaje que el cliente necesita leer.
    retry: false,
    staleTime: ORDER_RECEIPT_STALE_TIME_MS,
  });
}
