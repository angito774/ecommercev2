'use client';

import {
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type PaginationState,
} from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/shared/data-table';

import {
  ACCOUNTING_PAGE_SIZE,
  EMPTY_SALES_REGISTRY_MESSAGE,
  EMPTY_SALES_REGISTRY_TITLE,
  SALES_REGISTRY_ERROR_MESSAGE,
} from '../constants';
import { useSalesRegistry } from '../hooks/use-sales-registry';
import type { AccountingQueryParams } from '../schemas/accounting.schema';
import type { SalesRegistryRow } from '../types/accounting.types';
import type { FinanceRange } from '../types/finance.types';

import { getSalesRegistryColumns } from './sales-registry-columns';

// Referencia estable: un `[]` nuevo en cada render reconstruiría el modelo de la tabla.
const NO_ROWS: SalesRegistryRow[] = [];

export function SalesRegistryTable({ range }: { range: FinanceRange }) {
  const [page, setPage] = useState(1);

  // Sin este reinicio, cambiar de rango desde la página 3 devuelve un listado vacío que
  // parece un fallo.
  useEffect(() => {
    setPage(1);
  }, [range]);

  const params: AccountingQueryParams = useMemo(
    () => ({ from: range.from, to: range.to, page, pageSize: ACCOUNTING_PAGE_SIZE }),
    [range, page],
  );

  const query = useSalesRegistry(params);

  const columns = useMemo(() => getSalesRegistryColumns(), []);

  const pagination: PaginationState = { pageIndex: page - 1, pageSize: ACCOUNTING_PAGE_SIZE };

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    setPage(next.pageIndex + 1);
  };

  const table = useReactTable({
    data: query.data?.data ?? NO_ROWS,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // El servidor pagina y ordena: la tabla solo pinta la página que recibe (AC13).
    manualPagination: true,
    rowCount: query.data?.meta.total ?? 0,
    state: { pagination },
    onPaginationChange,
  });

  return (
    <DataTable
      table={table}
      // `isPending` y no `isFetching`: con `keepPreviousData`, cambiar de rango conserva
      // las filas anteriores y solo la primera carga muestra esqueletos (AC24).
      isLoading={query.isPending}
      isError={query.isError}
      errorMessage={query.error?.message ?? SALES_REGISTRY_ERROR_MESSAGE}
      onRetry={() => void query.refetch()}
      empty={
        <>
          <p className="text-sm font-medium">{EMPTY_SALES_REGISTRY_TITLE}</p>
          <p className="text-muted-foreground text-sm">{EMPTY_SALES_REGISTRY_MESSAGE}</p>
        </>
      }
    />
  );
}
