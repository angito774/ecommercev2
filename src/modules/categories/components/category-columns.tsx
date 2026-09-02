'use client';

import type { Column, ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from 'lucide-react';

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

import type { Category } from '../types/category.types';

type CategoryColumnsOptions = {
  onEdit: (category: Category) => void;
  onDeactivate: (category: Category) => void;
};

const dateFormatter = new Intl.DateTimeFormat('es', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

// Los timestamps llegan del Route Handler serializados como texto ISO aunque el
// tipo inferido de Drizzle los declare Date; se acepta ambas formas.
function formatDateTime(value: Date | string): string {
  return dateFormatter.format(new Date(value));
}

function SortableHeader({ column, label }: { column: Column<Category>; label: string }) {
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-8 data-[state=open]:bg-accent"
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

export function getCategoryColumns({
  onEdit,
  onDeactivate,
}: CategoryColumnsOptions): ColumnDef<Category>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => <SortableHeader column={column} label="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'slug',
      header: 'Slug',
      enableSorting: false,
      cell: ({ row }) => (
        <code className="text-muted-foreground font-mono text-xs">{row.original.slug}</code>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Estado',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
          {row.original.isActive ? 'Activa' : 'Inactiva'}
        </Badge>
      ),
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => <SortableHeader column={column} label="Actualizada" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {formatDateTime(row.original.updatedAt)}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <SortableHeader column={column} label="Creada" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {formatDateTime(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      enableSorting: false,
      size: 64,
      cell: ({ row }) => {
        const category = row.original;

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" aria-hidden />
                  <span className="sr-only">Acciones de {category.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{category.name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onEdit(category)}>Editar</DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!category.isActive}
                  onSelect={() => onDeactivate(category)}
                >
                  Desactivar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
