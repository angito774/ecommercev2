import type { NextRequest } from 'next/server';

import { verifyWebhook } from '@clerk/nextjs/webhooks';
import type { WebhookEvent } from '@clerk/nextjs/webhooks';

import {
  syncUserCreated,
  syncUserDeleted,
  syncUserUpdated,
} from '@/server/services/user-sync.service';

// Deduplicación de reintentos de Svix por el header `svix-id`. Es memoria del
// proceso: cubre el reintento inmediato tras un timeout, no una segunda instancia
// serverless. No hace falta más porque las tres sincronizaciones son idempotentes
// por sí mismas (upsert por `clerk_id`, `onConflictDoNothing` en `user_roles` y un
// UPDATE que solo toca la fila si el estado cambia).
const PROCESSED_EVENT_LIMIT = 500;
const processedEventIds = new Set<string>();

function wasProcessed(eventId: string): boolean {
  return processedEventIds.has(eventId);
}

function markProcessed(eventId: string): void {
  processedEventIds.add(eventId);

  if (processedEventIds.size > PROCESSED_EVENT_LIMIT) {
    // Los Set de JS preservan el orden de inserción: el primero es el más viejo.
    const oldest = processedEventIds.values().next().value;
    if (oldest) processedEventIds.delete(oldest);
  }
}

async function dispatch(event: WebhookEvent): Promise<void> {
  switch (event.type) {
    case 'user.created':
      await syncUserCreated(event.data);
      return;
    case 'user.updated':
      await syncUserUpdated(event.data);
      return;
    case 'user.deleted':
      await syncUserDeleted(event.data);
      return;
    default:
      // El resto de eventos se acepta sin hacer nada para que Svix no reintente.
      return;
  }
}

// `NextRequest` y no `Request`: es lo que exige la firma `RequestLike` de
// `verifyWebhook` en @clerk/nextjs.
export async function POST(request: NextRequest) {
  let event: WebhookEvent;

  // `verifyWebhook` lee `CLERK_WEBHOOK_SIGNING_SECRET` por su cuenta y lanza ante
  // firma inválida, cuerpo alterado o cabeceras `svix-*` ausentes. Es la única
  // autenticación de esta ruta: es pública para Clerk, no para cualquiera.
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    console.error('POST /api/webhooks/clerk: verificación de firma fallida', error);
    return new Response('Firma inválida', { status: 400 });
  }

  const eventId = request.headers.get('svix-id');
  if (eventId && wasProcessed(eventId)) {
    return new Response('OK', { status: 200 });
  }

  try {
    await dispatch(event);
  } catch (error) {
    console.error(`POST /api/webhooks/clerk: fallo al procesar ${event.type}`, error);
    // 500 para que Svix reintente: la transacción ya revirtió entera.
    return new Response('Error al sincronizar el evento', { status: 500 });
  }

  // Se marca solo tras el éxito: si el manejo falla, el reintento debe entrar.
  if (eventId) markProcessed(eventId);

  return new Response('OK', { status: 200 });
}
