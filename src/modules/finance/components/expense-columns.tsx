'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PURCHASE_RECEIPT_TYPE_LABELS } from '@/lib/purchase-receipts';
import { formatDayKey } from '@/lib/utils';
import { formatPrice } from '@/modules/products/lib/price';

import { EXPENSE_CATEGORY_LABELS, NO_IGV_LABEL, NO_RECEIPT_LABEL } from '../constants';
import type { ExpenseRow } from '../types/finance.types';

// Un guion con texto accesible, nunca una celda en blanco ni un «S/ 0.00» —que diría
// «un IGV de cero», que es otra cosa— (AC19).
function EmptyCell({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden className="text-muted-foreground">
        —
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

type ExpenseColumnsOptions = {
  // Resueltos por el servidor en `meta`: el cliente no deduce permisos, solo decide qué
  // controles pinta. La frontera real es el 403 de cada verbo (AC17).
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (expense: ExpenseRow) => void;
  onDelete: (expense: ExpenseRow) => void;
};

// Sin cabeceras ordenables: el orden es fijo (`incurred_on desc, created_at desc,
// id desc`) porque un registro de gastos se lee por fecha (AC19).
export function getExpenseColumns({
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: ExpenseColumnsOptions): ColumnDef<ExpenseRow>[] {
  const columns: ColumnDef<ExpenseRow>[] = [
    {
      accessorKey: 'incurredOn',
      header: 'Fecha',
      enableSorting: false,
      size: 130,
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDayKey(row.original.incurredOn)}
        </span>
      ),
    },
    {
      accessorKey: 'concept',
      header: 'Concepto',
      enableSorting: false,
      // La razón social va bajo el concepto y no en columna propia: responde «a quién se
      // le pagó esto», que es una precisión del concepto, no un dato independiente.
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <span className="font-medium">{row.original.concept}</span>
          {row.original.receipt ? (
            <p className="text-muted-foreground text-xs">
              {row.original.receipt.supplierName}
              <span className="tabular-nums"> · RUC {row.original.receipt.supplierRuc}</span>
            </p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'category',
      header: 'Categoría',
      enableSorting: false,
      size: 140,
      cell: ({ row }) => (
        <Badge variant="secondary">{EXPENSE_CATEGORY_LABELS[row.original.category]}</Badge>
      ),
    },
    {
      id: 'receipt',
      header: 'Comprobante',
      enableSorting: false,
      size: 170,
      cell: ({ row }) => {
        const { receipt } = row.original;

        if (!receipt) return <EmptyCell label={NO_RECEIPT_LABEL} />;

        return (
          <div className="space-y-0.5">
            <Badge variant="outline">{PURCHASE_RECEIPT_TYPE_LABELS[receipt.type]}</Badge>
            {/* Serie y número viajan juntos o no viajan (AC12), así que basta con mirar
                uno de los dos para saber si hay referencia que pintar. */}
            {receipt.series ? (
              <p className="text-muted-foreground text-xs tabular-nums">
                {receipt.series}-{receipt.number}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: 'amountCents',
      header: 'Importe',
      enableSorting: false,
      size: 140,
      // La división por 100 solo ocurre aquí, al pintar (AC22).
      cell: ({ row }) => {
        const { amountCents, receipt } = row.original;

        return (
          <div className="space-y-0.5">
            <span className="tabular-nums">{formatPrice(amountCents)}</span>
            {/* `null` en `igvCents` no es cero: es que el comprobante no lleva IGV, o que
                no hay comprobante (AC8, AC19). */}
            {receipt === null ? null : receipt.igvCents === null ? (
              <p className="text-muted-foreground text-xs">
                <EmptyCell label={NO_IGV_LABEL} />
              </p>
            ) : (
              <p className="text-muted-foreground text-xs tabular-nums">
                IGV {formatPrice(receipt.igvCents)}
              </p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'createdByName',
      header: 'Registrado por',
      enableSorting: false,
      size: 180,
      // Cae al correo cuando Clerk no dio nombre: la celda nunca queda en blanco.
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.createdByName ?? row.original.createdByEmail}
        </span>
      ),
    },
  ];

  // Sin ninguno de los dos permisos no se añade la columna: quien solo tiene
  // `finance.read` ve la tabla y ni siquiera una cabecera de acciones vacía (AC17).
  if (!canUpdate && !canDelete) return columns;

  columns.push({
    id: 'actions',
    header: () => <span className="sr-only">Acciones</span>,
    enableSorting: false,
    size: 120,
    cell: ({ row }) => (
      <div className="flex justify-end gap-1">
        {canUpdate ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => onEdit(row.original)}
          >
            <Pencil className="size-3.5" aria-hidden />
            <span className="sr-only">Editar el gasto {row.original.concept}</span>
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive size-8"
            onClick={() => onDelete(row.original)}
          >
            <Trash2 className="size-3.5" aria-hidden />
            <span className="sr-only">Eliminar el gasto {row.original.concept}</span>
          </Button>
        ) : null}
      </div>
    ),
  });

  return columns;
}
