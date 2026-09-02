'use client';

import {
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
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

import {
  CATEGORY_STATUS_OPTIONS,
  DEFAULT_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
} from '../constants';
import { useCategories } from '../hooks/use-categories';
import type { CategoryQueryParams } from '../schemas/category.schema';
import type { Category } from '../types/category.types';

import { getCategoryColumns } from './category-columns';
import { CategoryFormDialog } from './category-form-dialog';
import { DeleteCategoryDialog } from './delete-category-dialog';

type CategoryStatus = CategoryQueryParams['status'];
type CategorySortBy = CategoryQueryParams['sortBy'];

const SORTABLE_COLUMNS: readonly CategorySortBy[] = ['name', 'createdAt', 'updatedAt'];
const DEFAULT_SORTING: SortingState = [{ id: 'createdAt', desc: true }];
const NO_ROWS: Category[] = [];

function isSortableColumn(id: string): id is CategorySortBy {
  return (SORTABLE_COLUMNS as readonly string[]).includes(id);
}

export function CategoriesTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CategoryStatus>('all');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);

  // Sin este reinicio, buscar desde la página 3 devuelve un listado vacío que
  // parece un bug (AC2).
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const [activeSort] = sorting;
  const sortBy = activeSort && isSortableColumn(activeSort.id) ? activeSort.id : 'createdAt';
  const sortDir = activeSort?.desc === false ? 'asc' : 'desc';

  const params: CategoryQueryParams = useMemo(
    () => ({
      q: debouncedSearch.trim() === '' ? undefined : debouncedSearch.trim(),
      status,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      sortBy,
      sortDir,
    }),
    [debouncedSearch, status, page, sortBy, sortDir],
  );

  const query = useCategories(params);

  const hasFilters = params.q !== undefined || status !== 'all';
  const statusLabel = CATEGORY_STATUS_OPTIONS.find((option) => option.value === status)?.label;

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function clearFilters() {
    setSearch('');
    setStatus('all');
  }

  const columns = useMemo(
    () =>
      getCategoryColumns({
        onEdit: (category) => {
          setEditing(category);
          setFormOpen(true);
        },
        onDeactivate: (category) => {
          setDeleting(category);
          setDeleteOpen(true);
        },
      }),
    [],
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
        Ninguna categoría coincide con la búsqueda o el filtro aplicados.
      </p>
      <Button variant="outline" size="sm" onClick={clearFilters}>
        Limpiar filtros
      </Button>
    </>
  ) : (
    <>
      <p className="text-sm font-medium">Aún no hay categorías</p>
      <p className="text-muted-foreground text-sm">
        Crea la primera categoría para empezar a organizar el catálogo.
      </p>
      <Button size="sm" onClick={openCreate}>
        <Plus className="size-4" aria-hidden />
        Crear categoría
      </Button>
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
            placeholder="Buscar por nombre…"
            aria-label="Buscar categorías por nombre"
            className="pl-9"
          />
        </div>

        <Select value={status} onValueChange={(value) => setStatus(value as CategoryStatus)}>
          <SelectTrigger className="sm:w-40" aria-label="Filtrar por estado">
            {/* Texto explícito: SelectValue depende de que el item esté montado
                y el contenido solo se monta al abrir el desplegable. */}
            <SelectValue>{statusLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button className="sm:ml-auto" onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          Nueva categoría
        </Button>
      </div>

      <DataTable
        table={table}
        isLoading={query.isPending}
        isError={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
        empty={emptyState}
      />

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={editing} />
      <DeleteCategoryDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        category={deleting}
      />
    </div>
  );
}
