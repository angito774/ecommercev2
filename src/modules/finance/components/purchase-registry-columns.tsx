'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { grantsTaxCredit, PURCHASE_RECEIPT_TYPE_LABELS } from '@/lib/purchase-receipts';
import { formatDayKey } from '@/lib/utils';
import { formatPrice } from '@/modules/products/lib/price';

import { NO_IGV_LABEL } from '../constants';
import type { PurchaseRegistryRow } from '../types/accounting.types';

import { EmptyCell } from './empty-cell';

const NO_RECEIPT_TYPE_LABEL = 'Comprobante sin tipo registrado';

const NO_SUPPLIER_LABEL = 'Sin proveedor registrado';

const NO_SERIES_LABEL = 'Comprobante registrado sin serie ni número';

const TAX_CREDIT_GRANTED_LABEL = 'Con derecho a crédito fiscal';

const TAX_CREDIT_DENIED_LABEL = 'Sin derecho a crédito fiscal';

export function getPurchaseRegistryColumns(): ColumnDef<PurchaseRegistryRow>[] {
  return [
    {
      accessorKey: 'incurredOn',
      header: 'Fecha',
      enableSorting: false,
      size: 130,
      // `incurred_on` es `date` con `mode: 'string'`: ya es el día, y no hay ningún huso
      // que pueda desplazarlo.
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDayKey(row.original.incurredOn)}
        </span>
      ),
    },
    {
      id: 'supplier',
      header: 'Proveedor',
      enableSorting: false,
      size: 220,
      // Nullables aunque el `WHERE` los garantice (D-14): TypeScript no lee `CHECK`s de
      // Postgres, y el hueco se pinta visible en vez de tumbar el listado entero o
      // descartar la compra.
      cell: ({ row }) => {
        const { supplierName, supplierRuc } = row.original;

        if (!supplierName && !supplierRuc) return <EmptyCell label={NO_SUPPLIER_LABEL} />;

        return (
          <div className="space-y-0.5">
            <span className="font-medium">{supplierName}</span>
            {supplierRuc ? (
              <p className="text-muted-foreground text-xs tabular-nums">RUC {supplierRuc}</p>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: 'receiptType',
      header: 'Comprobante',
      enableSorting: false,
      size: 190,
      cell: ({ row }) => {
        const { receiptType, label } = row.original;

        return (
          <div className="space-y-0.5">
            {receiptType ? (
              <Badge variant="outline">{PURCHASE_RECEIPT_TYPE_LABELS[receiptType]}</Badge>
            ) : (
              <EmptyCell label={NO_RECEIPT_TYPE_LABEL} />
            )}
            {label ? (
              <p className="text-muted-foreground text-xs tabular-nums">{label}</p>
            ) : (
              <p className="text-xs">
                <EmptyCell label={NO_SERIES_LABEL} />
              </p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'baseCents',
      header: 'Base imponible',
      enableSorting: false,
      size: 130,
      // La base la resuelve el servidor: importe menos IGV cuando lo hay, y el importe
      // completo cuando el comprobante no es afecto (AC12). Aquí solo se pinta.
      cell: ({ row }) => (
        <span className="tabular-nums">{formatPrice(row.original.baseCents)}</span>
      ),
    },
    {
      accessorKey: 'igvCents',
      header: 'IGV',
      enableSorting: false,
      size: 120,
      // `null` no es cero: es que el comprobante no lleva IGV —un recibo por honorarios no
      // es afecto— (024, D-5).
      cell: ({ row }) =>
        row.original.igvCents === null ? (
          <EmptyCell label={NO_IGV_LABEL} />
        ) : (
          <span className="tabular-nums">{formatPrice(row.original.igvCents)}</span>
        ),
    },
    {
      accessorKey: 'amountCents',
      header: 'Total',
      enableSorting: false,
      size: 130,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{formatPrice(row.original.amountCents)}</span>
      ),
    },
    {
      id: 'taxCredit',
      header: 'Crédito fiscal',
      enableSorting: false,
      size: 130,
      // Derivado con `grantsTaxCredit()` del catálogo puro, la misma función que decide la
      // columna del CSV (AC11, D-10): la regla no viaja en el contrato, así que las dos
      // orillas no pueden discrepar. El texto acompaña al color, que nunca comunica solo.
      cell: ({ row }) => {
        const { receiptType } = row.original;

        if (!receiptType) return <EmptyCell label={NO_RECEIPT_TYPE_LABEL} />;

        const granted = grantsTaxCredit(receiptType);

        return (
          <>
            <Badge variant={granted ? 'secondary' : 'outline'}>{granted ? 'Sí' : 'No'}</Badge>
            {/* «Sí» y «No» a secas dependen de la cabecera de la columna, que un lector de
                pantalla no siempre anuncia al recorrer celdas. */}
            <span className="sr-only">
              {granted ? TAX_CREDIT_GRANTED_LABEL : TAX_CREDIT_DENIED_LABEL}
            </span>
          </>
        );
      },
    },
  ];
}
