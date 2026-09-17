import type { OrderStatus } from '../types/order.types';

// La regla que decide el 409 del PATCH y la que decide si se pinta el botón de
// cancelar. En dos sitios un día divergen y la UI ofrece algo que la API rechaza
// (D-10). Pura y sin base de datos detrás: el handler la aplica sobre la fila leída
// dentro de la transacción, el sheet sobre el estado que ya tiene en memoria.
//
// Solo `pending`: un pedido cobrado necesita reembolso y reposición de stock, que
// están fuera de alcance por decisión, no por olvido (D-1, §11).
export function canCancelOrder(status: OrderStatus): boolean {
  return status === 'pending';
}
