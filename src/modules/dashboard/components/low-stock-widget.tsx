'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { EMPTY_LOW_STOCK_MESSAGE } from '../constants';
import type { LowStockRow } from '../types/dashboard.types';

import { MetricsError } from './metrics-error';

type LowStockWidgetProps = {
  products: LowStockRow[];
  // Viaja en `meta` y no se lee de la constante: el número que se rotula tiene que
  // ser el que usó la consulta, no el que el cliente supone.
  threshold: number;
  isLoading: boolean;
  isError: boolean;
  message?: string;
  onRetry: () => void;
};

function LowStockSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function LowStockWidget({
  products,
  threshold,
  isLoading,
  isError,
  message,
  onRetry,
}: LowStockWidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock bajo</CardTitle>
        <CardDescription>
          Productos activos con menos de {threshold} unidades. Refleja el stock de ahora, así
          que no cambia con el período.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          <MetricsError message={message} onRetry={onRetry} />
        ) : isLoading ? (
          <LowStockSkeleton />
        ) : products.length === 0 ? (
          // Afirmativo: «ninguno por debajo del umbral» es una buena noticia, no un
          // hueco por llenar (AC14).
          <p className="text-muted-foreground py-8 text-center text-sm">
            {EMPTY_LOW_STOCK_MESSAGE}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Sin recortar aquí: el tope es del repositorio y volver a
                    aplicarlo daría dos sitios donde cambiarlo. */}
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="max-w-[18rem] truncate" title={product.name}>
                      {product.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {product.sku}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {product.stock}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
