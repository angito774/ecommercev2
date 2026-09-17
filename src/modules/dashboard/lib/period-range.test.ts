import { describe, expect, it } from 'vitest';

import { toReportingDayKey } from '@/lib/reporting';

import { DASHBOARD_PERIODS, type DashboardPeriod } from '../schemas/dashboard.schema';

import { resolvePeriodRange } from './period-range';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const spanInDays = ({ from, to }: { from: Date; to: Date }) =>
  (to.getTime() - from.getTime()) / MS_PER_DAY;

// Mediodía de Lima: lejos de cualquier frontera de día, para que los tests de
// duración no dependan de en qué lado del corte cae el instante.
const NOON_IN_LIMA = new Date('2026-09-16T17:00:00.000Z');

describe('resolvePeriodRange', () => {
  const expectedDays: Record<DashboardPeriod, number> = { today: 1, '7d': 7, '30d': 30 };

  it.each(DASHBOARD_PERIODS)('spans exactly its own number of days for %s', (period) => {
    const { current, previous } = resolvePeriodRange(period, NOON_IN_LIMA);

    expect(spanInDays(current)).toBe(expectedDays[period]);
    expect(spanInDays(previous)).toBe(expectedDays[period]);
  });

  it.each(DASHBOARD_PERIODS)('leaves no gap and no overlap between windows for %s', (period) => {
    const { current, previous } = resolvePeriodRange(period, NOON_IN_LIMA);

    expect(previous.to.getTime()).toBe(current.from.getTime());
  });

  it('closes the current window at the start of tomorrow in Lima, not at now (AC6)', () => {
    const { current } = resolvePeriodRange('today', NOON_IN_LIMA);

    // 2026-09-17T00:00 en Lima es 05:00 UTC del mismo día.
    expect(current.to.toISOString()).toBe('2026-09-17T05:00:00.000Z');
    expect(current.from.toISOString()).toBe('2026-09-16T05:00:00.000Z');
  });

  it('keeps 03:00 UTC inside the previous Lima day, which is still the 15th (AC7)', () => {
    const { current } = resolvePeriodRange('today', new Date('2026-09-16T03:00:00.000Z'));

    expect(current.from.toISOString()).toBe('2026-09-15T05:00:00.000Z');
    expect(current.to.toISOString()).toBe('2026-09-16T05:00:00.000Z');
  });

  it('puts 04:59:59Z and 05:00:00Z on different Lima days', () => {
    const before = resolvePeriodRange('today', new Date('2026-09-16T04:59:59.999Z'));
    const after = resolvePeriodRange('today', new Date('2026-09-16T05:00:00.000Z'));

    expect(before.current.from.toISOString()).toBe('2026-09-15T05:00:00.000Z');
    expect(after.current.from.toISOString()).toBe('2026-09-16T05:00:00.000Z');
  });

  it('walks the 7d window back seven full days from the end of today', () => {
    const { current, previous } = resolvePeriodRange('7d', NOON_IN_LIMA);

    expect(current.from.toISOString()).toBe('2026-09-10T05:00:00.000Z');
    expect(current.to.toISOString()).toBe('2026-09-17T05:00:00.000Z');
    expect(previous.from.toISOString()).toBe('2026-09-03T05:00:00.000Z');
    expect(previous.to.toISOString()).toBe('2026-09-10T05:00:00.000Z');
  });

  it('walks the 30d window back thirty full days', () => {
    const { current, previous } = resolvePeriodRange('30d', NOON_IN_LIMA);

    expect(current.from.toISOString()).toBe('2026-08-18T05:00:00.000Z');
    expect(previous.from.toISOString()).toBe('2026-07-19T05:00:00.000Z');
  });

  it('resolves the same window for any instant of the same Lima day', () => {
    const early = resolvePeriodRange('7d', new Date('2026-09-16T05:00:00.000Z'));
    const late = resolvePeriodRange('7d', new Date('2026-09-17T04:59:59.999Z'));

    expect(early).toEqual(late);
  });
});

// Los casos propios de `toReportingDayKey` se mudaron con la función a
// `src/lib/reporting.test.ts` (spec 017, D-9). Aquí se queda solo el que cruza las
// dos piezas: que la clave del día y el instante que abre la ventana concuerden.
describe('toReportingDayKey', () => {
  it('agrees with the start instant of every window it labels', () => {
    const { current } = resolvePeriodRange('7d', NOON_IN_LIMA);

    expect(toReportingDayKey(current.from)).toBe('2026-09-10');
  });
});
