'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { BanknoteX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatPrice } from '@/modules/products/lib/price';

import { formatIsoDate, formatPeriodLabel } from '../lib/payroll-dates';
import type { PayrollPaymentRow } from '../types/payroll.types';

import { PaymentStatusBadge } from './payment-status-badge';

type PayrollPaymentColumnsOptions = {
  canManage: boolean;
  onVoid: (payment: PayrollPaymentRow) => void;
};

// Sin cabeceras ordenables: el orden es fijo (`period desc, paid_at desc, id desc`).
export function getPayrollPaymentColumns({
  canManage,
  onVoid,
}: PayrollPaymentColumnsOptions): ColumnDef<PayrollPaymentRow>[] {
  const columns: ColumnDef<PayrollPaymentRow>[] = [
    {
      accessorKey: 'period',
      header: 'Periodo',
      enableSorting: false,
      size: 140,
      cell: ({ row }) => (
        <span className="font-medium whitespace-nowrap">
          {formatPeriodLabel(row.original.period)}
        </span>
      ),
    },
    {
      id: 'employee',
      header: 'Empleado',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.employeeFullName}</span>
          <span className="text-muted-foreground font-mono text-xs">
            {row.original.employeeCode}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'paidAt',
      header: 'Fecha de pago',
      enableSorting: false,
      size: 140,
      // Desde la cadena, sin `new Date()`: un pago del día 1 se pintaría como el último
      // del mes anterior en cualquier huso negativo (D-12, AC18).
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">{formatIsoDate(row.original.paidAt)}</span>
      ),
    },
    {
      accessorKey: 'amountCents',
      header: 'Importe',
      enableSorting: false,
      size: 120,
      // El importe de un pago anulado se conserva intacto y se sigue mostrando (AC15).
      cell: ({ row }) => (
        <span className="tabular-nums">{formatPrice(row.original.amountCents)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      enableSorting: false,
      size: 120,
      cell: ({ row }) => <PaymentStatusBadge status={row.original.status} />,
    },
  ];

  // Sin `payroll.manage` no se añade la columna: ni siquiera una cabecera vacía (AC3).
  if (!canManage) return columns;

  columns.push({
    id: 'actions',
    header: () => <span className="sr-only">Acciones</span>,
    enableSorting: false,
    size: 90,
    cell: ({ row }) => (
      <div className="flex justify-end">
        {/* Solo sobre pagos vivos: anular lo ya anulado es un no-op en el servidor y
            ofrecer el botón invitaría a pulsarlo esperando algo (AC15). */}
        {row.original.status === 'paid' ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive size-8"
            onClick={() => onVoid(row.original)}
          >
            <BanknoteX className="size-3.5" aria-hidden />
            <span className="sr-only">
              Anular el pago de {formatPeriodLabel(row.original.period)} a{' '}
              {row.original.employeeFullName}
            </span>
          </Button>
        ) : null}
      </div>
    ),
  });

  return columns;
}
