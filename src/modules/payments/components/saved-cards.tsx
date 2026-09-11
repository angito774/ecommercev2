'use client';

import { CreditCard, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountEmpty } from '@/modules/storefront/components/account-empty';

import { useSavedCards } from '../hooks/use-saved-cards';
import type { SavedCard } from '../types/payment-method.types';
import { AddCardButton } from './add-card-button';
import { DeleteCardDialog } from './delete-card-dialog';
import { SavedCardItem } from './saved-card-item';

type SavedCardsProps = {
  /** Llega como prop desde la page, que lee `searchParams` en el servidor (D-17). */
  justAdded: boolean;
};

const SKELETON_ROWS = 2;

// Único punto con estado de la sección: qué tarjeta está en el diálogo. No hay store
// de Zustand porque tiene un solo consumidor y muere al desmontar la sección
// (docs/SETUP.md §4, regla 6). Los datos son de servidor y viven en TanStack Query.
export function SavedCards({ justAdded }: SavedCardsProps) {
  const [target, setTarget] = useState<SavedCard | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { query, waiting, exhausted } = useSavedCards({ poll: justAdded });
  const cards = query.data?.data;

  function handleDelete(card: SavedCard) {
    setTarget(card);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <AddCardButton />

      {waiting ? (
        <p
          role="status"
          className="border-border bg-secondary text-muted-foreground flex items-center gap-2 rounded-[18px] border p-4 text-sm leading-relaxed"
        >
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          Guardando tu tarjeta… Esto tarda unos segundos y la lista se actualizará sola.
        </p>
      ) : null}

      {exhausted ? (
        // Estado terminal explícito: agotada la ventana hay que decirlo, porque
        // callar dejaría un spinner que ya no comprueba nada (D-16, AC13).
        <div
          role="status"
          className="border-border bg-card flex flex-col items-start gap-3 rounded-[18px] border p-4"
        >
          <p className="text-muted-foreground max-w-[62ch] text-sm leading-relaxed">
            Tu tarjeta está tardando más de lo normal en aparecer. No se ha perdido: si el
            registro se completó en Stripe, la verás en cuanto lo confirmemos.
          </p>
          <Button
            variant="outline"
            className="h-11 rounded-full px-5"
            onClick={() => void query.refetch()}
          >
            <RefreshCw className="size-4" aria-hidden />
            Volver a comprobar
          </Button>
        </div>
      ) : null}

      <CardsBody
        isPending={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        cards={cards}
        onDelete={handleDelete}
      />

      <DeleteCardDialog open={dialogOpen} onOpenChange={setDialogOpen} card={target} />
    </div>
  );
}

function CardsBody({
  isPending,
  isError,
  error,
  onRetry,
  cards,
  onDelete,
}: {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  onRetry: () => void;
  cards: SavedCard[] | undefined;
  onDelete: (card: SavedCard) => void;
}) {
  if (isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-[84px] rounded-[22px]" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-border bg-card flex flex-col items-center gap-3 rounded-[22px] border p-[clamp(2rem,6vw,3.5rem)] text-center">
        <TriangleAlert className="text-destructive size-8" aria-hidden />
        <h3 className="text-lg font-semibold">No se pudieron cargar tus tarjetas</h3>
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

  if (!cards || cards.length === 0) {
    // El botón «Agregar tarjeta» ya está arriba, así que el vacío no lo repite: lo
    // que aporta aquí es explicar para qué sirve guardarla (AC3). El CTA de
    // `AccountEmpty` es obligatorio (spec 006, D-9), así que apunta a lo único que
    // da sentido a guardar una tarjeta —la próxima compra— en vez de repetir el
    // genérico «Ver el catálogo» de las otras secciones.
    return (
      <AccountEmpty
        icon={CreditCard}
        title="Todavía no has guardado ninguna tarjeta"
        body="Guárdala con el botón de arriba y la próxima compra será más rápida. El formulario lo abre Stripe: aquí solo verás la marca y los cuatro últimos dígitos."
        ctaHref="/#catalogo"
        ctaLabel="Empezar una compra"
      />
    );
  }

  return (
    <ul className="space-y-3">
      {cards.map((card) => (
        <SavedCardItem key={card.id} card={card} onDelete={onDelete} />
      ))}
    </ul>
  );
}
