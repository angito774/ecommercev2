import { api } from '@/lib/axios';

import type { ElectronicDocumentRow } from '../types/electronic-document.types';

// Único punto del módulo que habla con esta API. Los componentes lo consumen a través del
// hook, nunca directamente (docs/SETUP.md §4, regla dura 2).
const INVOICING_DOCUMENTS_URL = '/admin/invoicing/documents';

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
