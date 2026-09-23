import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/modules/products/lib/price';

import {
  NO_REVENUE_MESSAGE,
  PARTIAL_COGS_BADGE_LABEL,
  PARTIAL_COGS_HREF,
  PARTIAL_COGS_LINK_LABEL,
  PARTIAL_COGS_NOTE,
  PERIOD_PROFIT_BLOCK_TITLE,
  PERIOD_PROFIT_ERROR_MESSAGE,
  PROFIT_BREAK_EVEN_LABEL,
  PROFIT_COGS_LABEL,
  PROFIT_GROSS_LABEL,
  PROFIT_IGV_EXCLUDED_NOTE,
  PROFIT_INCOME_TAX_HINT,
  PROFIT_INCOME_TAX_LABEL,
  PROFIT_NEGATIVE_LABEL,
  PROFIT_NET_EXPENSES_NOTE,
  PROFIT_NET_LABEL,
  PROFIT_NET_REVENUE_HINT,
  PROFIT_NET_REVENUE_LABEL,
  PROFIT_OPERATING_EXPENSES_LABEL,
  PROFIT_OPERATING_LABEL,
  PROFIT_PAYROLL_LABEL,
  PROFIT_POSITIVE_LABEL,
} from '../constants';
import type { PeriodProfit, ProfitLevel } from '../types/finance.types';

const percentFormatter = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

// Una fila de la cascada que **no** es un nivel: el ingreso base y los cuatro
// sustraendos. Se publican entre los niveles porque tres números sin las restas que los
// separan no se pueden auditar a ojo (§6.1).
function ProfitRow({
  label,
  amountCents,
  hint,
  subtrahend = false,
}: {
  label: string;
  amountCents: number;
  hint?: React.ReactNode;
  subtrahend?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
      </div>
      {/* El «−» delante del sustraendo es la resta, no el signo del importe: un gasto de
          S/ 100 se resta, y escribirlo «-S/ 100.00» diría que el gasto es negativo. */}
      <p className="text-muted-foreground shrink-0 text-sm tabular-nums">
        {subtrahend ? '− ' : ''}
        {formatPrice(amountCents)}
      </p>
    </div>
  );
}

// El signo con etiqueta, icono y color —los tres, nunca solo color (AC23)—. Mismo
// criterio que el `NetResult` del spec 017 al que este bloque reemplaza.
function ProfitLevelRow({
  label,
  level,
  emphasis = false,
  partial = false,
}: {
  label: string;
  level: ProfitLevel;
  emphasis?: boolean;
  // Solo la utilidad bruta puede llevarlo: es el único nivel que agrega
  // `cost_cents_snapshot`, y el aviso debe leerse junto al número que califica, no dos
  // niveles más abajo (revisión del spec 027, hallazgo menor).
  partial?: boolean;
}) {
  const { amountCents, marginPercent } = level;

  const Icon = amountCents === 0 ? Minus : amountCents > 0 ? ArrowUpRight : ArrowDownRight;
  const signLabel =
    amountCents === 0
      ? PROFIT_BREAK_EVEN_LABEL
      : amountCents > 0
        ? PROFIT_POSITIVE_LABEL
        : PROFIT_NEGATIVE_LABEL;
  const tone =
    amountCents === 0
      ? 'text-muted-foreground'
      : amountCents > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-destructive';

  return (
    <div className="border-t pt-2.5 pb-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <p className={`flex items-center gap-1.5 font-medium ${emphasis ? 'text-base' : 'text-sm'}`}>
          {label}
          {/* El badge, no el detalle: «cuántas líneas» y el enlace siguen en
              `PartialCogsNotice`, más abajo. Esto es solo la señal junto al número. */}
          {partial ? (
            <span className="text-destructive inline-flex items-center gap-0.5 text-xs font-normal">
              <AlertTriangle className="size-3" aria-hidden />
              {PARTIAL_COGS_BADGE_LABEL}
            </span>
          ) : null}
        </p>
        <p
          className={`shrink-0 font-semibold tabular-nums ${emphasis ? 'text-2xl' : 'text-lg'}`}
        >
          {formatPrice(amountCents)}
        </p>
      </div>
      <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center justify-end gap-1 text-xs">
        <span className={`flex items-center gap-0.5 font-medium ${tone}`}>
          <Icon className="size-3.5" aria-hidden />
          {signLabel}
        </span>
        {/* `null` no es un fallo: es que el ingreso neto del rango no es positivo y sin
            base no hay porcentaje. Nunca «0 %», `Infinity` ni `NaN` (AC21, AC22). */}
        {marginPercent === null ? (
          <span>· {NO_REVENUE_MESSAGE}</span>
        ) : (
          <span>· margen {percentFormatter.format(marginPercent)} %</span>
        )}
      </p>
    </div>
  );
}

