import { ArrowDownLeft, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/modules/products/lib/price';

import {
  EMPTY_INCOME_TAX_MESSAGE,
  EMPTY_TAXES_IGV_MESSAGE,
  FINANCE_TAXES_ERROR_MESSAGE,
  IGV_CREDIT_HINT,
  IGV_CREDIT_LABEL,
  IGV_DEBIT_LABEL,
  IGV_NET_CREDIT_BALANCE_LABEL,
  IGV_NET_PAYABLE_LABEL,
  IGV_NEGATIVE_AMOUNT_LABEL,
  IGV_NET_ZERO_LABEL,
  INCOME_TAX_BASE_LABEL,
  INCOME_TAX_BASE_NEGATIVE_LABEL,
  INCOME_TAX_ESTIMATE_LABEL,
  NEGATIVE_INCOME_TAX_BASE_MESSAGE,
  TAXES_IGV_BLOCK_TITLE,
  TAXES_INCOME_TAX_BLOCK_TITLE,
} from '../constants';
import { RER_RATE_BASIS_POINTS } from '../lib/rer';
import type { FinanceTaxes, IgvSettlement, IncomeTaxEstimate } from '../types/finance.types';

const rateFormatter = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

// La tasa **no se escribe a mano** (D-8): se formatea desde la única constante que la
// define, así que corregir el valor normativo pendiente (§5.1.1) mueve también el rótulo.
const RER_RATE_LABEL = `${rateFormatter.format(RER_RATE_BASIS_POINTS / 100)} %`;

// Dos bloques y no cuatro cards sueltas (D-12): son cuatro números en total y cada par se
// lee junto. Constante compartida para que los esqueletos caigan en la misma rejilla y el
// bloque no salte de tamaño al cargar.
const BLOCKS_GRID = 'grid gap-4 lg:grid-cols-2';

const countLabel = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

// El signo de un importe negativo se comunica con icono, etiqueta y color —los tres— y
// nunca solo con el «-» de `formatPrice`, que en `text-sm` se lee como un importe
// positivo más (017, AC9). Misma forma que `NetCreditAmount` de
// `finance-summary-cards.tsx`, pero copia local y no un componente compartido: el spec
// fija aquel archivo como intocado (§7) y cada cifra nombra su negativo con su propio
// copy —el IGV corregido no es una venta en crédito neto—, así que lo compartible sería
// el marcado de tres líneas, no el significado.
function NegativeAmount({ amountCents, label }: { amountCents: number; label: string }) {
  return (
    <span className="text-destructive inline-flex items-center gap-1">
      <ArrowDownRight className="size-[1em] shrink-0" aria-hidden />
      <span className="tabular-nums">{formatPrice(amountCents)}</span>
      <span className="text-xs font-medium">{label}</span>
    </span>
  );
}

// Barra en CSS sobre el mayor de los dos en **valor absoluto** y no sobre su suma: el
// débito puede quedar negativo —las notas de crédito del rango superan lo emitido en él— y
// un porcentaje sobre el total daría anchos fuera de [0, 100] o una división por cero
// cuando los dos lados se cancelan. Mismo criterio que `DeclarableSalesFooter` en las dos
// cosas que allí dependen del signo: la base de la barra en valor absoluto y el importe
// negativo con icono, etiqueta y color.
function AmountBar({
  label,
  hint,
  negativeLabel,
  amountCents,
  widestCents,
}: {
  label: string;
  hint: string;
  negativeLabel: string;
  amountCents: number;
  widestCents: number;
}) {
  const isNegative = amountCents < 0;

  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        {isNegative ? (
          <NegativeAmount amountCents={amountCents} label={negativeLabel} />
        ) : (
          <span className="tabular-nums">{formatPrice(amountCents)}</span>
        )}
      </div>
      <p className="text-muted-foreground text-xs">{hint}</p>
      {/* El importe ya está escrito al lado, así que la barra es decorativa:
          `aria-hidden` evita que el lector lo diga dos veces. */}
      <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
        <div
          className={`h-full rounded-full ${isNegative ? 'bg-destructive' : 'bg-primary'}`}
          style={{
            width: `${widestCents === 0 ? 0 : (Math.abs(amountCents) / widestCents) * 100}%`,
          }}
        />
      </div>
    </li>
  );
}

// El servidor publica `netCents` con signo y la etiqueta la elige la vista (D-5). Las tres
// ramas son obligatorias: **nunca** un «IGV por pagar» en negativo, y el cero tiene copy
// propio porque «S/ 0.00 por pagar» se lee como un importe pendiente (AC16).
//
// El signo se comunica con etiqueta, icono y color —los tres—, porque solo color es
// inaccesible para daltonismo y en impresión (017, AC9). La flecha va hacia fuera en «por
// pagar» y hacia dentro en «saldo a favor»: aquí no mide bueno contra malo como en la card
// de resultado, sino en qué dirección se mueve el dinero.
function IgvNet({ netCents }: { netCents: number }) {
  const isPayable = netCents > 0;
  const isCreditBalance = netCents < 0;

  const Icon = isPayable ? ArrowUpRight : isCreditBalance ? ArrowDownLeft : Minus;
  const label = isPayable
    ? IGV_NET_PAYABLE_LABEL
    : isCreditBalance
      ? IGV_NET_CREDIT_BALANCE_LABEL
      : IGV_NET_ZERO_LABEL;
  const tone = isPayable
    ? 'text-destructive'
    : isCreditBalance
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-muted-foreground';

  return (
    <div className="space-y-1">
      {/* El valor absoluto: el signo ya lo dicen la etiqueta, el icono y el color, y
          «-S/ 500.00 de saldo a favor» diría lo contrario de lo que es (AC16). */}
      <p className="text-2xl font-semibold tracking-tight tabular-nums">
        {formatPrice(Math.abs(netCents))}
      </p>
      <p className={`flex items-center gap-1 text-xs font-medium ${tone}`}>
        <Icon className="size-3.5" aria-hidden />
        {label}
      </p>
    </div>
  );
}

