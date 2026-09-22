'use client';

import {
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type PaginationState,
} from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';

import {
  EMPTY_PRICING_MESSAGE,
  EMPTY_PRICING_TITLE,
  NO_PRICING_RESULTS_MESSAGE,
  NO_PRICING_RESULTS_TITLE,
  PRICING_ERROR_MESSAGE,
  PRICING_PAGE_SIZE,
  PRICING_SEARCH_DEBOUNCE_MS,
} from '../constants';
import { usePricing } from '../hooks/use-pricing';
import type { PricingQueryParams } from '../schemas/pricing.schema';
import type { PricingRow } from '../types/pricing.types';

import { InitialCostDialog } from './initial-cost-dialog';
import { getPricingColumns } from './pricing-columns';

// Fuera del componente: una referencia estable evita que TanStack Table reconstruya el
// modelo de filas en cada render mientras la consulta está pendiente.
const NO_ROWS: PricingRow[] = [];

export function PricingTable() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [costOpen, setCostOpen] = useState(false);
  const [costing, setCosting] = useState<PricingRow | null>(null);

  const debouncedSearch = useDebounce(search, PRICING_SEARCH_DEBOUNCE_MS);

  // Sin este reinicio, buscar desde la página 3 devuelve un listado vacío que parece un
  // fallo.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const params: PricingQueryParams = useMemo(
    () => ({
      search: debouncedSearch.trim() === '' ? undefined : debouncedSearch.trim(),
      page,
      pageSize: PRICING_PAGE_SIZE,
    }),
    [debouncedSearch, page],
  );

  const query = usePricing(params);

  // Permiso resuelto por el servidor. Mientras carga no se ofrece ninguna acción: es
  // preferible a pintar un botón que luego desaparece (AC4).
  const canSetInitialCost = query.data?.meta.canSetInitialCost ?? false;

  const columns = useMemo(
    () =>
      getPricingColumns({
        canSetInitialCost,
        onSetInitialCost: (product) => {
          setCosting(product);
          setCostOpen(true);
        },
      }),
    [canSetInitialCost],
  );

  const pagination: PaginationState = { pageIndex: page - 1, pageSize: PRICING_PAGE_SIZE };

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    setPage(next.pageIndex + 1);
  };

  const table = useReactTable({
    data: query.data?.data ?? NO_ROWS,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualFiltering: true,
    rowCount: query.data?.meta.total ?? 0,
    state: { pagination },
    onPaginationChange,
  });

  const hasSearch = params.search !== undefined;

  // Los dos estados vacíos dicen cosas distintas: sin búsqueda, cero filas es que el
  // catálogo no tiene productos activos; con búsqueda, que el término no casó (AC24).
  const emptyState = hasSearch ? (
    <>
      <p className="text-sm font-medium">{NO_PRICING_RESULTS_TITLE}</p>
      <p className="text-muted-foreground text-sm">{NO_PRICING_RESULTS_MESSAGE}</p>
      <Button variant="outline" size="sm" onClick={() => setSearch('')}>
        Limpiar la búsqueda
      </Button>
    </>
  ) : (
    <>
      <p className="text-sm font-medium">{EMPTY_PRICING_TITLE}</p>
      <p className="text-muted-foreground text-sm">{EMPTY_PRICING_MESSAGE}</p>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="relative sm:max-w-xs">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre o SKU…"
          aria-label="Buscar en el precio unitario por nombre o SKU"
          className="pl-9"
        />
      </div>

      <DataTable
        table={table}
        isLoading={query.isPending}
        isError={query.isError}
        // El mensaje del servidor si lo hay; el copy del módulo como respaldo, para que un
        // fallo de red sin cuerpo no deje la celda en blanco (AC25).
        errorMessage={query.error?.message ?? PRICING_ERROR_MESSAGE}
        onRetry={() => void query.refetch()}
        empty={emptyState}
      />

      <InitialCostDialog
        open={costOpen}
        onOpenChange={(open) => {
          setCostOpen(open);
          // Al cerrar se olvida qué fila se estaba costeando: si no, reabrir mostraría el
          // producto anterior.
          if (!open) setCosting(null);
        }}
        product={costing}
      />
    </div>
  );
}
