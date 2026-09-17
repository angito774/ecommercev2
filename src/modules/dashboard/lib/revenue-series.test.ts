import { describe, expect, it } from 'vitest';

import { resolvePeriodRange } from './period-range';
import { fillRevenueSeries } from './revenue-series';

const NOON_IN_LIMA = new Date('2026-09-16T17:00:00.000Z');

describe('fillRevenueSeries', () => {
  it('returns one point per day of the range, not one per row with data (AC11)', () => {
    const { current } = resolvePeriodRange('7d', NOON_IN_LIMA);

    const series = fillRevenueSeries(
      [
        { day: '2026-09-11', revenueCents: 349900 },
        { day: '2026-09-15', revenueCents: 120000 },
      ],
      current,
    );

    expect(series).toHaveLength(7);
  });

  it('fills the days without sales with zero', () => {
    const { current } = resolvePeriodRange('7d', NOON_IN_LIMA);

    const series = fillRevenueSeries([{ day: '2026-09-11', revenueCents: 349900 }], current);

    expect(series[0]).toEqual({ day: '2026-09-10', revenueCents: 0 });
    expect(series[1]).toEqual({ day: '2026-09-11', revenueCents: 349900 });
    expect(series.filter((point) => point.revenueCents === 0)).toHaveLength(6);
  });

  it('keeps ascending order even when the rows arrive shuffled', () => {
    const { current } = resolvePeriodRange('7d', NOON_IN_LIMA);

    const series = fillRevenueSeries(
      [
        { day: '2026-09-16', revenueCents: 3 },
        { day: '2026-09-10', revenueCents: 1 },
        { day: '2026-09-13', revenueCents: 2 },
      ],
      current,
    );

    expect(series.map((point) => point.day)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
    ]);
    expect(series.map((point) => point.revenueCents)).toEqual([1, 0, 0, 2, 0, 0, 3]);
  });

  it('returns a single zeroed point for a one-day range with no sales', () => {
    const { current } = resolvePeriodRange('today', NOON_IN_LIMA);

    expect(fillRevenueSeries([], current)).toEqual([{ day: '2026-09-16', revenueCents: 0 }]);
  });

  it('returns thirty points for the 30d range', () => {
    const { current } = resolvePeriodRange('30d', NOON_IN_LIMA);

    const series = fillRevenueSeries([{ day: '2026-08-18', revenueCents: 500 }], current);

    expect(series).toHaveLength(30);
    expect(series[0]).toEqual({ day: '2026-08-18', revenueCents: 500 });
    expect(series.at(-1)?.day).toBe('2026-09-16');
  });

  it('ignores rows outside the range instead of appending them', () => {
    const { current } = resolvePeriodRange('today', NOON_IN_LIMA);

    const series = fillRevenueSeries(
      [
        { day: '2026-09-01', revenueCents: 999 },
        { day: '2026-09-16', revenueCents: 100 },
      ],
      current,
    );

    expect(series).toEqual([{ day: '2026-09-16', revenueCents: 100 }]);
  });

  it('crosses a month boundary without repeating or skipping a day', () => {
    const { current } = resolvePeriodRange('7d', new Date('2026-10-02T17:00:00.000Z'));

    const series = fillRevenueSeries([], current);

    expect(series.map((point) => point.day)).toEqual([
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });
});
