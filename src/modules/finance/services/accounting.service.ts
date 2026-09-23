import { api } from '@/lib/axios';

import { registryFileName, type RegistryKind } from '../lib/accounting-csv';
import type { AccountingQueryParams } from '../schemas/accounting.schema';
import type {
  PurchaseRegistryResponse,
  SalesRegistryResponse,
} from '../types/accounting.types';
import type { FinanceRange } from '../types/finance.types';

// Único punto del módulo que habla con esta API. Los componentes lo consumen a través de
// los hooks, nunca directamente (docs/SETUP.md §4, regla dura 2). Archivo propio y no una
// ampliación de `finance.service.ts`, con el precedente de `pricing.service.ts`: son otros
// recursos y compartir archivo invitaría a compartir también la clave de caché.

const ACCOUNTING_URL = '/admin/finance/accounting';

// `'sales' | 'purchases'` son a la vez el segmento de la ruta y la clave del nombre de
// archivo, así que no hace falta ningún mapa: el tipo del catálogo es el que manda.
const registryUrl = (registry: RegistryKind) => `${ACCOUNTING_URL}/${registry}`;

export async function fetchSalesRegistry(
  params: AccountingQueryParams,
): Promise<SalesRegistryResponse> {
  const { data } = await api.get<SalesRegistryResponse>(registryUrl('sales'), { params });
  return data;
}

export async function fetchPurchaseRegistry(
  params: AccountingQueryParams,
): Promise<PurchaseRegistryResponse> {
  const { data } = await api.get<PurchaseRegistryResponse>(registryUrl('purchases'), {
    params,
  });
  return data;
}

export type RegistryDownload = { blob: Blob; filename: string };

/**
 * La descarga va por `axios` y no por `<a href="/api/…" download>` (D-6): con el atributo
 * `download` el navegador **guarda igualmente el cuerpo de un error**, y ante un 403 o un
 * 500 el contador se queda con un `registro-ventas-….csv` que dentro tiene un JSON. Datos
 * fiscales corruptos y silenciosos son peores que un toast.
 *
 * Una sola función parametrizada por registro y no dos gemelas: el tipo que elige la ruta
 * es el mismo que elige el nombre del archivo, así que separarlas duplicaría la
 * correspondencia en dos sitios.
 *
 * Con `responseType: 'blob'` el cuerpo de un fallo también llega como `Blob`, así que el
 * interceptor de axios no puede leer su `{ message }`: el copy del error lo pone el hook
 * (T20, D-6).
 */
export async function exportRegistry(
  registry: RegistryKind,
  range: FinanceRange,
): Promise<RegistryDownload> {
  const { data } = await api.get<Blob>(`${registryUrl(registry)}/export`, {
    params: range,
    responseType: 'blob',
  });

  // El mismo nombre que el `Content-Disposition` del servidor, de la misma función pura
  // (AC20): el que manda al guardar es este, y dos construcciones separadas se
  // desalinearían.
  return { blob: data, filename: registryFileName(registry, range) };
}
