import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth';
import { FinanceTaxesOverview } from '@/modules/finance/components/finance-taxes-overview';
import {
  IGV_CREDIT_BALANCE_NOTE,
  RER_ESTIMATE_NOTE,
} from '@/modules/finance/constants';

export const metadata: Metadata = {
  title: 'Impuestos',
  description: 'IGV por pagar y Renta RER estimada para el rango elegido.',
};

export default async function AdminFinanceTaxesPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí mismo
  // (CLAUDE.md regla 8). Sin el permiso, `forbidden()` corta el render y devuelve el 403
  // de `src/app/forbidden.tsx` (AC3).
  await requirePagePermission('finance.read');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Impuestos</h1>
        {/* El encabezado dice qué es y qué no es esta pantalla: es el riesgo principal
            del módulo y es de interpretación, no de código (§10). Los dos lados del IGV
            no tienen la misma calidad de dato y se presentan juntos. */}
        <p className="text-muted-foreground max-w-prose text-sm">
          Este panel <strong>calcula, no declara</strong>. El IGV de ventas sale del
          desglose exacto que se envió a SUNAT en cada comprobante; el de compras es una
          aproximación sobre el importe que alguien tecleó al registrar el gasto, y solo de
          los comprobantes con derecho a crédito fiscal. Las fechas se resuelven en la hora
          de Lima.
        </p>
        {/* Permanente y no condicional (D-13, AC20): el saldo a favor que no se arrastra
            es el malentendido más probable de toda la pantalla. */}
        <p className="text-muted-foreground max-w-prose text-sm">{IGV_CREDIT_BALANCE_NOTE}</p>
        {/* También permanente (D-13, AC19): un aviso que aparece y desaparece enseña a
            ignorarlo, y un rango elegido a mano no es un período declarable aunque las
            fechas cuadren con un mes. */}
        <p className="text-muted-foreground max-w-prose text-sm">{RER_ESTIMATE_NOTE}</p>
      </header>

      <FinanceTaxesOverview />
    </div>
  );
}
