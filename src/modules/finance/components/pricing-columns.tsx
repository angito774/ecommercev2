'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatPrice } from '@/modules/products/lib/price';

import { NO_COST_LABEL } from '../constants';
import type { PricingRow } from '../types/pricing.types';

type PricingColumnsOptions = {
  // Resuelto por el servidor en `meta`: el cliente no deduce permisos, solo decide qué
  // controles pinta. La frontera real es el 403 del POST (AC4).
  canSetInitialCost: boolean;
  onSetInitialCost: (product: PricingRow) => void;
};

// Un solo sitio que decide cómo se lee un margen, para que las dos columnas —soles y
// porcentaje— no puedan contradecirse en el signo ni en el color. Recibe el `value` y no
// los céntimos: las dos columnas comparten el signo, que es lo único que mira. Mismos
// tokens que `kpi-card` y `finance-summary-cards`, para que «positivo» se vea igual en
// todo el panel.
function marginTone(value: number): string {
  if (value > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (value < 0) return 'text-destructive';
  return 'text-muted-foreground';
}

// El signo, el icono y el texto, además del color (AC23): un margen negativo tiene que
// leerse sin distinguir verde de rojo. El `+` explícito del positivo es lo que hace que el
// `−` del negativo sea información y no un guion perdido.
function MarginIcon({ marginCents }: { marginCents: number }) {
  if (marginCents > 0) return <TrendingUp className="size-3.5 shrink-0" aria-hidden />;
  if (marginCents < 0) return <TrendingDown className="size-3.5 shrink-0" aria-hidden />;
  return <Minus className="size-3.5 shrink-0" aria-hidden />;
}

function signedPrice(marginCents: number): string {
  const amount = formatPrice(Math.abs(marginCents));
  if (marginCents > 0) return `+${amount}`;
  if (marginCents < 0) return `−${amount}`;
  return amount;
}

// `null` no es 0: la celda dice que falta el dato, no que el margen sea cero (AC5).
function NoCost({ label = NO_COST_LABEL }: { label?: string }) {
  return <span className="text-muted-foreground text-sm">{label}</span>;
}

// Sin cabeceras ordenables: el orden es fijo («sin costo primero», luego nombre, luego id)
// porque lo primero que hay que resolver para responder «qué margen deja cada producto» es
// el producto al que le falta el costo (D-14, AC20).
export function getPricingColumns({
  canSetInitialCost,
  onSetInitialCost,
}: PricingColumnsOptions): ColumnDef<PricingRow>[] {
  const columns: ColumnDef<PricingRow>[] = [
    {
      accessorKey: 'name',
      header: 'Producto',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-muted-foreground font-mono text-xs">{row.original.sku}</p>
        </div>
      ),
    },
    {
      accessorKey: 'priceCents',
      header: 'Precio de venta',
      enableSorting: false,
      size: 140,
      // La división por 100 solo ocurre aquí, al pintar (AC27).
      cell: ({ row }) => (
        <span className="tabular-nums whitespace-nowrap">
          {formatPrice(row.original.priceCents)}
        </span>
      ),
    },
    {
      accessorKey: 'stock',
      header: 'Stock',
      enableSorting: false,
      size: 80,
      // El entero tal cual, negativo incluido: una sobreventa deja el stock bajo cero y
      // esconderlo borraría la evidencia, además de explicar un promedio «raro» (§10).
      cell: ({ row }) => <span className="tabular-nums">{row.original.stock}</span>,
    },
    {
      accessorKey: 'averageCostCents',
      header: 'Costo promedio',
      enableSorting: false,
      size: 150,
      cell: ({ row }) =>
        row.original.averageCostCents === null ? (
          <NoCost />
        ) : (
          <span className="tabular-nums whitespace-nowrap">
            {formatPrice(row.original.averageCostCents)}
          </span>
        ),
    },
    {
      accessorKey: 'marginCents',
      header: 'Margen',
      enableSorting: false,
      size: 140,
      cell: ({ row }) => {
        const { marginCents } = row.original;
        if (marginCents === null) return <NoCost label="—" />;

        return (
          <span
            className={`flex items-center gap-1.5 tabular-nums whitespace-nowrap ${marginTone(marginCents)}`}
          >
            <MarginIcon marginCents={marginCents} />
            {signedPrice(marginCents)}
            {marginCents < 0 ? (
              <span className="sr-only">Se vende por debajo del costo</span>
            ) : null}
          </span>
        );
      },
    },
    {
      accessorKey: 'marginPercent',
      header: 'Margen %',
      enableSorting: false,
      size: 120,
      cell: ({ row }) => {
        const { marginPercent, marginCents } = row.original;
        // `null` con costo registrado significa precio 0: sin base no hay porcentaje, y
        // decirlo es más honesto que pintar un 0 % o un ∞ (D-7).
        if (marginPercent === null) {
          return <NoCost label={marginCents === null ? '—' : 'Sin precio'} />;
        }

        return (
          <span className={`tabular-nums whitespace-nowrap ${marginTone(marginPercent)}`}>
            {marginPercent > 0 ? '+' : marginPercent < 0 ? '−' : ''}
            {Math.abs(marginPercent).toFixed(1)} %
          </span>
        );
      },
    },
  ];

  // Sin `pricing.set_initial_cost` no se añade la columna: quien solo tiene `finance.read`
  // ve la tabla y ni siquiera una cabecera de acciones vacía (AC4).
  if (!canSetInitialCost) return columns;

  columns.push({
    id: 'actions',
    header: () => <span className="sr-only">Acciones</span>,
    enableSorting: false,
    size: 180,
    // La acción solo se ofrece sobre las filas sin costo: fijarlo dos veces es
    // imposible por diseño, así que un botón activo ahí sería un 409 anunciado (D-4).
    cell: ({ row }) =>
      row.original.averageCostCents === null ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onSetInitialCost(row.original)}>
            Establecer costo inicial
            <span className="sr-only"> de {row.original.name}</span>
          </Button>
        </div>
      ) : null,
  });

  return columns;
}
