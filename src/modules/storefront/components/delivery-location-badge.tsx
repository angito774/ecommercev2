import { MapPin } from 'lucide-react';

// Zona de reparto por defecto. Constante y no un dato: no hay modelo de
// ubicaciones ni selector de dirección todavía.
const DELIVERY_CITY = 'Lima';

// `<span>` y no `<button>` a propósito: es información, no un control. Pintarlo
// como botón prometería que se puede cambiar la ciudad, y hoy no hay nada detrás
// que lo permita. El día que exista el selector, este componente se convierte en
// disparador sin mover nada más del header.
export function DeliveryLocationBadge() {
  return (
    // `lg` y no `xl`: AC9 lo pide en la fila 1 del header desde 1024 px, que es el
    // mismo ancho en el que el header pasa a dos filas.
    <span className="text-muted-foreground hidden items-center gap-1.5 text-[13px] lg:inline-flex">
      <MapPin className="text-primary size-4 shrink-0" aria-hidden />
      Enviar a <span className="text-foreground font-semibold">{DELIVERY_CITY}</span>
    </span>
  );
}
