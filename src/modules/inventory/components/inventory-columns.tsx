'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { InventoryRow } from '../types/inventory.types';

import { StockStatusBadge } from './stock-status-badge';

type InventoryColumnsOptions = {
  // Resuelto por el servidor en `meta`: el cliente no deduce permisos, solo decide
  // qué controles pinta. La frontera real es el 403 del PATCH de productos (AC13).
  canUpdateProduct: boolean;
  onEdit: (product: InventoryRow) => void;
};

// Sin cabeceras ordenables: el orden es fijo (`stock asc, name asc, id asc`) porque
// la pantalla existe para responder «qué atiendo primero», y un orden elegible
// permite justamente ocultar lo urgente (D-8).
export function getInventoryColumns({
  canUpdateProduct,
  onEdit,
}: InventoryColumnsOptions): ColumnDef<InventoryRow>[] {
  const columns: ColumnDef<InventoryRow>[] = [
    {
      accessorKey: 'name',
      header: 'Producto',
      enableSorting: false,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'sku',
      header: 'SKU',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs whitespace-nowrap">{row.original.sku}</span>
      ),
    },
    {
      accessorKey: 'categoryName',
      header: 'Categoría',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{row.original.categoryName}</span>
      ),
    },
    {
      accessorKey: 'stock',
      header: 'Stock',
      enableSorting: false,
      size: 80,
      // El entero se publica tal cual, negativo incluido: una sobreventa deja el
      // stock bajo cero y esconderlo borraría la evidencia (§10).
      cell: ({ row }) => <span className="tabular-nums">{row.original.stock}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      enableSorting: false,
      size: 120,
      cell: ({ row }) => <StockStatusBadge status={row.original.status} />,
    },
  ];

  // Sin `products.update` no se añade la columna: `audit` ve la tabla y ni siquiera
  // una cabecera de acciones vacía (AC13).
  if (!canUpdateProduct) return columns;

  columns.push({
    id: 'actions',
    header: () => <span className="sr-only">Acciones</span>,
    enableSorting: false,
    size: 96,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => onEdit(row.original)}>
          <Pencil className="size-3.5" aria-hidden />
          Editar
          <span className="sr-only"> el stock de {row.original.name}</span>
        </Button>
      </div>
    ),
  });

  return columns;
}
