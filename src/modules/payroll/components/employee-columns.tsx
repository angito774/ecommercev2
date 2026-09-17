'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { BanknoteArrowUp, Pencil, UserMinus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/modules/products/lib/price';

import { formatIsoDate } from '../lib/payroll-dates';
import type { EmployeeRow } from '../types/employee.types';

type EmployeeColumnsOptions = {
  // Resuelto por el servidor en `meta`: el cliente no deduce permisos, solo decide qué
  // controles pinta. La frontera real es el 403 de cada mutación (AC3).
  canManage: boolean;
  onEdit: (employee: EmployeeRow) => void;
  onDeactivate: (employee: EmployeeRow) => void;
  onRegisterPayment: (employee: EmployeeRow) => void;
};

// Sin cabeceras ordenables: el orden es fijo (`last_name asc, first_name asc, id asc`)
// porque una planilla se lee alfabéticamente (AC8).
export function getEmployeeColumns({
  canManage,
  onEdit,
  onDeactivate,
  onRegisterPayment,
}: EmployeeColumnsOptions): ColumnDef<EmployeeRow>[] {
  const columns: ColumnDef<EmployeeRow>[] = [
    {
      accessorKey: 'employeeCode',
      header: 'Código',
      enableSorting: false,
      size: 120,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.employeeCode}</span>
      ),
    },
    {
      id: 'fullName',
      header: 'Nombre',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.lastName}, {row.original.firstName}
        </span>
      ),
    },
    {
      accessorKey: 'jobTitle',
      header: 'Cargo',
      enableSorting: false,
      size: 180,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{row.original.jobTitle}</span>
      ),
    },
    {
      accessorKey: 'hiredAt',
      header: 'Ingreso',
      enableSorting: false,
      size: 130,
      // Formateado desde la cadena, sin pasar por `new Date()`: con un huso negativo, el
      // día 1 se pintaría como el último del mes anterior (D-12, AC18).
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">{formatIsoDate(row.original.hiredAt)}</span>
      ),
    },
    {
      accessorKey: 'baseSalaryCents',
      header: 'Salario base',
      enableSorting: false,
      size: 130,
      // La división por 100 solo ocurre aquí, al pintar.
      cell: ({ row }) => (
        <span className="tabular-nums">{formatPrice(row.original.baseSalaryCents)}</span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Estado',
      enableSorting: false,
      size: 110,
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="secondary">Activo</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            De baja
          </Badge>
        ),
    },
  ];

  // Sin `payroll.manage` no se añade la columna: quien solo tiene `payroll.read` ve la
  // tabla y ni siquiera una cabecera de acciones vacía (AC3).
  if (!canManage) return columns;

  columns.push({
    id: 'actions',
    header: () => <span className="sr-only">Acciones</span>,
    enableSorting: false,
    size: 150,
    cell: ({ row }) => (
      <div className="flex justify-end gap-1">
        {/* El pago se registra desde la fila del empleado y no desde un selector en la
            pestaña de pagos (D-17): así el diálogo ya sabe a quién se paga y puede
            proponer su salario base sin una segunda petición. */}
        {row.original.isActive ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => onRegisterPayment(row.original)}
          >
            <BanknoteArrowUp className="size-3.5" aria-hidden />
            <span className="sr-only">
              Registrar un pago a {row.original.firstName} {row.original.lastName}
            </span>
          </Button>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onEdit(row.original)}
        >
          <Pencil className="size-3.5" aria-hidden />
          <span className="sr-only">
            Editar la ficha de {row.original.firstName} {row.original.lastName}
          </span>
        </Button>

        {row.original.isActive ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive size-8"
            onClick={() => onDeactivate(row.original)}
          >
            <UserMinus className="size-3.5" aria-hidden />
            <span className="sr-only">
              Dar de baja a {row.original.firstName} {row.original.lastName}
            </span>
          </Button>
        ) : null}
      </div>
    ),
  });

  return columns;
}
