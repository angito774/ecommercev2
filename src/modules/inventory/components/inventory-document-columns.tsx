'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatDayKey } from '@/lib/utils';

import type { InventoryDocumentRow } from '../types/inventory-document.types';

import { TransactionDirectionBadge } from './transaction-direction-badge';

type InventoryDocumentColumnsOptions = {
  onView: (document: InventoryDocumentRow) => void;
};

// Sin cabeceras ordenables: el orden es fijo (`doc_date desc, doc_number desc`) porque un
// libro de documentos se lee por fecha (AC12).
//
// La acción «Ver» no depende de ningún permiso: quien llegó hasta aquí ya tiene
// `inventory.read`, que es el mismo que protege el detalle.
export function getInventoryDocumentColumns({
  onView,
}: InventoryDocumentColumnsOptions): ColumnDef<InventoryDocumentRow>[] {
  return [
    {
      accessorKey: 'docNumber',
      header: 'N.º',
      enableSorting: false,
      size: 80,
      // `font-mono`: el correlativo es un identificador que se lee dígito a dígito y se
      // dicta en voz alta, no una cantidad.
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.docNumber}</span>
      ),
    },
    {
      accessorKey: 'docDate',
      header: 'Fecha',
      enableSorting: false,
      size: 130,
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDayKey(row.original.docDate)}
        </span>
      ),
    },
    {
      accessorKey: 'transaccionName',
      header: 'Tipo',
      enableSorting: false,
      size: 220,
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.original.transaccionName}</span>
          <TransactionDirectionBadge direction={row.original.direction} />
        </div>
      ),
    },
    {
      accessorKey: 'reference',
      header: 'Referencia',
      enableSorting: false,
      size: 160,
      // El guion y no una celda en blanco: no toda salida tiene papel detrás (D-8), y el
      // hueco vacío se lee como un dato que falta.
      cell: ({ row }) =>
        row.original.reference ? (
          <span className="text-sm">{row.original.reference}</span>
        ) : (
          <span className="text-muted-foreground text-sm" aria-label="Sin documento de referencia">
            —
          </span>
        ),
    },
    {
      accessorKey: 'itemCount',
      header: 'Líneas',
      enableSorting: false,
      size: 90,
      cell: ({ row }) => <span className="tabular-nums">{row.original.itemCount}</span>,
    },
    {
      accessorKey: 'totalQuantity',
      header: 'Unidades',
      enableSorting: false,
      size: 100,
      cell: ({ row }) => <span className="tabular-nums">{row.original.totalQuantity}</span>,
    },
    {
      accessorKey: 'createdByName',
      header: 'Registrado por',
      enableSorting: false,
      size: 180,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{row.original.createdByName}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      enableSorting: false,
      size: 80,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => onView(row.original)}
          >
            <Eye className="size-3.5" aria-hidden />
            <span className="sr-only">Ver el documento n.º {row.original.docNumber}</span>
          </Button>
        </div>
      ),
    },
  ];
}
