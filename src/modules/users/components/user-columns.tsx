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
import { roleLabel } from '@/modules/roles/constants';

import type { UserWithRoles } from '../types/user.types';

type UserColumnsOptions = {
  // Llega resuelto del servidor en `meta.currentUserId`: el cliente no deduce quién
  // es a partir de la sesión de Clerk.
  currentUserId: string;
  onAssignRoles: (user: UserWithRoles) => void;
  onToggleActive: (user: UserWithRoles) => void;
};

const dateFormatter = new Intl.DateTimeFormat('es', { dateStyle: 'medium' });

// Los timestamps llegan del Route Handler serializados como texto ISO aunque el
// tipo inferido de Drizzle los declare Date; se acepta ambas formas.
function formatDate(value: Date | string): string {
  return dateFormatter.format(new Date(value));
}

function fullName(user: UserWithRoles): string | null {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name === '' ? null : name;
}

// Duplicado a propósito del de `category-columns.tsx`: es la segunda aparición y
// CLAUDE.md §6 extrae a la tercera. Cuando la fase 6 añada la bitácora, este
// encabezado se sube a `components/shared`.
function SortableHeader({ column, label }: { column: Column<UserWithRoles>; label: string }) {
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

export function getUserColumns({
  currentUserId,
  onAssignRoles,
  onToggleActive,
}: UserColumnsOptions): ColumnDef<UserWithRoles>[] {
  return [
    {
      accessorKey: 'email',
      header: ({ column }) => <SortableHeader column={column} label="Usuario" />,
      cell: ({ row }) => {
        const user = row.original;
        const name = fullName(user);

        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-medium">{name ?? user.email}</span>
              {user.id === currentUserId ? (
                <Badge variant="outline" className="font-normal">
                  Tú
                </Badge>
              ) : null}
            </div>
            {name ? <span className="text-muted-foreground text-xs">{user.email}</span> : null}
          </div>
        );
      },
    },
    {
      id: 'roles',
      header: 'Roles',
      enableSorting: false,
      cell: ({ row }) => {
        const { roleSlugs } = row.original;

        // Sin filas en `user_roles` equivale al rol `customer`, que no otorga nada:
        // es información válida, no un fallo de carga (spec 002 §5.7).
        if (roleSlugs.length === 0) {
          return <span className="text-muted-foreground text-sm">Cliente (sin acceso)</span>;
        }

        return (
          <div className="flex flex-wrap gap-1">
            {roleSlugs.map((slug) => (
              <Badge key={slug} variant="secondary" className="font-normal">
                {roleLabel(slug)}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Estado',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
          {row.original.isActive ? 'Con acceso' : 'Sin acceso'}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <SortableHeader column={column} label="Alta" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      enableSorting: false,
      size: 64,
      cell: ({ row }) => {
        const user = row.original;
        // Cortesía, no frontera: la API responde 403 si se fuerza la petición sobre
        // la propia cuenta (AC10).
        const isSelf = user.id === currentUserId;

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" aria-hidden />
                  <span className="sr-only">Acciones de {user.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="max-w-56 truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={isSelf} onSelect={() => onAssignRoles(user)}>
                  Cambiar roles
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant={user.isActive ? 'destructive' : 'default'}
                  disabled={isSelf}
                  onSelect={() => onToggleActive(user)}
                >
                  {user.isActive ? 'Quitar acceso' : 'Devolver acceso'}
                </DropdownMenuItem>
                {isSelf ? (
                  <p className="text-muted-foreground px-2 py-1.5 text-xs">
                    No puedes cambiar tu propio acceso ni tus roles.
                  </p>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
