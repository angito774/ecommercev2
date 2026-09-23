'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { ELECTRONIC_DOCUMENT_KIND_LABELS } from '@/lib/electronic-documents';
import { toReportingDayKey } from '@/lib/reporting';
import { formatDayKey } from '@/lib/utils';
import { formatPrice } from '@/modules/products/lib/price';

import { BUYER_DOCUMENT_TYPE_LABELS } from '../constants';
import type { SalesRegistryRow } from '../types/accounting.types';

import { EmptyCell } from './empty-cell';

const NO_BUYER_LABEL = 'El pedido no tiene datos de comprador';

const NO_AMOUNT_LABEL = 'Sin importe registrado';

const NO_RELATED_LABEL = 'No modifica ningún documento';

const NO_SERIES_LABEL = 'Sin serie ni número';

// El contrato publica el ISO del `issued_at` y el día de Lima lo deriva quien pinta, con
// la misma función pura que usa el CSV en el servidor (D-16, AC18): un comprobante emitido
// el 30 a las 22:00 de Lima pertenece al día 30.
const toLimaDay = (issuedAt: string): string => toReportingDayKey(new Date(issuedAt));

// Sin cabeceras ordenables: el orden es fijo y ascendente porque un registro se lee como
// un libro (D-11, AC13). Función y no constante, por consistencia con el resto de las
// tablas del panel.
export function getSalesRegistryColumns(): ColumnDef<SalesRegistryRow>[] {
  return [
    {
      accessorKey: 'issuedAt',
      header: 'Fecha de emisión',
      enableSorting: false,
      size: 130,
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDayKey(toLimaDay(row.original.issuedAt))}
        </span>
      ),
    },
    {
      accessorKey: 'kind',
      header: 'Documento',
      enableSorting: false,
      size: 200,
      // El tipo y la serie-número juntos: responden «qué documento es este», que es una
      // sola pregunta. La etiqueta sale del catálogo, así que un `kind` nuevo se rotula
      // solo (AC28).
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <Badge variant="outline">{ELECTRONIC_DOCUMENT_KIND_LABELS[row.original.kind]}</Badge>
          {row.original.label ? (
            <p className="text-muted-foreground text-xs tabular-nums">{row.original.label}</p>
          ) : (
            <p className="text-xs">
              <EmptyCell label={NO_SERIES_LABEL} />
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'buyer',
      header: 'Comprador',
      enableSorting: false,
      size: 220,
      // De `orders` y no de `electronic_documents`, que no los guarda (AC8). Una boleta sin
      // datos fiscales y una factura con razón social son los dos casos normales, no un
      // fallo: el `CHECK orders_buyer_legal_name_requires_ruc` solo la exige con RUC.
      cell: ({ row }) => {
        const { buyerDocumentType, buyerDocumentNumber, buyerLegalName } = row.original;

        if (!buyerDocumentType || !buyerDocumentNumber) {
          return <EmptyCell label={NO_BUYER_LABEL} />;
        }

        return (
          <div className="space-y-0.5">
            <span className="tabular-nums">
              {BUYER_DOCUMENT_TYPE_LABELS[buyerDocumentType]} {buyerDocumentNumber}
            </span>
            {buyerLegalName ? (
              <p className="text-muted-foreground text-xs">{buyerLegalName}</p>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: 'baseCents',
      header: 'Base imponible',
      enableSorting: false,
      size: 130,
      // La división por 100 solo ocurre aquí, al pintar. `null` no es cero: es que la
      // columna no lleva importe.
      cell: ({ row }) =>
        row.original.baseCents === null ? (
          <EmptyCell label={NO_AMOUNT_LABEL} />
        ) : (
          <span className="tabular-nums">{formatPrice(row.original.baseCents)}</span>
        ),
    },
    {
      accessorKey: 'igvCents',
      header: 'IGV',
      enableSorting: false,
      size: 120,
      cell: ({ row }) =>
        row.original.igvCents === null ? (
          <EmptyCell label={NO_AMOUNT_LABEL} />
        ) : (
          <span className="tabular-nums">{formatPrice(row.original.igvCents)}</span>
        ),
    },
    {
      accessorKey: 'amountCents',
      header: 'Total',
      enableSorting: false,
      size: 130,
      cell: ({ row }) =>
        row.original.amountCents === null ? (
          <EmptyCell label={NO_AMOUNT_LABEL} />
        ) : (
          <span className="font-medium tabular-nums">
            {formatPrice(row.original.amountCents)}
          </span>
        ),
    },
    {
      accessorKey: 'relatedLabel',
      header: 'Modifica a',
      enableSorting: false,
      size: 150,
      // Resuelto por `related_document_id` y no por la letra de la serie (AC7). Vacío en un
      // original, que es la mayoría de las filas.
      cell: ({ row }) =>
        row.original.relatedLabel ? (
          <span className="tabular-nums">{row.original.relatedLabel}</span>
        ) : (
          <EmptyCell label={NO_RELATED_LABEL} />
        ),
    },
  ];
}