// Solo con `uncostedLineCount > 0` (AC12, AC13). El conteo va en el aviso porque «faltan
// 3 de 400» y «faltan 380 de 400» piden acciones distintas.
function PartialCogsNotice({ uncostedLineCount }: { uncostedLineCount: number }) {
  return (
    <div className="border-destructive/30 bg-destructive/5 space-y-2 rounded-md border p-3">
      <p className="text-destructive flex items-center gap-1.5 text-xs font-medium">
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
        {PARTIAL_COGS_BADGE_LABEL} · {uncostedLineCount}{' '}
        {uncostedLineCount === 1 ? 'línea sin costo' : 'líneas sin costo'}
      </p>
      <p className="text-muted-foreground text-xs">{PARTIAL_COGS_NOTE}</p>
      {/* El enlace es la acción: la pantalla que avisa no es la que lo resuelve. */}
      <Button variant="outline" size="sm" asChild>
        <Link href={PARTIAL_COGS_HREF}>{PARTIAL_COGS_LINK_LABEL}</Link>
      </Button>
    </div>
  );
}

function PeriodProfitSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={`profit-skeleton-${index}`} className="flex justify-between gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

type PeriodProfitCardProps = {
  profit: PeriodProfit | undefined;
  isLoading: boolean;
  isError: boolean;
  message?: string;
  onRetry: () => void;
};

// Presentacional puro: recibe `PeriodProfit` por props y no consulta nada (AC30). El único
// módulo compartido que importa es el de formato de precio.
//
// Bloque propio de ancho completo y no tres cards más en la rejilla (D-12): los niveles se
// leen **en cascada**, con sus restas intermedias entre medias, y en cards sueltas se
// pierde justo eso —de dónde sale cada número—.
export function PeriodProfitCard({
  profit,
  isLoading,
  isError,
  message,
  onRetry,
}: PeriodProfitCardProps) {
  // Un error no puede verse igual que una carga eterna (AC28).
  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="text-destructive text-sm font-medium">
            {message ?? PERIOD_PROFIT_ERROR_MESSAGE}
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{PERIOD_PROFIT_BLOCK_TITLE}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !profit ? (
          <PeriodProfitSkeleton />
        ) : (
          <>
            <div>
              <ProfitRow
                label={PROFIT_NET_REVENUE_LABEL}
                amountCents={profit.netRevenueCents}
                hint={PROFIT_NET_REVENUE_HINT}
              />
              <ProfitRow
                label={PROFIT_COGS_LABEL}
                amountCents={profit.cogs.amountCents}
                subtrahend
                hint={`${profit.cogs.lineCount} ${
                  profit.cogs.lineCount === 1 ? 'línea vendida' : 'líneas vendidas'
                }`}
              />
              <ProfitLevelRow
                label={PROFIT_GROSS_LABEL}
                level={profit.gross}
                partial={profit.cogs.uncostedLineCount > 0}
              />

              <ProfitRow
                label={PROFIT_OPERATING_EXPENSES_LABEL}
                amountCents={profit.operatingExpensesCents}
                subtrahend
              />
              <ProfitRow
                label={PROFIT_PAYROLL_LABEL}
                amountCents={profit.payrollCents}
                subtrahend
                hint={`${profit.payrollPaymentCount} ${
                  profit.payrollPaymentCount === 1 ? 'pago registrado' : 'pagos registrados'
                }`}
              />
              <ProfitLevelRow label={PROFIT_OPERATING_LABEL} level={profit.operating} />

              <ProfitRow
                label={PROFIT_INCOME_TAX_LABEL}
                amountCents={profit.incomeTaxCents}
                subtrahend
                hint={PROFIT_INCOME_TAX_HINT}
              />
              <ProfitLevelRow label={PROFIT_NET_LABEL} level={profit.net} emphasis />
            </div>

            {/* Solo cuando hay algo que advertir: con cero líneas sin costo, el aviso no se
                pinta (AC13). */}
            {profit.cogs.uncostedLineCount > 0 ? (
              <PartialCogsNotice uncostedLineCount={profit.cogs.uncostedLineCount} />
            ) : null}

            <div className="text-muted-foreground space-y-2 border-t pt-3 text-xs">
              <p>{PROFIT_NET_EXPENSES_NOTE}</p>
              <p>{PROFIT_IGV_EXCLUDED_NOTE}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
