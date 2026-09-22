import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth';
import { PricingTable } from '@/modules/finance/components/pricing-table';
import { NO_COST_HINT } from '@/modules/finance/constants';

export const metadata: Metadata = {
  title: 'Precio unitario',
  description: 'Costo promedio ponderado y margen por producto.',
};

export default async function AdminPricingPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí mismo
  // (CLAUDE.md regla 8). Sin el permiso, `forbidden()` corta el render y devuelve el 403
  // de `src/app/forbidden.tsx` (AC3).
  await requirePagePermission('finance.read');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Precio unitario</h1>
        {/* El encabezado dice qué es y qué no es este número: es el riesgo principal del
            módulo y es de interpretación, no de código (§10). */}
        <p className="text-muted-foreground max-w-prose text-sm">
          Costo <strong>promedio ponderado</strong> de las compras registradas, no el costo
          del lote que se vendió. El margen que muestra es el{' '}
          <strong>margen potencial de la próxima venta</strong>: todavía no descuenta el
          costo de la mercadería vendida ni entra en el resultado de Finanzas. El costo se
          mueve solo con notas de ingreso por compra y con el costo inicial, que se carga
          una única vez por producto. {NO_COST_HINT}
        </p>
      </header>

      <PricingTable />
    </div>
  );
}
