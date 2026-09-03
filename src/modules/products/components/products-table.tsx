'use client';

import {
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { PackagePlus, Search } from 'lucide-react';
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

import { DEFAULT_PAGE_SIZE, PRODUCT_STATUS_OPTIONS, SEARCH_DEBOUNCE_MS } from '../constants';
import { useProducts } from '../hooks/use-products';
import type { ProductQueryParams } from '../schemas/product.schema';
import type { ProductWithCategory } from '../types/product.types';

import { DeleteProductDialog } from './delete-product-dialog';
import { getProductColumns } from './product-columns';
import { ProductFormDialog } from './product-form-dialog';

type ProductStatus = ProductQueryParams['status'];
type ProductSortBy = ProductQueryParams['sortBy'];

const SORTABLE_COLUMNS: readonly ProductSortBy[] = ['name', 'priceCents', 'stock', 'createdAt'];
const DEFAULT_SORTING: SortingState = [{ id: 'createdAt', desc: true }];
const NO_ROWS: ProductWithCategory[] = [];
const ALL_CATEGORIES = 'all';

function isSortableColumn(id: string): id is ProductSortBy {
  return (SORTABLE_COLUMNS as readonly string[]).includes(id);
}

export function ProductsTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProductStatus>('all');
  const [categoryId, setCategoryId] = useState<string>(ALL_CATEGORIES);
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithCategory | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<ProductWithCategory | null>(null);

  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);

  // Sin este reinicio, filtrar desde la página 3 devuelve un listado vacío que
  // parece un fallo.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, categoryId]);

  const [activeSort] = sorting;
  const sortBy = activeSort && isSortableColumn(activeSort.id) ? activeSort.id : 'createdAt';
  const sortDir = activeSort?.desc === false ? 'asc' : 'desc';

  const params: ProductQueryParams = useMemo(
    () => ({
      q: debouncedSearch.trim() === '' ? undefined : debouncedSearch.trim(),
      status,
      categoryId,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      sortBy,
      sortDir,
    }),
    [debouncedSearch, status, categoryId, page, sortBy, sortDir],
  );

  const query = useProducts(params);

  // Mismo endpoint y mismos parámetros que el selector del formulario: TanStack
  // Query comparte la entrada de caché y no se piden dos veces.
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

  const hasFilters = params.q !== undefined || status !== 'all' || categoryId !== ALL_CATEGORIES;
  const statusLabel = PRODUCT_STATUS_OPTIONS.find((option) => option.value === status)?.label;
  const categoryLabel = categoryOptions.find((option) => option.value === categoryId)?.label;

  // Permisos resueltos por el servidor. Mientras carga no se ofrece ninguna
  // acción: es preferible a pintar un botón que luego desaparece.
  const canCreate = query.data?.meta.canCreate ?? false;
  const canUpdate = query.data?.meta.canUpdate ?? false;
  const canDelete = query.data?.meta.canDelete ?? false;

  function clearFilters() {
    setSearch('');
    setStatus('all');
    setCategoryId(ALL_CATEGORIES);
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  const columns = useMemo(
    () =>
      getProductColumns({
        canUpdate,
        canDelete,
        onEdit: (product) => {
          setEditing(product);
          setFormOpen(true);
        },
        onDeactivate: (product) => {
          setDeactivating(product);
          setDeleteOpen(true);
        },
      }),
    [canUpdate, canDelete],
  );

  const pagination: PaginationState = { pageIndex: page - 1, pageSize: DEFAULT_PAGE_SIZE };

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    setPage(next.pageIndex + 1);
  };

  const table = useReactTable({
    data: query.data?.data ?? NO_ROWS,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    rowCount: query.data?.meta.total ?? 0,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange,
  });

  const emptyState = hasFilters ? (
    <>
      <p className="text-sm font-medium">Sin resultados</p>
      <p className="text-muted-foreground text-sm">
        Ningún producto coincide con la búsqueda o los filtros aplicados.
      </p>
      <Button variant="outline" size="sm" onClick={clearFilters}>
        Limpiar filtros
      </Button>
    </>
  ) : (
    <>
      <p className="text-sm font-medium">Todavía no hay productos</p>
      <p className="text-muted-foreground text-sm">
        Crea el primero para empezar a llenar el catálogo.
      </p>
      {canCreate ? (
        <Button size="sm" onClick={openCreate}>
          <PackagePlus className="size-4" aria-hidden />
          Crear producto
        </Button>
      ) : null}
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
            aria-label="Buscar productos por nombre o SKU"
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

        <Select value={status} onValueChange={(value) => setStatus(value as ProductStatus)}>
          <SelectTrigger className="sm:w-36" aria-label="Filtrar por estado">
            <SelectValue>{statusLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PRODUCT_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canCreate ? (
          <Button className="sm:ml-auto" onClick={openCreate}>
            <PackagePlus className="size-4" aria-hidden />
            Crear producto
          </Button>
        ) : null}
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
      <DeleteProductDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        product={deactivating}
      />
    </div>
  );
}
