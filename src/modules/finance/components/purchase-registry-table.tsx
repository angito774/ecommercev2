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
  EMPTY_PURCHASE_REGISTRY_MESSAGE,
  EMPTY_PURCHASE_REGISTRY_TITLE,
  PURCHASE_REGISTRY_ERROR_MESSAGE,
} from '../constants';
import { usePurchaseRegistry } from '../hooks/use-purchase-registry';
import type { AccountingQueryParams } from '../schemas/accounting.schema';
import type { PurchaseRegistryRow } from '../types/accounting.types';
import type { FinanceRange } from '../types/finance.types';

import { getPurchaseRegistryColumns } from './purchase-registry-columns';

const NO_ROWS: PurchaseRegistryRow[] = [];

// Gemela de la tabla de ventas y no una genérica parametrizada: son dos formas de fila
// distintas, y el genérico que las unificara acabaría con un `ColumnDef<unknown>` y un
// `meta` a medias. Lo que comparten —`DataTable`, el tamaño de página y el reinicio— se
// importa.
export function PurchaseRegistryTable({ range }: { range: FinanceRange }) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [range]);

  const params: AccountingQueryParams = useMemo(
    () => ({ from: range.from, to: range.to, page, pageSize: ACCOUNTING_PAGE_SIZE }),
    [range, page],
  );

  const query = usePurchaseRegistry(params);

  const columns = useMemo(() => getPurchaseRegistryColumns(), []);

  const pagination: PaginationState = { pageIndex: page - 1, pageSize: ACCOUNTING_PAGE_SIZE };

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    setPage(next.pageIndex + 1);
  };

  const table = useReactTable({
    data: query.data?.data ?? NO_ROWS,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: query.data?.meta.total ?? 0,
    state: { pagination },
    onPaginationChange,
  });

  return (
    <DataTable
      table={table}
      isLoading={query.isPending}
      isError={query.isError}
      errorMessage={query.error?.message ?? PURCHASE_REGISTRY_ERROR_MESSAGE}
      onRetry={() => void query.refetch()}
      empty={
        <>
          <p className="text-sm font-medium">{EMPTY_PURCHASE_REGISTRY_TITLE}</p>
          <p className="text-muted-foreground text-sm">{EMPTY_PURCHASE_REGISTRY_MESSAGE}</p>
        </>
      }
    />
  );
}
