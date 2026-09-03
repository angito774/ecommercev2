import { api } from '@/lib/axios';

import type { CatalogQueryInput } from '../schemas/catalog.schema';
import type { CatalogProductListResponse } from '../types/catalog.types';

// Ruta pública, sin el prefijo `/admin` del service de administración.
const BASE_URL = '/products';

// Recibe la entrada del schema y no su salida: `discounted` viaja como cadena en
// la URL y es el handler quien la coacciona, así que el cliente no tiene que
// duplicar esa conversión.
export async function fetchCatalogProducts(
  params: CatalogQueryInput,
): Promise<CatalogProductListResponse> {
  const { data } = await api.get<CatalogProductListResponse>(BASE_URL, { params });
  return data;
}
