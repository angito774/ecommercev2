import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireAuth } from '@/lib/auth';
import { ClearCartOnSuccess } from '@/modules/orders/components/clear-cart-on-success';
import { OrderConfirmation } from '@/modules/orders/components/order-confirmation';
import { OrderStatusPoller } from '@/modules/orders/components/order-status-poller';
import * as orderRepository from '@/server/repositories/order.repository';

type Props = PageProps<'/checkout/success'>;

export const metadata: Metadata = {
  title: 'Pedido confirmado',
  description: 'El detalle de tu compra.',
  robots: { index: false },
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  // Dos capas distintas y ninguna redundante: `auth.protect()` da el 307 al login
  // cuando no hay sesión, y `requireAuth()` resuelve la fila espejo cuyo `id` filtra
  // la consulta (docs/SETUP.md §6).
  await auth.protect();
  const user = await requireAuth();

  const { session_id: sessionId } = await searchParams;

  // Un `session_id` ausente, repetido en la query o que no es texto no identifica
  // ningún pedido: mismo final que uno inexistente.
  if (typeof sessionId !== 'string' || sessionId.length === 0) notFound();

  // Se lee del repositorio, no de `stripe.checkout.sessions.retrieve()`: evita una
  // segunda dependencia de red en el render y respeta el flujo del repo (D-16). El
  // filtro por `user_id` es lo que impide leer el pedido ajeno con un `session_id`
  // robado — AC11.
  const order = await orderRepository.findBySessionIdForUser(sessionId, user.id);
  if (!order) notFound();

  return (
    <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)] py-[clamp(2.5rem,6vw,4.5rem)]">
      {/* Solo con el cobro confirmado. Con un método de pago diferido (D-3 los deja
          activos) el cliente puede volver con la orden aún `pending` y acabar
          fallando: vaciarle el carrito ahí lo dejaría sin carrito y sin pedido. */}
      {order.status === 'paid' && <ClearCartOnSuccess />}

      {/* Solo mientras falte la confirmación del webhook: en cuanto el refresh trae
          `paid`, este componente deja de montarse y el intervalo se limpia. */}
      {order.status === 'pending' && <OrderStatusPoller />}

      <OrderConfirmation order={order} />
    </div>
  );
}
