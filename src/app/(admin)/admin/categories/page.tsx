import type { Metadata } from 'next';

import { requirePermission } from '@/lib/auth';
import { CategoriesTable } from '@/modules/categories/components/categories-table';

export const metadata: Metadata = {
  title: 'Categorías',
  description: 'Administra la taxonomía del catálogo.',
};

export default async function AdminCategoriesPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí
  // mismo (CLAUDE.md regla 8). Un `manager` sin este permiso no monta la tabla.
  await requirePermission('categories.read');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
        <p className="text-muted-foreground text-sm">
          Crea, edita y desactiva las categorías del catálogo.
        </p>
      </header>

      <CategoriesTable />
    </div>
  );
}
