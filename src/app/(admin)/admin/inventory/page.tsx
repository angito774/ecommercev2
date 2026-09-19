import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth';
import { InventoryTabs } from '@/modules/inventory/components/inventory-tabs';
import { LOW_STOCK_THRESHOLD } from '@/modules/products/constants';

export const metadata: Metadata = {
  title: 'Inventario',
  description:
    'Alertas de stock y notas de ingreso y de salida que explican cada movimiento.',
};

export default async function AdminInventoryPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí mismo
  // (CLAUDE.md regla 8). Sin el permiso, `forbidden()` corta el render y devuelve el 403
  // de `src/app/forbidden.tsx`. El permiso de lectura no cambia con este spec: registrar
  // una nota exige además `inventory.move`, y eso lo comprueba el POST.
  await requirePagePermission('inventory.read');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
        <p className="text-muted-foreground text-sm">
          <strong className="font-medium">Alertas de stock</strong> lista los productos
          activos con menos de {LOW_STOCK_THRESHOLD} unidades, ordenados por urgencia.{' '}
          <strong className="font-medium">Movimientos</strong> registra y consulta las notas
          de ingreso y de salida que explican por qué cambió cada stock.
        </p>
      </header>

      <InventoryTabs />
    </div>
  );
}
