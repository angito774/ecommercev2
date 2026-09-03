'use client';

import { PackageOpen, RefreshCw, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { CatalogCategory } from '@/modules/categories/types/catalog-category.types';
import { CATALOG_PAGE_SIZE } from '@/modules/products/constants';
import { useCatalogProducts } from '@/modules/products/hooks/use-catalog-products';
import type { CatalogProductListResponse } from '@/modules/products/types/catalog.types';

import { useUiStore } from '../store/ui.store';
import { ProductCard } from './product-card';
import { Eyebrow } from './section-heading';

type CatalogSectionProps = {
  categories: CatalogCategory[];
  // Exactamente lo que el servidor ya leyó para el filtro inicial. Va al hook como
  // `initialData` para que hidratar no dispare una segunda petición idéntica (AC8).
  initialData: CatalogProductListResponse;
};

export function CatalogSection({ categories, initialData }: CatalogSectionProps) {
  const category = useUiStore((state) => state.categoryFilter);
  const setCategoryFilter = useUiStore((state) => state.setCategoryFilter);

  const params = { category, sort: 'featured', page: 1, pageSize: CATALOG_PAGE_SIZE } as const;

  const query = useCatalogProducts(params, {
    // Solo el filtro inicial tiene datos del servidor. Pasárselos a cualquier otro
    // sería sembrar la caché con la respuesta de otra consulta.
    initialData: category === 'all' ? initialData : undefined,
  });

  const products = query.data?.data ?? [];

  return (
    <section id="catalogo" className="scroll-mt-24 py-[clamp(3.75rem,8.5vw,7.25rem)]">
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)]">
        <div className="mb-[clamp(2rem,4vw,3.25rem)]">
          <Eyebrow>Catálogo</Eyebrow>
          <h2 className="text-[clamp(1.875rem,4.3vw,3.125rem)] font-semibold">
            Lo mejor de cada categoría
          </h2>
        </div>

        {/* Fila de filtros: scroll horizontal con scroll-snap en móvil, sin envolver
            a varias líneas. `role="tablist"` no encaja porque no hay paneles
            hermanos; son botones que refiltran una misma rejilla. */}
        <div
          className="-mx-[clamp(1rem,4vw,2rem)] mb-7 flex snap-x snap-mandatory gap-2 overflow-x-auto px-[clamp(1rem,4vw,2rem)] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Filtrar por categoría"
        >
          <FilterChip
            active={category === 'all'}
            onClick={() => setCategoryFilter('all')}
            label="Todo"
          />
          {categories.map((item) => (
            <FilterChip
              key={item.id}
              active={category === item.slug}
              onClick={() => setCategoryFilter(item.slug)}
              label={item.name}
            />
          ))}
        </div>

        <CatalogBody
          isPending={query.isPending}
          isError={query.isError}
          error={query.error}
          onRetry={() => void query.refetch()}
          products={products}
          isFetching={query.isFetching}
        />
      </div>
    </section>
  );
}

function CatalogBody({
  isPending,
  isError,
  error,
  onRetry,
  products,
  isFetching,
}: {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  onRetry: () => void;
  products: CatalogProductListResponse['data'];
  isFetching: boolean;
}) {
  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 xl:gap-5">
        {Array.from({ length: CATALOG_PAGE_SIZE }, (_, index) => (
          <Skeleton key={index} className="h-[340px] rounded-[22px]" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-border bg-card flex flex-col items-center gap-3 rounded-[22px] border p-14 text-center">
        <TriangleAlert className="text-destructive size-8" aria-hidden />
        <h3 className="text-lg font-semibold">No se pudo cargar el catálogo</h3>
        {/* El mensaje real del servidor, no uno genérico: el interceptor de axios ya
            lo dejó legible y ocultarlo solo dificulta el diagnóstico. */}
        <p className="text-muted-foreground max-w-prose text-sm">
          {error?.message ?? 'Inténtalo de nuevo en unos segundos.'}
        </p>
        <Button onClick={onRetry} variant="outline" className="mt-2 h-11 rounded-full px-5">
          <RefreshCw className="size-4" aria-hidden />
          Reintentar
        </Button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="border-border bg-card flex flex-col items-center gap-3 rounded-[22px] border p-14 text-center">
        <PackageOpen className="text-nx-faint size-8" aria-hidden />
        <h3 className="text-lg font-semibold">No hay productos en esta categoría</h3>
        <p className="text-muted-foreground text-sm">Prueba con otro filtro del catálogo.</p>
      </div>
    );
  }

  return (
    // `placeholderData` mantiene la rejilla anterior mientras llega la nueva, así
    // que la altura no colapsa; la opacidad es la única señal de que está cargando
    // y no hay salto de layout (AC7).
    <div
      aria-busy={isFetching}
      className={`grid grid-cols-2 gap-3 transition-opacity lg:grid-cols-3 xl:grid-cols-4 xl:gap-5 ${
        isFetching ? 'opacity-60' : 'opacity-100'
      }`}
    >
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} priority={index < 4} />
      ))}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // 44 px de alto: objetivo táctil mínimo de AC17.
      className={`h-11 shrink-0 snap-start rounded-full border px-4 text-[13.5px] font-medium transition-colors ${
        active
          ? 'bg-foreground text-background border-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-nx-line hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}
