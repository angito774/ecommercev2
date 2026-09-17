import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth';
import { PayrollTabs } from '@/modules/payroll/components/payroll-tabs';

export const metadata: Metadata = {
  title: 'Nómina',
  description: 'Personal contratado y bitácora de pagos de sueldo.',
};

export default async function AdminPayrollPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí mismo
  // (CLAUDE.md regla 8). Sin el permiso, `forbidden()` corta el render y devuelve el 403
  // de `src/app/forbidden.tsx` (AC4).
  await requirePagePermission('payroll.read');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Nómina</h1>
        {/* El encabezado separa este módulo de «Usuarios», que es lo que más se va a
            confundir: una cosa es quién trabaja aquí y otra quién entra al panel (§1). */}
        <p className="text-muted-foreground max-w-prose text-sm">
          Quién trabaja aquí, en qué puesto, desde cuándo y cuánto cobra, más el registro de
          los sueldos ya pagados. <strong>No es el listado de accesos</strong>: dar de alta a
          alguien aquí no le crea cuenta ni le concede nada en el panel, que se gestiona desde
          Usuarios. Tampoco calcula la planilla: no hay deducciones, aportes ni impuestos.
        </p>
      </header>

      <PayrollTabs />
    </div>
  );
}
