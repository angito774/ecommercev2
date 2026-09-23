import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth';
import { FinanceOverview } from '@/modules/finance/components/finance-overview';
import {
  DECLARABLE_SALES_INFORMATIVE_NOTE,
  PURCHASE_IGV_INFORMATIVE_NOTE,
} from '@/modules/finance/constants';

export const metadata: Metadata = {
  title: 'Finanzas',
  description:
    'Ventas confirmadas y declarables, gastos operativos y resultado del período.',
};

export default async function AdminFinancePage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí mismo
  // (CLAUDE.md regla 8). Sin el permiso, `forbidden()` corta el render y devuelve el
  // 403 de `src/app/forbidden.tsx` (AC3).
  await requirePagePermission('finance.read');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
        {/* El encabezado dice qué es y qué no es este número: es el riesgo principal
            del módulo y es de interpretación, no de código (§10). */}
        <p className="text-muted-foreground max-w-prose text-sm">
          Ventas confirmadas menos los gastos operativos registrados a mano, para el rango
          de fechas que elijas. <strong>No es utilidad contable</strong>: no descuenta el
          costo de la mercadería vendida, la nómina, las comisiones de pago ni los
          impuestos. Las fechas se resuelven en la hora de Lima.
        </p>
        {/* Hay dos cifras de ventas y hay que decir en qué se diferencian: el primer
            instinto ante dos números distintos es pensar que uno está mal, y aquí los
            dos son correctos (§10). El resultado del período resta sobre las
            confirmadas, no sobre las declarables (D-10). */}
        <p className="text-muted-foreground max-w-prose text-sm">
          {DECLARABLE_SALES_INFORMATIVE_NOTE}
        </p>
        {/* El IGV de compras se publica al lado del resultado, y hay que decir que no
            entra en él: es el dato del crédito fiscal, no un gasto más (spec 024, §3). */}
        <p className="text-muted-foreground max-w-prose text-sm">
          {PURCHASE_IGV_INFORMATIVE_NOTE}
        </p>
      </header>

      <FinanceOverview />
    </div>
  );
}
