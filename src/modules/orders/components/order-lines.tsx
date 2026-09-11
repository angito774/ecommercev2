import { formatPrice } from '@/modules/products/lib/price';
import { ProductMedia } from '@/modules/storefront/components/product-media';

import type { OrderLineDisplay } from '../types/order.types';

type OrderLinesProps = {
  items: OrderLineDisplay[];
};

// Presentacional puro y sin estado: la misma lista con la misma proyección que
// pintaban la confirmación de compra y el diálogo del historial. Duplicar el
// marcado dejaría dos vistas del mismo pedido divergiendo en silencio (D-11).
//
// Las props piden `OrderLineDisplay` y no `OrderLineSummary`: `productId` no se
// usa aquí y el contrato del historial no lo publica, así que exigirlo obligaría
// al diálogo a inventárselo.
export function OrderLines({ items }: OrderLinesProps) {
  return (
    <ul className="border-border bg-card divide-border divide-y rounded-[22px] border">
      {items.map((item) => (
        <li key={item.id} className="grid grid-cols-[64px_1fr] gap-4 p-4">
          <div className="nx-art-surface relative grid aspect-square place-items-center overflow-hidden rounded-xl p-2">
            {/* `categorySlug` vacío: el snapshot de la línea no guarda la
                categoría, así que el arte de respaldo cae al genérico. */}
            <ProductMedia
              imageUrl={item.imageUrlSnapshot}
              alt={item.nameSnapshot}
              categorySlug=""
              sizes="64px"
            />
          </div>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] leading-tight font-medium tracking-[-0.02em]">
                {item.nameSnapshot}
              </p>
              <p className="text-nx-faint mt-1.5 text-xs">{item.quantity} ud.</p>
            </div>
            <span className="font-nx-display shrink-0 text-[15.5px] font-semibold tracking-[-0.025em] tabular-nums">
              {formatPrice(item.priceCentsSnapshot * item.quantity)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
