import { Info } from 'lucide-react';
import type { Metadata } from 'next';

import { requirePermission } from '@/lib/auth';
import { RoleMatrix } from '@/modules/roles/components/role-matrix';

export const metadata: Metadata = {
  title: 'Roles',
  description: 'Qué puede hacer cada rol dentro del panel.',
};

export default async function AdminRolesPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí
  // mismo (CLAUDE.md regla 8).
  await requirePermission('roles.read');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Roles y permisos</h1>
        <p className="text-muted-foreground text-sm">
          Qué puede hacer cada rol dentro del panel. Para cambiar los roles de una persona ve a
          Usuarios.
        </p>
      </header>

      <div className="bg-muted/30 flex gap-3 rounded-lg border p-4">
        <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="text-muted-foreground text-sm">
          Esta vista es solo de consulta. Los seis roles y sus permisos están fijados en el código
          del proyecto y solo cambian con un despliegue, no desde el panel.
        </p>
      </div>

      <RoleMatrix />
    </div>
  );
}
