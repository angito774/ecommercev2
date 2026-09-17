'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/modules/products/lib/price';

import { EMPTY_TOP_PRODUCTS_MESSAGE, TOP_PRODUCTS_LIMIT } from '../constants';
import type { TopProductRow } from '../types/dashboard.types';

import { MetricsError } from './metrics-error';

type TopProductsListProps = {
  products: TopProductRow[];
  isLoading: boolean;
  isError: boolean;
  message?: string;
  onRetry: () => void;
};

function TopProductsSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: TOP_PRODUCTS_LIMIT }, (_, index) => (
        <li key={index} className="flex items-center gap-3">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </li>
      ))}
    </ul>
  );
}

export function TopProductsList({
  products,
  isLoading,
  isError,
  message,
  onRetry,
}: TopProductsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top {TOP_PRODUCTS_LIMIT} por ingresos</CardTitle>
      </CardHeader>
      <CardContent>
        {isError ? (
          <MetricsError message={message} onRetry={onRetry} />
        ) : isLoading ? (
          <TopProductsSkeleton />
        ) : products.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {EMPTY_TOP_PRODUCTS_MESSAGE}
          </p>
        ) : (
          // `<ol>` y no una tabla: la posición es el dato, y el orden del marcado la
          // comunica también a un lector de pantalla.
          <ol className="space-y-3">
            {products.map((product, index) => (
              <li key={product.productId} className="flex items-center gap-3">
                <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={product.name}>
                    {product.name}
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {product.unitsSold} {product.unitsSold === 1 ? 'unidad' : 'unidades'}
                  </p>
                </div>
                <p className="text-sm font-medium tabular-nums">
                  {formatPrice(product.revenueCents)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
