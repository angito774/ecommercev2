import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { NO_PREVIOUS_PERIOD_MESSAGE } from '../constants';

// `signDisplay: 'exceptZero'` deja el «+» delante de la subida sin ponérselo al 0,
// que no tiene signo que comunicar.
const percentFormatter = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

// El signo se comunica con icono y texto además del color: solo color es
// inaccesible para daltonismo y en impresión (D-16, AC19).
function ChangeIndicator({ changePercent }: { changePercent: number | null }) {
  if (changePercent === null) {
    return <p className="text-muted-foreground text-xs">{NO_PREVIOUS_PERIOD_MESSAGE}</p>;
  }

  const Icon = changePercent === 0 ? Minus : changePercent > 0 ? ArrowUp : ArrowDown;
  const tone =
    changePercent === 0
      ? 'text-muted-foreground'
      : changePercent > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-destructive';

  return (
    <p className="text-muted-foreground flex items-center gap-1 text-xs">
      <span className={`flex items-center gap-0.5 font-medium ${tone}`}>
        <Icon className="size-3.5" aria-hidden />
        {percentFormatter.format(changePercent)} %
      </span>
      vs. período anterior
    </p>
  );
}

type KpiCardProps = {
  title: string;
  // Ya formateado por quien llama: uno de los tres KPI es dinero y los otros dos no,
  // así que la tarjeta no tiene por qué saber cuál es cuál (SRP).
  value: string;
  changePercent: number | null;
};

export function KpiCard({ title, value, changePercent }: KpiCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <ChangeIndicator changePercent={changePercent} />
      </CardContent>
    </Card>
  );
}

// Esqueleto propio y no uno genérico: reproduce la altura exacta de la tarjeta para
// que la primera carga no empuje el resto del dashboard hacia abajo (AC17).
export function KpiCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-40" />
      </CardContent>
    </Card>
  );
}
