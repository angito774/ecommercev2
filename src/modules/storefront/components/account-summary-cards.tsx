'use client';

import { CalendarDays, CreditCard, type LucideIcon, RefreshCw, ShoppingBag, TriangleAlert } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrderHistory } from '@/modules/orders/hooks/use-order-history';
import { currentMonthRange } from '@/modules/orders/lib/order-history-range';
import type { OrderHistoryRange } from '@/modules/orders/types/order.types';
import { useSavedCards } from '@/modules/payments/hooks/use-saved-cards';

import { MonthlySpendBar } from './monthly-spend-bar';

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

type AccountSummaryCardsProps = {
  /** ISO. Llega del servidor (`profile.createdAt`): Clerk es quien lo sabe. */
  memberSince: string;
};

// Las tres cifras salen de los DOS hooks que la página ya monta más abajo
// (`OrderHistory` y `SavedCards`) con sus mismas claves de caché: TanStack sirve el
// valor de la caché y no se abre ninguna petición adicional. Un endpoint
// `/api/account/summary` habría sido contrato nuevo para números que ya están en el
// cliente (spec 013, §8).
export function AccountSummaryCards({ memberSince }: AccountSummaryCardsProps) {
  // Inicializador perezoso, igual que `OrderHistory`: `currentMonthRange()` lee el
  // reloj y llamarlo en cada render devolvería un objeto nuevo, cambiando la clave
  // de la consulta y provocando refetch en bucle (§10).
  const [range] = useState<OrderHistoryRange>(currentMonthRange);

  const orders = useOrderHistory(range);
  const { query: cards } = useSavedCards();

  const monthOrders = orders.data?.data;

  return (
    <div className="mb-[clamp(2rem,4vw,3rem)] flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={ShoppingBag}
          // «Este mes» y no «pedidos» a secas: `useOrderHistory` exige un rango y la
          // sección se inicializa en el mes en curso, así que presentar este número
          // como un total histórico sería falso (spec 013, §8).
          label="pedidos este mes"
          isPending={orders.isPending}
          error={orders.isError ? orders.error : null}
          onRetry={() => void orders.refetch()}
        >
          {monthOrders?.length ?? 0}
        </SummaryCard>

        <SummaryCard
          icon={CreditCard}
          label={cards.data?.data.length === 1 ? 'tarjeta guardada' : 'tarjetas guardadas'}
          isPending={cards.isPending}
          // Las dos consultas son independientes y una puede fallar sola: cada
          // tarjeta trae su propio estado en vez de tumbar la fila entera.
          error={cards.isError ? cards.error : null}
          onRetry={() => void cards.refetch()}
        >
          {cards.data?.data.length ?? 0}
        </SummaryCard>

        <SummaryCard icon={CalendarDays} label="miembro desde">
          <span className="text-[1.25rem]">{dateFormatter.format(new Date(memberSince))}</span>
        </SummaryCard>
      </div>

      {/* Se pinta solo cuando hay datos: mientras carga, el esqueleto de la primera
          tarjeta ya dice que falta información, y un carril de barras vacío
          parecería un mes sin compras. */}
      {monthOrders ? <MonthlySpendBar orders={monthOrders} /> : null}
    </div>
  );
}

type SummaryCardProps = {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  isPending?: boolean;
  error?: Error | null;
  onRetry?: () => void;
};

function SummaryCard({ icon: Icon, label, children, isPending, error, onRetry }: SummaryCardProps) {
  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-[22px] border p-[clamp(1.25rem,3vw,1.5rem)]">
      <span className="bg-nx-accent-soft text-primary grid size-11 place-items-center rounded-xl">
        <Icon className="size-5" aria-hidden />
      </span>

      {isPending ? (
        <Skeleton className="h-9 w-24 rounded-full" />
      ) : error ? (
        // El error no se traga: se enseña el mensaje que ya dejó legible el
        // interceptor de axios, con su reintento propio.
        <div className="space-y-2">
          <p className="text-muted-foreground flex items-start gap-2 text-[13px] leading-snug">
            <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
            {error.message}
          </p>
          {onRetry ? (
            <Button
              type="button"
              onClick={onRetry}
              variant="outline"
              size="sm"
              className="h-11 rounded-full px-4"
            >
              <RefreshCw className="size-4" aria-hidden />
              Reintentar
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="font-nx-display text-[1.75rem] leading-none font-semibold tracking-[-0.035em] tabular-nums">
          {children}
        </p>
      )}

      <p className="text-nx-faint text-[13px]">{label}</p>
    </div>
  );
}
