import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth';
import { InventoryTable } from '@/modules/inventory/components/inventory-table';
import { LOW_STOCK_THRESHOLD } from '@/modules/products/constants';

export const metadata: Metadata = {
  title: 'Inventario',
  description: 'Productos agotados o por debajo del umbral de alerta de stock.',
};

export default async function AdminInventoryPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí
  // mismo (CLAUDE.md regla 8). Sin el permiso, `forbidden()` corta el render y
  // devuelve el 403 de `src/app/forbidden.tsx` (AC3).
  await requirePagePermission('inventory.read');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
        <p className="text-muted-foreground text-sm">
          Productos activos con menos de {LOW_STOCK_THRESHOLD} unidades, ordenados por
          urgencia. El stock se corrige desde la ficha del producto.
        </p>
      </header>

      <InventoryTable />
    </div>
  );
}
