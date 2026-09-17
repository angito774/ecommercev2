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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import { useCategories } from '@/modules/categories/hooks/use-categories';
// Se reutiliza el formulario de producto en vez de escribir uno de un solo campo:
// ya valida stock, ya gestiona los dos 409 de SKU/slug y ya invalida el caché.
// Duplicarlo sería una segunda definición del mismo formulario (D-11).
import { ProductFormDialog } from '@/modules/products/components/product-form-dialog';

import {
  EMPTY_INVENTORY_MESSAGE,
  EMPTY_INVENTORY_TITLE,
  INVENTORY_PAGE_SIZE,
  INVENTORY_SEARCH_DEBOUNCE_MS,
  NO_RESULTS_MESSAGE,
  NO_RESULTS_TITLE,
} from '../constants';
import { useInventory } from '../hooks/use-inventory';
import type { InventoryQueryParams } from '../schemas/inventory.schema';
import type { InventoryRow } from '../types/inventory.types';

import { getInventoryColumns } from './inventory-columns';

const NO_ROWS: InventoryRow[] = [];
const ALL_CATEGORIES = 'all';

export function InventoryTable() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>(ALL_CATEGORIES);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryRow | null>(null);

  const debouncedSearch = useDebounce(search, INVENTORY_SEARCH_DEBOUNCE_MS);

  // Sin este reinicio, filtrar desde la página 3 devuelve un listado vacío que
  // parece un fallo.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryId]);

  const params: InventoryQueryParams = useMemo(
    () => ({
      search: debouncedSearch.trim() === '' ? undefined : debouncedSearch.trim(),
      categoryId,
      page,
      pageSize: INVENTORY_PAGE_SIZE,
    }),
    [debouncedSearch, categoryId, page],
  );

  const query = useInventory(params);

  // Mismos parámetros que el selector de `products-table.tsx`: TanStack Query
  // comparte la entrada de caché y las categorías no se piden dos veces.
  const categoriesQuery = useCategories({
    status: 'active',
    page: 1,
    pageSize: 100,
    sortBy: 'name',
    sortDir: 'asc',
  });

  const categoryOptions = [
    { value: ALL_CATEGORIES, label: 'Todas las categorías' },
    ...(categoriesQuery.data?.data ?? []).map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  const hasFilters = params.search !== undefined || categoryId !== ALL_CATEGORIES;
  const categoryLabel = categoryOptions.find((option) => option.value === categoryId)?.label;

  // Permiso resuelto por el servidor. Mientras carga no se ofrece ninguna acción:
  // es preferible a pintar un botón que luego desaparece.
  const canUpdateProduct = query.data?.meta.canUpdateProduct ?? false;

  function clearFilters() {
    setSearch('');
    setCategoryId(ALL_CATEGORIES);
  }

  const columns = useMemo(
    () =>
      getInventoryColumns({
        canUpdateProduct,
        onEdit: (product) => {
          setEditing(product);
          setFormOpen(true);
        },
      }),
    [canUpdateProduct],
  );

  const pagination: PaginationState = { pageIndex: page - 1, pageSize: INVENTORY_PAGE_SIZE };

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

  // Cero filas sin filtros es la buena noticia, no un hueco en blanco; con filtros
  // es que la búsqueda no casó y hay algo que limpiar (AC12).
  const emptyState = hasFilters ? (
    <>
      <p className="text-sm font-medium">{NO_RESULTS_TITLE}</p>
      <p className="text-muted-foreground text-sm">{NO_RESULTS_MESSAGE}</p>
      <Button variant="outline" size="sm" onClick={clearFilters}>
        Limpiar filtros
      </Button>
    </>
  ) : (
    <>
      <p className="text-sm font-medium">{EMPTY_INVENTORY_TITLE}</p>
      <p className="text-muted-foreground text-sm">{EMPTY_INVENTORY_MESSAGE}</p>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o SKU…"
            aria-label="Buscar en el inventario por nombre o SKU"
            className="pl-9"
          />
        </div>

        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="sm:w-52" aria-label="Filtrar por categoría">
            {/* Texto explícito: SelectValue depende de que el item esté montado y el
                contenido solo se monta al abrir el desplegable. */}
            <SelectValue>{categoryLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        table={table}
        isLoading={query.isPending}
        isError={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
        empty={emptyState}
      />

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editing} />
    </div>
  );
}
