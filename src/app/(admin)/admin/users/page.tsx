import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth';
import { UsersTable } from '@/modules/users/components/users-table';

export const metadata: Metadata = {
  title: 'Usuarios',
  description: 'Invita personas y decide qué puede hacer cada una.',
};

export default async function AdminUsersPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí
  // mismo (CLAUDE.md regla 8).
  await requirePagePermission('users.read');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-muted-foreground text-sm">
          Invita personas por correo, cambia sus roles y quita o devuelve el acceso al panel.
        </p>
      </header>

      <UsersTable />
    </div>
  );
}
