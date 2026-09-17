import { describe, expect, it } from 'vitest';

import { DASHBOARD_PERIODS, dashboardMetricsQuerySchema } from './dashboard.schema';

describe('dashboardMetricsQuerySchema', () => {
  it('falls back to 7d when the query string carries no period (AC4)', () => {
    expect(dashboardMetricsQuerySchema.parse({})).toEqual({ period: '7d' });
  });

  it('accepts every period of the catalogue', () => {
    for (const period of DASHBOARD_PERIODS) {
      expect(dashboardMetricsQuerySchema.parse({ period }).period).toBe(period);
    }
  });

  it('rejects a period outside the enum (AC5)', () => {
    expect(dashboardMetricsQuerySchema.safeParse({ period: '90d' }).success).toBe(false);
  });

  it('rejects the empty string instead of treating it as absent', () => {
    expect(dashboardMetricsQuerySchema.safeParse({ period: '' }).success).toBe(false);
  });

  it('reports the failure on the period path so the 400 names the parameter', () => {
    const result = dashboardMetricsQuerySchema.safeParse({ period: 'ayer' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['period']);
  });

  it('exposes exactly the three periods the dashboard offers', () => {
    expect(DASHBOARD_PERIODS).toEqual(['today', '7d', '30d']);
  });
});
