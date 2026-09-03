import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth';
import { ProductsTable } from '@/modules/products/components/products-table';

export const metadata: Metadata = {
  title: 'Productos',
  description: 'Gestiona el catálogo de productos de la tienda.',
};

export default async function AdminProductsPage() {
  // El redirect del layout no exime a la página: cada recurso se verifica a sí
  // mismo (CLAUDE.md regla 8).
  await requirePagePermission('products.read');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
        <p className="text-muted-foreground text-sm">
          Crea productos, ajusta precios y stock, y decide cuáles se muestran en la tienda.
        </p>
      </header>

      <ProductsTable />
    </div>
  );
}
