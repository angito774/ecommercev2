import { ArrowDownRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/modules/products/lib/price';

import {
  CONFIRMED_SALES_CARD_TITLE,
  CONFIRMED_SALES_HINT,
  DECLARABLE_SALES_CARD_TITLE,
  DECLARABLE_SALES_HINT,
  DECLARABLE_SALES_KIND_LABELS,
  DECLARABLE_SALES_NET_CREDIT_LABEL,
  EMPTY_DECLARABLE_SALES_MESSAGE,
  EMPTY_PURCHASE_IGV_MESSAGE,
  FINANCE_SUMMARY_ERROR_MESSAGE,
  PURCHASE_IGV_CARD_TITLE,
  PURCHASE_IGV_CREDITABLE_LABEL,
  PURCHASE_IGV_NON_CREDITABLE_LABEL,
} from '../constants';
import type {
  DeclarableSales,
  FinanceSummary,
  PurchaseIgvTotals,
} from '../types/finance.types';

// Cuatro columnas desde que el resultado del período dejó de ser una card y pasó a ser el
// bloque de utilidad de ancho completo (spec 027, T17, D-12): con cuatro cards, cuatro
// columnas llenan la fila exacta y ninguna queda suelta en una segunda.
//
// Constante compartida y no la misma cadena escrita dos veces: los esqueletos y las
// cards tienen que caer en la misma rejilla o el bloque salta de tamaño al cargar.
const CARDS_GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4';

function SummaryCard({
  title,
  value,
  footer,
}: {
  title: string;
  value: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {footer}
      </CardContent>
    </Card>
  );
}

// El signo se comunica con icono y etiqueta además del
// color, porque solo color es inaccesible para daltonismo y en impresión (spec 017, AC9).
// Aquí el negativo es una venta declarable en crédito neto —las notas de crédito del
// rango superan lo emitido en él—, y con el glifo «−» a secas en `text-xs` se lee como un
// importe positivo más. El icono escala con la tipografía del contexto (`size-[1em]`)
// para servir tanto al valor principal de la card como a la fila del desglose.
function NetCreditAmount({ amountCents }: { amountCents: number }) {
  return (
    <span className="text-destructive inline-flex items-center gap-1">
      <ArrowDownRight className="size-[1em] shrink-0" aria-hidden />
      <span className="tabular-nums">{formatPrice(amountCents)}</span>
      <span className="text-xs font-medium">{DECLARABLE_SALES_NET_CREDIT_LABEL}</span>
    </span>
  );
}

// Los dos números **nunca** se presentan sumados (AC14, D-10): el valor principal de la
// card es solo el que da derecho a crédito fiscal, y el resto se publica aparte con su
// propia etiqueta. Un único total invitaría a descontar IGV de boletas, que es
// exactamente la infracción que la regla evita.
function PurchaseIgvFooter({ purchaseIgv }: { purchaseIgv: PurchaseIgvTotals }) {
  const { creditableCount, nonCreditableCents, nonCreditableCount } = purchaseIgv;

  // Los dos recuentos solo cuentan filas con `igv_cents is not null`, así que esta rama
  // significa «no hay IGV de compras que mostrar», no «no hay comprobantes»: un rango de
  // puros recibos por honorarios entra aquí con sus comprobantes declarados. El copy lo
  // dice así. No es un error ni una carga: es S/ 0.00 con su estado vacío (AC15).
  if (creditableCount === 0 && nonCreditableCount === 0) {
    return <p className="text-muted-foreground text-xs">{EMPTY_PURCHASE_IGV_MESSAGE}</p>;
  }

  return (
    <div className="text-muted-foreground space-y-0.5 text-xs">
      <p>
        {PURCHASE_IGV_CREDITABLE_LABEL} · {creditableCount}{' '}
        {creditableCount === 1 ? 'comprobante' : 'comprobantes'}
      </p>
      {/* La línea solo aparece cuando hay algo que decir: sin IGV no deducible, una
          línea con S/ 0.00 sería ruido. */}
      {nonCreditableCount > 0 ? (
        <p>
          {PURCHASE_IGV_NON_CREDITABLE_LABEL}: {formatPrice(nonCreditableCents)} ·{' '}
          {nonCreditableCount} {nonCreditableCount === 1 ? 'comprobante' : 'comprobantes'}
        </p>
      ) : null}
    </div>
  );
}

// Pie de card y no un bloque de ancho completo (D-8): son como mucho **dos** filas, y un
// `Card` entero con su título para dos barras es más cromo que información. El precedente
// es `PurchaseIgvFooter`; `ExpensesByCategory` tiene bloque propio porque son hasta ocho
// categorías.
function DeclarableSalesFooter({ declarableSales }: { declarableSales: DeclarableSales }) {
  const { byKind } = declarableSales;

  // Cero familias no es un error ni una carga: es que nadie emitió un comprobante en el
  // rango (AC14). El desglose oculta a propósito las familias sin filas, así que el copy
  // no sugiere que falten datos (§10).
  if (byKind.length === 0) {
    return <p className="text-muted-foreground text-xs">{EMPTY_DECLARABLE_SALES_MESSAGE}</p>;
  }

  // La base de la barra es el mayor importe **en valor absoluto** y no el total: una
  // familia puede quedar en negativo —la nota de crédito de una boleta del mes anterior
  // se emite en este—, y un porcentaje sobre el total daría anchos fuera de [0, 100] o
  // una división por cero cuando las dos familias se cancelan.
  const widest = Math.max(...byKind.map((row) => Math.abs(row.amountCents)));

  return (
    <ul className="space-y-1.5">
      {byKind.map((row) => {
        // La barra se dibuja sobre el valor absoluto, así que sin distinguir el signo
        // una familia en +1.000 y otra en −1.000 pintan dos barras llenas idénticas y un
        // total de S/ 0.00: la barra diría lo contrario de los datos.
        const isNegative = row.amountCents < 0;

        return (
          <li key={row.kind} className="space-y-1">
            <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
              <span>
                {DECLARABLE_SALES_KIND_LABELS[row.kind]} · {row.documentCount}{' '}
                {row.documentCount === 1 ? 'comprobante' : 'comprobantes'}
                {/* El recuento de correcciones solo aparece cuando explica algo: es la
                    razón de que el neto no sea el bruto. */}
                {row.adjustmentCount > 0
                  ? ` · ${row.adjustmentCount} ${row.adjustmentCount === 1 ? 'corrección' : 'correcciones'}`
                  : ''}
              </span>
              {isNegative ? (
                <NetCreditAmount amountCents={row.amountCents} />
              ) : (
                <span className="tabular-nums">{formatPrice(row.amountCents)}</span>
              )}
            </div>
            {/* El importe ya está escrito al lado, así que la barra es decorativa:
                `aria-hidden` evita que el lector lo diga dos veces. */}
            <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
              <div
                className={`h-full rounded-full ${isNegative ? 'bg-destructive' : 'bg-primary'}`}
                style={{
                  width: `${widest === 0 ? 0 : (Math.abs(row.amountCents) / widest) * 100}%`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SummaryCardSkeleton() {
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

type FinanceSummaryCardsProps = {
  summary: FinanceSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  message?: string;
  onRetry: () => void;
};

export function FinanceSummaryCards({
  summary,
  isLoading,
  isError,
  message,
  onRetry,
}: FinanceSummaryCardsProps) {
  // Un error no puede verse igual que una carga eterna: la fila no se queda en
  // esqueletos cuando la consulta falla (AC21).
  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="text-destructive text-sm font-medium">
            {message ?? FINANCE_SUMMARY_ERROR_MESSAGE}
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !summary) {
    return (
      <div className={CARDS_GRID}>
        {/* Cuatro, tantos como cards: el esqueleto tiene que anticipar la rejilla real, o
            el bloque salta de tamaño al llegar los datos (AC22). */}
        {Array.from({ length: 4 }, (_, index) => (
          <SummaryCardSkeleton key={`summary-skeleton-${index}`} />
        ))}
      </div>
    );
  }

  return (
    <div className={CARDS_GRID}>
      {/* Solo cambia la etiqueta: el importe es el de siempre, `sum(amount_total_cents)`
          de los pedidos `paid`, y el campo del contrato sigue siendo `revenueCents`
          (D-3, AC3). */}
      <SummaryCard
        title={CONFIRMED_SALES_CARD_TITLE}
        value={formatPrice(summary.revenueCents)}
        footer={
          <p className="text-muted-foreground text-xs">
            {CONFIRMED_SALES_HINT} · {summary.orderCount}{' '}
            {summary.orderCount === 1 ? 'pedido pagado' : 'pedidos pagados'}
          </p>
        }
      />
      {/* Al lado de las confirmadas y no al final: las dos cifras de ventas se leen
          comparándolas, y con tres columnas caben juntas en la primera fila (D-9). */}
      <SummaryCard
        title={DECLARABLE_SALES_CARD_TITLE}
        // Es la única de las cinco cards que puede quedar en negativo, así que sin icono
        // ni etiqueta se leería como un importe positivo más en la fila (spec 017, AC9).
        value={
          summary.declarableSales.amountCents < 0 ? (
            <NetCreditAmount amountCents={summary.declarableSales.amountCents} />
          ) : (
            formatPrice(summary.declarableSales.amountCents)
          )
        }
        footer={
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">{DECLARABLE_SALES_HINT}</p>
            <DeclarableSalesFooter declarableSales={summary.declarableSales} />
          </div>
        }
      />
      <SummaryCard
        title="Gastos operativos"
        value={formatPrice(summary.expensesCents)}
        footer={
          <p className="text-muted-foreground text-xs">
            {summary.expenseCount}{' '}
            {summary.expenseCount === 1 ? 'gasto registrado' : 'gastos registrados'}
          </p>
        }
      />
      {/* Card propia y no un sumando del resultado: el IGV de compras es el insumo
          del crédito fiscal, no un gasto más (§3). */}
      <SummaryCard
        title={PURCHASE_IGV_CARD_TITLE}
        value={formatPrice(summary.purchaseIgv.creditableCents)}
        footer={<PurchaseIgvFooter purchaseIgv={summary.purchaseIgv} />}
      />
    </div>
  );
}
