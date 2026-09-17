'use client';

import {
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type PaginationState,
} from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  ALL_EXPENSE_CATEGORIES,
  EMPTY_EXPENSES_MESSAGE,
  EMPTY_EXPENSES_TITLE,
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_PAGE_SIZE,
  NO_RESULTS_MESSAGE,
  NO_RESULTS_TITLE,
} from '../constants';
import { useExpenses } from '../hooks/use-expenses';
import type { ExpenseQueryParams } from '../schemas/finance.schema';
import type { ExpenseRow, FinanceRange } from '../types/finance.types';

import { DeleteExpenseDialog } from './delete-expense-dialog';
import { ExpenseFormDialog } from './expense-form-dialog';
import { getExpenseColumns } from './expense-columns';

const NO_ROWS: ExpenseRow[] = [];

type CategoryFilter = ExpenseQueryParams['category'];

type ExpensesTableProps = {
  range: FinanceRange;
  /** Del `meta` del listado, para que el contenedor pinte «Registrar gasto». */
  onCanCreateChange: (canCreate: boolean) => void;
  /** Abre el diálogo de alta desde el botón del contenedor. */
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
};

export function ExpensesTable({
  range,
  onCanCreateChange,
  formOpen,
  onFormOpenChange,
}: ExpensesTableProps) {
  const [category, setCategory] = useState<CategoryFilter>(ALL_EXPENSE_CATEGORIES);
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Sin este reinicio, cambiar de categoría o de rango desde la página 3 devuelve un
  // listado vacío que parece un fallo.
  useEffect(() => {
    setPage(1);
  }, [category, range]);

  const params: ExpenseQueryParams = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      category,
      page,
      pageSize: EXPENSE_PAGE_SIZE,
    }),
    [range, category, page],
  );

  const query = useExpenses(params);

  const canCreate = query.data?.meta.canCreate ?? false;
  const canUpdate = query.data?.meta.canUpdate ?? false;
  const canDelete = query.data?.meta.canDelete ?? false;

  // El permiso lo resuelve el servidor y lo necesita el botón del contenedor, que vive
  // por encima de esta tabla. Se publica hacia arriba en vez de pedir el listado dos
  // veces.
  useEffect(() => {
    onCanCreateChange(canCreate);
  }, [canCreate, onCanCreateChange]);

  const columns = useMemo(
    () =>
      getExpenseColumns({
        canUpdate,
        canDelete,
        onEdit: (expense) => {
          setEditing(expense);
          onFormOpenChange(true);
        },
        onDelete: (expense) => {
          setDeleting(expense);
          setDeleteOpen(true);
        },
      }),
    [canUpdate, canDelete, onFormOpenChange],
  );

  const pagination: PaginationState = { pageIndex: page - 1, pageSize: EXPENSE_PAGE_SIZE };

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

  const hasCategoryFilter = category !== ALL_EXPENSE_CATEGORIES;
  const categoryLabel = EXPENSE_CATEGORY_OPTIONS.find((option) => option.value === category)?.label;

  // Los dos estados vacíos dicen cosas distintas: sin filtro, cero filas es que nadie
  // registró gastos en el rango; con filtro, es que la categoría no casó (AC11).
  const emptyState = hasCategoryFilter ? (
    <>
      <p className="text-sm font-medium">{NO_RESULTS_TITLE}</p>
      <p className="text-muted-foreground text-sm">{NO_RESULTS_MESSAGE}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCategory(ALL_EXPENSE_CATEGORIES)}
      >
        Ver todas las categorías
      </Button>
    </>
  ) : (
    <>
      <p className="text-sm font-medium">{EMPTY_EXPENSES_TITLE}</p>
      <p className="text-muted-foreground text-sm">{EMPTY_EXPENSES_MESSAGE}</p>
    </>
  );

  return (
    <div className="space-y-4">
      <Select
        value={category}
        onValueChange={(value) => setCategory(value as CategoryFilter)}
      >
        <SelectTrigger className="sm:w-56" aria-label="Filtrar los gastos por categoría">
          {/* Texto explícito: `SelectValue` depende de que el item esté montado y el
              contenido solo se monta al abrir el desplegable. */}
          <SelectValue>{categoryLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {EXPENSE_CATEGORY_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DataTable
        table={table}
        isLoading={query.isPending}
        isError={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
        empty={emptyState}
      />

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          onFormOpenChange(open);
          // Al cerrar se olvida qué se editaba: si no, reabrir con «Registrar gasto»
          // mostraría el último gasto editado.
          if (!open) setEditing(null);
        }}
        expense={editing}
      />

      <DeleteExpenseDialog open={deleteOpen} onOpenChange={setDeleteOpen} expense={deleting} />
    </div>
  );
}
