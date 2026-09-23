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
    'Ventas confirmadas y declarables, gastos operativos y la utilidad bruta, operativa y neta del período.',
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
        {/* El encabezado dice qué mide cada nivel: es el riesgo principal del módulo y es
            de interpretación, no de código (§10). Ya no puede decir que la cifra «no es
            utilidad contable» por no descontar costo, nómina ni impuestos, porque desde el
            spec 027 los descuenta (AC25). */}
        <p className="text-muted-foreground max-w-prose text-sm">
          El resultado del período se lee en tres niveles, para el rango de fechas que
          elijas. La <strong>utilidad bruta</strong> resta al ingreso el costo de la
          mercadería vendida; la <strong>operativa</strong> resta además los gastos
          operativos netos y la nómina; y la <strong>neta</strong>, la Renta RER estimada.
          Las fechas se resuelven en la hora de Lima.
        </p>
        {/* De qué cifra de ventas cuelga la utilidad: la pantalla publica dos y solo una
            entra en la cascada (AC8). */}
        <p className="text-muted-foreground max-w-prose text-sm">
          La utilidad cuelga de las <strong>ventas declarables</strong> sin IGV —el mismo
          número que la base de Renta de Impuestos—, mientras que la card de ventas
          confirmadas sigue siendo la caja: lo cobrado por Stripe. El{' '}
          <strong>IGV no resta</strong> de ninguno de los tres niveles, porque la empresa
          lo recauda del comprador y lo traslada a SUNAT; solo la Renta reduce la utilidad
          neta, y no se descuenta ningún otro tributo.
        </p>
        {/* El costo es un promedio ponderado congelado, no el del lote que salió del
            almacén, y ahora esa aproximación llega hasta la utilidad (§11). */}
        <p className="text-muted-foreground max-w-prose text-sm">
          El costo de lo vendido usa el <strong>costo promedio congelado</strong> en cada
          línea al confirmarse la venta, no el del lote concreto que salió del almacén ni
          el promedio de hoy. Las líneas sin costo registrado no se cuentan como cero: el
          bloque avisa de cuántas faltan y la utilidad bruta queda sobreestimada mientras
          tanto.
        </p>
        {/* Hay dos cifras de ventas y hay que decir en qué se diferencian: el primer
            instinto ante dos números distintos es pensar que uno está mal, y aquí los
            dos son correctos (§10). */}
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
