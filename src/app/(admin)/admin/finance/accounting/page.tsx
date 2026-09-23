import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth';
import { AccountingTabs } from '@/modules/finance/components/accounting-tabs';
import {
  ACCOUNTING_NOT_PLE_NOTE,
  ACCOUNTING_VS_DECLARABLE_NOTE,
} from '@/modules/finance/constants';

export const metadata: Metadata = {
  title: 'Contabilidad',
  description:
    'Registro de Ventas y Registro de Compras del rango elegido, con exportación a CSV.',
};

export default async function AdminFinanceAccountingPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí mismo
  // (CLAUDE.md regla 8). Sin el permiso, `forbidden()` corta el render y devuelve el 403 de
  // `src/app/forbidden.tsx` (AC3).
  await requirePagePermission('finance.read');

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Contabilidad</h1>
        {/* El encabezado dice qué es y qué no es esta pantalla. Es el riesgo principal del
            sub-proyecto y es de interpretación, no de código (§10). */}
        <p className="text-muted-foreground max-w-prose text-sm">
          Cada comprobante emitido y cada compra con comprobante del rango, documento a
          documento, para <strong>revisar y cotejar</strong>. Las fechas de emisión se
          resuelven en la hora de Lima.
        </p>
        {/* Permanentes y no condicionales, con el criterio que 026 fijó en su D-13: un
            aviso que aparece y desaparece enseña a ignorarlo. */}
        <p className="text-muted-foreground max-w-prose text-sm">{ACCOUNTING_NOT_PLE_NOTE}</p>
        <p className="text-muted-foreground max-w-prose text-sm">
          {ACCOUNTING_VS_DECLARABLE_NOTE}
        </p>
      </header>

      <AccountingTabs />
    </div>
  );
}
