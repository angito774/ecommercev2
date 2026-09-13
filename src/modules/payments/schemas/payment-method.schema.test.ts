import { describe, expect, it } from 'vitest';

import { paymentMethodIdParamSchema } from './payment-method.schema';

describe('paymentMethodIdParamSchema', () => {
  it('accepts our own UUID', () => {
    const result = paymentMethodIdParamSchema.safeParse('11111111-1111-4111-8111-111111111111');

    expect(result.success).toBe(true);
  });

  it('rejects a Stripe payment method id (pm_...), which is not a UUID', () => {
    const result = paymentMethodIdParamSchema.safeParse('pm_1MqZgHLkdIwHu7ixzhE5j3az');

    expect(result.success).toBe(false);
  });
});
