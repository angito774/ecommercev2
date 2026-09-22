import { api } from '@/lib/axios';

import type { PricingQueryParams, SetInitialCostInput } from '../schemas/pricing.schema';
import type { InitialCostSet, PricingListResponse } from '../types/pricing.types';

const PRICING_URL = '/admin/pricing';

// Único punto del módulo que habla con esta API. Los componentes lo consumen a través de
// los hooks, nunca directamente (docs/SETUP.md §4, regla dura 2). Vive aparte de
// `finance.service.ts` porque son dos recursos distintos con dos permisos distintos
// detrás, y compartir archivo invitaría a compartir también la clave de caché.
export async function fetchPricing(params: PricingQueryParams): Promise<PricingListResponse> {
  const { data } = await api.get<PricingListResponse>(PRICING_URL, { params });
  return data;
}

export async function setInitialCost(
  id: string,
  input: SetInitialCostInput,
): Promise<InitialCostSet> {
  // `POST` y no `PATCH`: no se crea ninguna fila, pero la operación es irrepetible y el
  // segundo intento responde 409 (spec 021, D-5).
  const { data } = await api.post<InitialCostSet>(`${PRICING_URL}/${id}/initial-cost`, input);
  return data;
}
