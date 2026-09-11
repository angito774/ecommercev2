'use client';

import { RefreshCw, ShoppingBag, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountEmpty } from '@/modules/storefront/components/account-empty';

import { MAX_ORDER_HISTORY } from '../constants';
import { useOrderHistory } from '../hooks/use-order-history';
import { groupOrdersByDay } from '../lib/group-orders-by-day';
import { currentMonthRange } from '../lib/order-history-range';
import type { OrderHistoryRange } from '../types/order.types';
import { OrderHistoryFilter } from './order-history-filter';
import { OrderHistoryRow } from './order-history-row';

const SKELETON_ROWS = 3;

// Único punto con estado de la sección: el rango. No hay store de Zustand porque
// tiene un solo consumidor y muere al desmontar la sección (D-9, regla 6 de
// docs/SETUP.md §4). Los datos son de servidor y viven en TanStack Query.
export function OrderHistory() {
  // Inicializador perezoso: `currentMonthRange()` lee el reloj, y llamarlo en cada
  // render devolvería un objeto nuevo que cambiaría la clave de la consulta.
  const [range, setRange] = useState<OrderHistoryRange>(currentMonthRange);

  const query = useOrderHistory(range);
  const orders = query.data?.data;

  const groups = useMemo(() => groupOrdersByDay(orders ?? []), [orders]);

  return (
    <div>
      <OrderHistoryFilter onChange={setRange} />

      <HistoryBody
        isPending={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        groups={groups}
        isFetching={query.isFetching}
        truncated={query.data?.meta.truncated ?? false}
      />
    </div>
  );
}

function HistoryBody({
  isPending,
  isError,
  error,
  onRetry,
  groups,
  isFetching,
  truncated,
}: {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  onRetry: () => void;
  groups: ReturnType<typeof groupOrdersByDay>;
  isFetching: boolean;
  truncated: boolean;
}) {
  if (isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-[92px] rounded-[22px]" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-border bg-card flex flex-col items-center gap-3 rounded-[22px] border p-[clamp(2rem,6vw,3.5rem)] text-center">
        <TriangleAlert className="text-destructive size-8" aria-hidden />
        <h3 className="text-lg font-semibold">No se pudo cargar tu historial</h3>
        <p className="text-muted-foreground max-w-prose text-sm">
          {error?.message ?? 'Inténtalo de nuevo en unos segundos.'}
        </p>
        <Button onClick={onRetry} variant="outline" className="mt-2 h-11 rounded-full px-5">
          <RefreshCw className="size-4" aria-hidden />
          Reintentar
        </Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <AccountEmpty
        icon={ShoppingBag}
        title="No hay compras en este periodo"
        body="Prueba con otro rango de fechas o empieza por el catálogo: tus pedidos aparecerán aquí con su estado y su detalle."
        ctaHref="/#catalogo"
        ctaLabel="Ver el catálogo"
      />
    );
  }

  return (
    <div
      // `placeholderData` mantiene la lista anterior mientras llega la nueva, así
      // que la sección no colapsa al cambiar de rango; la opacidad es la única
      // señal de que está cargando (AC15).
      aria-busy={isFetching}
      className={`space-y-8 transition-opacity ${isFetching ? 'opacity-60' : 'opacity-100'}`}
    >
      {truncated ? (
        // Sin este aviso, `meta.truncated` sería deuda muerta y el recorte
        // silencioso un bug de corrección (§10, D-5).
        <p
          role="status"
          className="border-border bg-secondary text-muted-foreground rounded-[18px] border p-4 text-sm leading-relaxed"
        >
          Este periodo tiene más de {MAX_ORDER_HISTORY} pedidos y solo se muestran los{' '}
          {MAX_ORDER_HISTORY} más recientes. Acota el rango de fechas para ver el resto.
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
            {/* `first-letter:uppercase`: `Intl` devuelve el día de la semana en
                minúscula en español y un encabezado no empieza así. */}
            <h3 className="text-[15px] font-semibold tracking-[-0.02em] first-letter:uppercase">
              {group.label}
            </h3>
            <span className="text-nx-faint text-xs">
              {group.orders.length} {group.orders.length === 1 ? 'pedido' : 'pedidos'}
            </span>
          </div>

          <ul className="space-y-3">
            {group.orders.map((order) => (
              <OrderHistoryRow key={order.id} order={order} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
