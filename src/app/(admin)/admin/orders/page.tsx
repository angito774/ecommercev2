import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth';
import { AdminOrdersTable } from '@/modules/orders/components/admin-orders-table';

export const metadata: Metadata = {
  title: 'Pedidos',
  description: 'Consulta de pedidos y cancelación de los que siguen pendientes de pago.',
};

export default async function AdminOrdersPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí
  // mismo (CLAUDE.md regla 8, AC3).
  await requirePagePermission('orders.read');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-muted-foreground text-sm">
          Cada compra con su cliente, sus líneas y su estado. Un pedido pendiente de pago se
          puede cancelar; el resto son de solo consulta.
        </p>
      </header>

      <AdminOrdersTable />
    </div>
  );
}
