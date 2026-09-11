import { api } from '@/lib/axios';

import type { CheckoutInput, CheckoutResponse } from '../schemas/checkout.schema';

// Único punto donde el módulo habla con la API. Ningún componente llama a axios
// directo: se consume por el hook (docs/SETUP.md §4, regla 2).
export async function createCheckout(input: CheckoutInput): Promise<CheckoutResponse> {
  const { data } = await api.post<CheckoutResponse>('/checkout', input);
  return data;
}
