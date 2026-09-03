'use client';

import type { Column, ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { formatPrice } from '../lib/price';
import type { ProductWithCategory } from '../types/product.types';

type ProductColumnsOptions = {
  // Resueltos por el servidor en `meta`: el cliente no deduce permisos, solo
  // decide qué controles pinta. La frontera real es el 403 del handler.
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (product: ProductWithCategory) => void;
  onDeactivate: (product: ProductWithCategory) => void;
};

// Tercera aparición del encabezado ordenable —categorías, usuarios y ahora
// productos—, que es justo el umbral que fija CLAUDE.md §6 para extraer. Se deja
// aquí a la espera de subirlo a `components/shared` en una tarea propia, para no
// mezclar un refactor de tres módulos dentro del spec que introduce el tercero.
function SortableHeader({
  column,
  label,
}: {
  column: Column<ProductWithCategory>;
  label: string;
}) {
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="data-[state=open]:bg-accent -ml-2 h-8"
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {label}
      <Icon className="ml-1 size-3.5" aria-hidden />
      <span className="sr-only">
        Ordenar por {label} {sorted === 'asc' ? 'descendente' : 'ascendente'}
      </span>
    </Button>
  );
}

export function getProductColumns({
  canUpdate,
  canDelete,
  onEdit,
  onDeactivate,
}: ProductColumnsOptions): ColumnDef<ProductWithCategory>[] {
  const columns: ColumnDef<ProductWithCategory>[] = [
    {
      accessorKey: 'sku',
      header: 'SKU',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs whitespace-nowrap">{row.original.sku}</span>
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <SortableHeader column={column} label="Producto" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
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
      accessorKey: 'priceCents',
      header: ({ column }) => <SortableHeader column={column} label="Precio" />,
      cell: ({ row }) => (
        <span className="tabular-nums whitespace-nowrap">
          {formatPrice(row.original.priceCents)}
        </span>
      ),
    },
    {
      accessorKey: 'stock',
      header: ({ column }) => <SortableHeader column={column} label="Stock" />,
      cell: ({ row }) => {
        const { stock } = row.original;

        // Agotado se marca con icono y texto, no solo con color: la advertencia
        // tiene que llegar también a quien no distingue el matiz.
        if (stock === 0) {
          return (
            <span className="text-destructive inline-flex items-center gap-1 text-sm font-medium">
              <AlertTriangle className="size-3.5" aria-hidden />
              Agotado
            </span>
          );
        }

        return <span className="tabular-nums">{stock}</span>;
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Estado',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
          {row.original.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
  ];

  // Sin permisos de escritura no se añade la columna: `audit` ve la tabla y ni
  // siquiera una cabecera de acciones vacía (AC15).
  if (!canUpdate && !canDelete) return columns;

  columns.push({
    id: 'actions',
    header: () => <span className="sr-only">Acciones</span>,
    enableSorting: false,
    size: 64,
    cell: ({ row }) => {
      const product = row.original;

      return (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" aria-hidden />
                <span className="sr-only">Acciones de {product.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="max-w-56 truncate">{product.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {canUpdate ? (
                <DropdownMenuItem onSelect={() => onEdit(product)}>Editar</DropdownMenuItem>
              ) : null}
              {canDelete ? (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!product.isActive}
                  onSelect={() => onDeactivate(product)}
                >
                  Desactivar
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  });

  return columns;
}
