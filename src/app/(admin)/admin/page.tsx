import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth';
import { DashboardOverview } from '@/modules/dashboard/components/dashboard-overview';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Ventas, pedidos, ticket promedio, top de productos y stock bajo del panel.',
};

export default async function AdminDashboardPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí
  // mismo (CLAUDE.md regla 8, AC3).
  await requirePagePermission('dashboard.read');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Cómo va el negocio en el período que elijas. Solo cuenta lo cobrado: los pedidos sin
          pago confirmado no suman.
        </p>
      </header>

      {/* Server Component hasta aquí: el `"use client"` entra en el contenedor, que
          es lo primero que necesita estado e interactividad. */}
      <DashboardOverview />
    </div>
  );
}
