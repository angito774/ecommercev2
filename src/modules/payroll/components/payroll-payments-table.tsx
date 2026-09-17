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
  EMPTY_PAYMENTS_MESSAGE,
  EMPTY_PAYMENTS_TITLE,
  NO_PAYMENT_RESULTS_MESSAGE,
  NO_PAYMENT_RESULTS_TITLE,
  PAYROLL_PAGE_SIZE,
  PAYROLL_SEARCH_DEBOUNCE_MS,
} from '../constants';
import { usePayrollPayments } from '../hooks/use-payroll-payments';
import type { PayrollQueryParams } from '../schemas/payroll.schema';
import type { PayrollPaymentRow } from '../types/payroll.types';

import { getPayrollPaymentColumns } from './payroll-payment-columns';
import { VoidPaymentDialog } from './void-payment-dialog';

const NO_ROWS: PayrollPaymentRow[] = [];
const ALL_PERIODS = 'all';

type PayrollPaymentsTableProps = {
  /** Lleva a la pestaña Personal desde el estado vacío: los pagos se registran allí (D-17). */
  onGoToStaff: () => void;
};

export function PayrollPaymentsTable({ onGoToStaff }: PayrollPaymentsTableProps) {
  // El `<input type="month">` entrega '' cuando está vacío; el centinela `all` es lo que
  // entiende la query, así que la traducción ocurre en un solo sitio, al construir los
  // parámetros.
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [voidOpen, setVoidOpen] = useState(false);
  const [voiding, setVoiding] = useState<PayrollPaymentRow | null>(null);

  const debouncedSearch = useDebounce(search, PAYROLL_SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, month]);

  const params: PayrollQueryParams = useMemo(
    () => ({
      period: month === '' ? ALL_PERIODS : month,
      search: debouncedSearch.trim() === '' ? undefined : debouncedSearch.trim(),
      page,
      pageSize: PAYROLL_PAGE_SIZE,
    }),
    [month, debouncedSearch, page],
  );

  const query = usePayrollPayments(params);

  const canManage = query.data?.meta.canManage ?? false;

  const columns = useMemo(
    () =>
      getPayrollPaymentColumns({
        canManage,
        onVoid: (payment) => {
          setVoiding(payment);
          setVoidOpen(true);
        },
      }),
    [canManage],
  );

  const pagination: PaginationState = { pageIndex: page - 1, pageSize: PAYROLL_PAGE_SIZE };

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

  const hasFilters = params.search !== undefined || month !== '';

  function clearFilters() {
    setSearch('');
    setMonth('');
  }

  // Sin filtros, cero filas es que todavía no se ha registrado ningún pago, y lo que hay
  // que explicar es dónde se registran; con filtros, que la búsqueda no casó (AC19).
  const emptyState = hasFilters ? (
    <>
      <p className="text-sm font-medium">{NO_PAYMENT_RESULTS_TITLE}</p>
      <p className="text-muted-foreground text-sm">{NO_PAYMENT_RESULTS_MESSAGE}</p>
      <Button variant="outline" size="sm" onClick={clearFilters}>
        Limpiar filtros
      </Button>
    </>
  ) : (
    <>
      <p className="text-sm font-medium">{EMPTY_PAYMENTS_TITLE}</p>
      <p className="text-muted-foreground text-sm">{EMPTY_PAYMENTS_MESSAGE}</p>
      <Button variant="outline" size="sm" onClick={onGoToStaff}>
        Ir a Personal
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
            placeholder="Buscar por nombre o código…"
            aria-label="Buscar pagos por nombre, apellido o código del empleado"
            className="pl-9"
          />
        </div>

        <Input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          aria-label="Filtrar los pagos por mes"
          className="sm:w-48"
        />

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="sm:ml-auto">
            Limpiar filtros
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

      <VoidPaymentDialog open={voidOpen} onOpenChange={setVoidOpen} payment={voiding} />
    </div>
  );
}
