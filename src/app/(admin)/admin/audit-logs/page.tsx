import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth';
import { AuditLogsTable } from '@/modules/audit/components/audit-logs-table';

export const metadata: Metadata = {
  title: 'Bitácora',
  description: 'Quién cambió qué y cuándo dentro del panel.',
};

export default async function AdminAuditLogsPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí
  // mismo (CLAUDE.md regla 8).
  await requirePagePermission('audit_logs.read');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bitácora</h1>
        <p className="text-muted-foreground text-sm">
          Registro de quién cambió qué y cuándo. Las entradas no se editan ni se borran.
        </p>
      </header>

      <AuditLogsTable />
    </div>
  );
}
