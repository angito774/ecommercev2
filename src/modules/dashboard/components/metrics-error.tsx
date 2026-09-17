'use client';

import { Button } from '@/components/ui/button';

import { DASHBOARD_ERROR_MESSAGE } from '../constants';

type MetricsErrorProps = {
  message?: string;
  onRetry: () => void;
};

// Las cuatro secciones del dashboard fallan a la vez —comparten una sola consulta
// (D-5)— y cada una tiene que ofrecer su reintento (AC17). Con cuatro copias del
// mismo bloque, la cuarta es la que acaba con otro texto: se extrae a la tercera
// repetición (CLAUDE.md §6).
export function MetricsError({ message, onRetry }: MetricsErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <p className="text-destructive text-sm font-medium">{message ?? DASHBOARD_ERROR_MESSAGE}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
