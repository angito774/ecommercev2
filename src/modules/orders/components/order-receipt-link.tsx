'use client';

import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useOrderReceipt } from '../hooks/use-order-receipt';

type OrderReceiptLinkProps = {
  orderId: string;
  /** Atado a la apertura del diálogo: cerrado, no se llama a Stripe. */
  open: boolean;
};

// Un `<a href>` real con la URL ya resuelta, nunca un botón que hace fetch y luego
// `window.open(url)`: fuera del gesto de usuario el navegador bloquea la ventana
// emergente. Resolver antes y renderizar el enlace evita el bloqueo y además lo
// deja navegable por teclado (D-10, AC10).
export function OrderReceiptLink({ orderId, open }: OrderReceiptLinkProps) {
  const query = useOrderReceipt(orderId, open);

  if (query.isPending) {
    return (
      <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Buscando la boleta en Stripe…
      </p>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-2">
        {/* El mensaje real del servidor: el interceptor de axios ya lo dejó
            legible y el 502 explica que el fallo es de Stripe, no del pedido. */}
        <p role="alert" className="text-destructive text-sm">
          {query.error.message}
        </p>
        <Button
          variant="outline"
          className="h-11 rounded-full px-5"
          onClick={() => void query.refetch()}
        >
          <RefreshCw className="size-4" aria-hidden />
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <Button asChild className="h-11 w-full rounded-full px-5">
      <a href={query.data.url} target="_blank" rel="noopener noreferrer">
        Ver la boleta en Stripe
        <ExternalLink className="size-4" aria-hidden />
      </a>
    </Button>
  );
}
