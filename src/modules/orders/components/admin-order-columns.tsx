'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import { formatPrice } from '@/modules/products/lib/price';

import { ADMIN_ORDER_STATUS_LABELS } from '../constants';
import type { AdminOrderRow } from '../types/order.types';

import { formatOrderNumber } from './order-confirmation';
import { OrderStatusBadge } from './order-status-badge';

type AdminOrderColumnsOptions = {
  onViewDetail: (orderId: string) => void;
};

const dateFormatter = new Intl.DateTimeFormat('es', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

// Sin `enableSorting` en ninguna columna: el listado sale siempre por fecha
// descendente desde el repositorio y no hay orden que el usuario pueda cambiar.
export function getAdminOrderColumns({
  onViewDetail,
}: AdminOrderColumnsOptions): ColumnDef<AdminOrderRow>[] {
  return [
    {
      accessorKey: 'createdAt',
      header: 'Fecha',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <p className="text-sm">{dateFormatter.format(new Date(row.original.createdAt))}</p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatOrderNumber(row.original.id)}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'customerEmail',
      header: 'Cliente',
      enableSorting: false,
      cell: ({ row }) => {
        const { customerName, customerEmail } = row.original;

        return (
          <div className="max-w-56">
            {/* Sin nombre cuando Clerk no lo dio: el correo sube a línea principal
                en vez de dejar un hueco sobre él. */}
            {customerName ? (
              <p className="truncate text-sm font-medium">{customerName}</p>
            ) : null}
            <p
              className={
                customerName
                  ? 'text-muted-foreground truncate text-xs'
                  : 'truncate text-sm font-medium'
              }
            >
              {customerEmail}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: 'itemCount',
      header: 'Líneas',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm tabular-nums">{row.original.itemCount}</span>
      ),
    },
    {
      accessorKey: 'amountTotalCents',
      header: 'Total',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm font-medium whitespace-nowrap tabular-nums">
          {formatPrice(row.original.amountTotalCents)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      enableSorting: false,
      cell: ({ row }) => (
        <OrderStatusBadge
          status={row.original.status}
          label={ADMIN_ORDER_STATUS_LABELS[row.original.status]}
        />
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      // Botón en la celda y no `onRowClick` en `DataTable`: evita tocar un componente
      // que comparten cuatro tablas y da un objetivo alcanzable por teclado, que una
      // fila clicable no es (D-16).
      cell: ({ row }) => (
        <Button variant="outline" size="sm" onClick={() => onViewDetail(row.original.id)}>
          Ver detalle
          <span className="sr-only"> del pedido {formatOrderNumber(row.original.id)}</span>
        </Button>
      ),
    },
  ];
}