function IgvBlock({ igv }: { igv: IgvSettlement }) {
  const { debitCents, debitDocumentCount, debitAdjustmentCount, creditCents, creditReceiptCount } =
    igv;

  const isEmpty =
    debitDocumentCount === 0 && debitAdjustmentCount === 0 && creditReceiptCount === 0;

  const widestCents = Math.max(Math.abs(debitCents), Math.abs(creditCents));

  const documentsLabel = countLabel(debitDocumentCount, 'comprobante', 'comprobantes');
  // El recuento de correcciones solo aparece cuando explica algo: es la razón de que el
  // débito no sea el bruto.
  const debitHint =
    debitAdjustmentCount === 0
      ? documentsLabel
      : `${documentsLabel} · ${countLabel(debitAdjustmentCount, 'corrección', 'correcciones')}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {TAXES_IGV_BLOCK_TITLE}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <IgvNet netCents={igv.netCents} />

        {/* Un rango sin comprobantes y sin compras con crédito no es un error ni una
            carga: es S/ 0.00 con su copy (AC21). */}
        {isEmpty ? (
          <p className="text-muted-foreground text-xs">{EMPTY_TAXES_IGV_MESSAGE}</p>
        ) : (
          <ul className="space-y-3">
            <AmountBar
              label={IGV_DEBIT_LABEL}
              hint={debitHint}
              negativeLabel={IGV_NEGATIVE_AMOUNT_LABEL}
              amountCents={debitCents}
              widestCents={widestCents}
            />
            {/* El crédito suma `igv_cents` de compras y hoy no puede quedar negativo,
                pero la etiqueta es obligatoria igual: el día que lo sea, el importe no
                debe caer en la rama que solo lo pinta en rojo. */}
            <AmountBar
              label={IGV_CREDIT_LABEL}
              hint={`${IGV_CREDIT_HINT} · ${countLabel(creditReceiptCount, 'comprobante', 'comprobantes')}`}
              negativeLabel={IGV_NEGATIVE_AMOUNT_LABEL}
              amountCents={creditCents}
              widestCents={widestCents}
            />
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function IncomeTaxBlock({ incomeTax }: { incomeTax: IncomeTaxEstimate }) {
  const { baseCents, estimatedCents } = incomeTax;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {TAXES_INCOME_TAX_BLOCK_TITLE}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatPrice(estimatedCents)}
          </p>
          <p className="text-muted-foreground text-xs">
            {INCOME_TAX_ESTIMATE_LABEL} · {RER_RATE_LABEL}
          </p>
        </div>

        {/* La base se publica con su signo real aunque el estimado sea `0` (AC18): con
            base cero no hay nada que estimar y se dice; con base negativa se muestra tal
            cual, porque esconderla destruiría el dato crudo. Las dos acaban en un
            estimado de `0` y por eso cada una lleva su frase: sin ellas, «no hubo
            actividad» y «se corrigió más de lo que se emitió» se leen igual. */}
        {baseCents === 0 ? (
          <p className="text-muted-foreground text-xs">{EMPTY_INCOME_TAX_MESSAGE}</p>
        ) : (
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground text-xs">{INCOME_TAX_BASE_LABEL}</span>
              {baseCents < 0 ? (
                <NegativeAmount
                  amountCents={baseCents}
                  label={INCOME_TAX_BASE_NEGATIVE_LABEL}
                />
              ) : (
                <span className="tabular-nums">{formatPrice(baseCents)}</span>
              )}
            </div>
            {baseCents < 0 ? (
              <p className="text-muted-foreground text-xs">
                {NEGATIVE_INCOME_TAX_BASE_MESSAGE}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaxesBlockSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

type FinanceTaxesCardsProps = {
  taxes: FinanceTaxes | undefined;
  isLoading: boolean;
  isError: boolean;
  message?: string;
  onRetry: () => void;
};

// Presentacional puro: recibe todo por props y no consulta nada (AC27).
export function FinanceTaxesCards({
  taxes,
  isLoading,
  isError,
  message,
  onRetry,
}: FinanceTaxesCardsProps) {
  // Un error no puede verse igual que una carga eterna: los bloques no se quedan en
  // esqueletos cuando la consulta falla (AC23).
  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="text-destructive text-sm font-medium">
            {message ?? FINANCE_TAXES_ERROR_MESSAGE}
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !taxes) {
    return (
      <div className={BLOCKS_GRID}>
        {Array.from({ length: 2 }, (_, index) => (
          <TaxesBlockSkeleton key={`taxes-skeleton-${index}`} />
        ))}
      </div>
    );
  }

  return (
    <div className={BLOCKS_GRID}>
      <IgvBlock igv={taxes.igv} />
      <IncomeTaxBlock incomeTax={taxes.incomeTax} />
    </div>
  );
}
