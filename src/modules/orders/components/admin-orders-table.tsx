'use client';

import {
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type PaginationState,
} from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/shared/data-table';

import { ADMIN_ORDER_PAGE_SIZE } from '../constants';
import { useAdminOrders } from '../hooks/use-admin-orders';
import type { AdminOrderQueryParams } from '../schemas/admin-order.schema';
import type { AdminOrderRow } from '../types/order.types';

import { getAdminOrderColumns } from './admin-order-columns';
import { AdminOrderDetailSheet } from './admin-order-detail-sheet';
import {
  AdminOrderFilters,
  EMPTY_ADMIN_ORDER_FILTERS,
  type AdminOrderFiltersValue,
} from './admin-order-filters';

const NO_ROWS: AdminOrderRow[] = [];

// El `<input type="date">` da la fecha en hora local y el contrato pide un ISO
// completo. Se abre el día en su primer instante y se cierra en el último para que
// «del 1 al 3» incluya el día 3 entero (AC5). Mismo criterio que la bitácora.
function startOfDayIso(value: string): string | undefined {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function endOfDayIso(value: string): string | undefined {
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function AdminOrdersTable() {
  const [filters, setFilters] = useState<AdminOrderFiltersValue>(EMPTY_ADMIN_ORDER_FILTERS);
  const [page, setPage] = useState(1);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  // Sin este reinicio, filtrar desde la página 3 devuelve un listado vacío que
  // parece un fallo.
  useEffect(() => {
    setPage(1);
  }, [filters]);

  const params: AdminOrderQueryParams = useMemo(
    () => ({
      dateFrom: filters.dateFrom === '' ? undefined : startOfDayIso(filters.dateFrom),
      dateTo: filters.dateTo === '' ? undefined : endOfDayIso(filters.dateTo),
      status: filters.status,
      customerSearch: filters.customerSearch === '' ? undefined : filters.customerSearch,
      page,
      pageSize: ADMIN_ORDER_PAGE_SIZE,
    }),
    [filters, page],
  );

  const query = useAdminOrders(params);

  const columns = useMemo(() => getAdminOrderColumns({ onViewDetail: setDetailOrderId }), []);

  const pagination: PaginationState = { pageIndex: page - 1, pageSize: ADMIN_ORDER_PAGE_SIZE };

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    setPage(next.pageIndex + 1);
  };

  const table = useReactTable({
    data: query.data?.data ?? NO_ROWS,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // El servidor pagina y filtra: la tabla solo pinta la página que recibe.
    manualPagination: true,
    manualFiltering: true,
    pageCount: query.data?.meta.totalPages ?? -1,
    rowCount: query.data?.meta.total ?? 0,
    state: { pagination },
    onPaginationChange,
  });

  const hasFilters =
    filters.customerSearch !== '' ||
    filters.status !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';

  const emptyState = hasFilters ? (
    <>
      <p className="text-sm font-medium">Sin resultados</p>
      <p className="text-muted-foreground text-sm">
        Ningún pedido coincide con los filtros aplicados.
      </p>
    </>
  ) : (
    <>
      <p className="text-sm font-medium">Todavía no hay pedidos</p>
      <p className="text-muted-foreground text-sm">
        Aquí aparecerá cada compra en cuanto alguien pase por el checkout.
      </p>
    </>
  );

  return (
    <div className="space-y-4">
      <AdminOrderFilters onChange={setFilters} />

      <DataTable
        table={table}
        isLoading={query.isPending}
        isError={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
        empty={emptyState}
      />

      {/* Montado siempre: el sheet resuelve su propia consulta y `orderId` nulo la
          deja deshabilitada, así que no hay petición hasta que se abre uno. */}
      <AdminOrderDetailSheet
        orderId={detailOrderId}
        onOpenChange={(open) => {
          if (!open) setDetailOrderId(null);
        }}
      />
    </div>
  );
}
