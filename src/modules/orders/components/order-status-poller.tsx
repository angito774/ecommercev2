'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

const POLL_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = 10;

// El cliente puede volver de Stripe antes de que llegue el webhook, y entonces la
// orden todavía está `pending`. `router.refresh()` vuelve a ejecutar el Server
// Component, que relee la orden del repositorio: cuando el webhook la marque `paid`,
// la vista cambia sola (D-17, AC10).
//
// Se monta solo mientras la orden esté `pending`; en cuanto el refresh trae `paid`
// la page deja de renderizar este componente y el intervalo se limpia. El tope de 10
// intentos evita que una orden que nunca se confirma deje al navegador refrescando
// para siempre.
//
// Agotados los intentos hay que decirlo: la confirmación sigue anunciando que la
// página se actualizará sola, y callar dejaría al cliente mirando un spinner que ya
// no comprueba nada.
export function OrderStatusPoller() {
  const router = useRouter();
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    let attempts = 0;

    const timer = setInterval(() => {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(timer);
        setExhausted(true);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [router]);

  if (!exhausted) return null;

  return (
    <div
      role="status"
      className="border-border bg-card mx-auto mb-6 flex w-full max-w-[720px] flex-col items-center gap-3 rounded-[22px] border p-5 text-center"
    >
      <p className="text-muted-foreground max-w-[52ch] text-sm leading-relaxed">
        El cobro está tardando más de lo normal en confirmarse. Tu pedido no se ha
        perdido: si el pago se completó, aparecerá en cuanto lo comprobemos.
      </p>
      <Button
        variant="outline"
        className="h-10 rounded-full px-5"
        onClick={() => router.refresh()}
      >
        Volver a comprobar
      </Button>
    </div>
  );
}
