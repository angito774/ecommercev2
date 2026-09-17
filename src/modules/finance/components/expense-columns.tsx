'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/modules/products/lib/price';

import { EXPENSE_CATEGORY_LABELS } from '../constants';
import type { ExpenseRow } from '../types/finance.types';

type ExpenseColumnsOptions = {
  // Resueltos por el servidor en `meta`: el cliente no deduce permisos, solo decide qué
  // controles pinta. La frontera real es el 403 de cada verbo (AC17).
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (expense: ExpenseRow) => void;
  onDelete: (expense: ExpenseRow) => void;
};

// `incurred_on` llega como `'YYYY-MM-DD'` y se formatea con los getters UTC sobre el
// mediodía: construir un `Date` a partir del día suelto lo interpreta en UTC y, en un
// huso negativo, `toLocaleDateString` lo pintaría un día antes.
const dayFormatter = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDay(dayKey: string): string {
  return dayFormatter.format(new Date(`${dayKey}T00:00:00.000Z`));
}

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
        <span className="whitespace-nowrap tabular-nums">{formatDay(row.original.incurredOn)}</span>
      ),
    },
    {
      accessorKey: 'concept',
      header: 'Concepto',
      enableSorting: false,
      cell: ({ row }) => <span className="font-medium">{row.original.concept}</span>,
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
      accessorKey: 'amountCents',
      header: 'Importe',
      enableSorting: false,
      size: 120,
      // La división por 100 solo ocurre aquí, al pintar (AC22).
      cell: ({ row }) => (
        <span className="tabular-nums">{formatPrice(row.original.amountCents)}</span>
      ),
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
