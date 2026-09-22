import { api } from '@/lib/axios';

import type { OrderAdjustmentInput } from '../schemas/order-adjustment.schema';
import type { ElectronicDocumentRow } from '../types/electronic-document.types';
import type { OrderAdjustmentResult } from '../types/order-adjustment.types';

// Único punto del módulo que habla con esta API. Los componentes lo consumen a través del
// hook, nunca directamente (docs/SETUP.md §4, regla dura 2).
const INVOICING_DOCUMENTS_URL = '/admin/invoicing/documents';

const ADMIN_ORDERS_URL = '/admin/orders';

/**
 * `POST` sin cuerpo: la acción no tiene parámetros. Todo lo que hace falta para emitir
 * —serie, número, importes, comprador— está en la fila desde que se creó (D-6).
 *
 * Una sola función para el primer intento y para todos los siguientes: emitir y reemitir
 * son la misma operación sobre la misma fila (D-10). Devuelve el documento en su estado
 * final para que el hook pueda pintarlo sin una segunda petición.
 */
export async function issueDocument(id: string): Promise<ElectronicDocumentRow> {
  const { data } = await api.post<ElectronicDocumentRow>(
    `${INVOICING_DOCUMENTS_URL}/${id}/issue`,
  );
  return data;
}

/**
 * El ajuste del pedido (spec 023). Vive en el módulo `invoicing` y no en `orders` aunque la
 * ruta cuelgue del pedido: lo que la operación produce es un **documento fiscal**, y la
 * ruta es del pedido porque es el recurso sobre el que se actúa.
 *
 * Devuelve el pedido con su árbol de documentos ya recalculado, para que el hook pueda
 * pintar el documento nuevo sin una segunda petición. **No emite nada**: el documento llega
 * `pending` y se emite con `issueDocument()`, que es la misma acción de siempre (D-13).
 */
export async function adjustOrder(
  orderId: string,
  input: OrderAdjustmentInput,
): Promise<OrderAdjustmentResult> {
  const { data } = await api.post<OrderAdjustmentResult>(
    `${ADMIN_ORDERS_URL}/${orderId}/adjust`,
    input,
  );
  return data;
}
