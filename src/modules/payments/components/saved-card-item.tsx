'use client';

import { CreditCard, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { cardBrandLabel, formatCardExpiry, isCardExpired } from '../lib/card-display';
import type { SavedCard } from '../types/payment-method.types';

type SavedCardItemProps = {
  card: SavedCard;
  onDelete: (card: SavedCard) => void;
};

// El diálogo de confirmación lo posee la lista, no cada fila: montar un AlertDialog
// por tarjeta duplicaría el mismo árbol cinco veces para enseñar uno solo. Esta fila
// solo avisa de la intención (`onDelete`) y no sabe cómo se confirma.
export function SavedCardItem({ card, onDelete }: SavedCardItemProps) {
  const brand = cardBrandLabel(card.brand);
  const expiry = formatCardExpiry(card.expMonth, card.expYear);
  // En el navegador y no en el servidor: la lista solo existe tras la consulta de
  // TanStack Query, así que no hay render de servidor con el que desincronizarse.
  const expired = isCardExpired(card.expMonth, card.expYear);

  return (
    <li className="border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[22px] border p-4">
      <span className="bg-nx-accent-soft text-primary grid size-11 shrink-0 place-items-center rounded-xl">
        <CreditCard className="size-5" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[15.5px] font-semibold tracking-[-0.025em]">
          {brand}{' '}
          {/* Los cuatro últimos dígitos son lo que distingue dos tarjetas de la
              misma marca. Del resto del número no guardamos nada (D-3). */}
          <span className="tabular-nums">•••• {card.last4}</span>
        </p>
        <p className="text-nx-faint mt-1.5 text-xs tabular-nums">Caduca {expiry}</p>
      </div>

      {expired ? (
        // Vencida sigue siendo eliminable: el distintivo informa, no bloquea (AC14).
        <Badge variant="destructive">Vencida</Badge>
      ) : null}

      <Button
        variant="outline"
        // `h-11` es el mínimo táctil de 44 px que pide AC19.
        className="h-11 rounded-full px-4"
        onClick={() => onDelete(card)}
      >
        <Trash2 className="size-4" aria-hidden />
        Eliminar
        <span className="sr-only">
          {' '}
          la tarjeta {brand} terminada en {card.last4}
        </span>
      </Button>
    </li>
  );
}
