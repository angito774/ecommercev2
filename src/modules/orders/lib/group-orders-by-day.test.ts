import { describe, expect, it } from 'vitest';

import type { OrderHistoryEntry } from '../types/order.types';

import { groupOrdersByDay } from './group-orders-by-day';

// Mismas opciones que usa `DAY_LABEL_FORMATTER` en el código bajo prueba. Se
// construye aparte (no se importa el formatter privado) para que la
// aserción siga siendo válida sin importar qué datos CLDR/ICU traiga la
// máquina que corre el test.
const LABEL_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

let nextId = 1;

function buildEntry(overrides: Partial<OrderHistoryEntry> = {}): OrderHistoryEntry {
  return {
    id: `order-${nextId++}`,
    status: 'paid',
    subtotalCents: 1_000,
    shippingCents: 0,
    amountTotalCents: 1_000,
    createdAt: new Date(2026, 8, 9, 10, 0).toISOString(),
    items: [],
    receiptAvailable: true,
    ...overrides,
  };
}

describe('groupOrdersByDay', () => {
  it('returns an empty array for no entries', () => {
    expect(groupOrdersByDay([])).toEqual([]);
  });

  it('groups a single entry into one group with the right key and label', () => {
    const createdAt = new Date(2026, 8, 9, 10, 0);
    const entry = buildEntry({ createdAt: createdAt.toISOString() });

    const groups = groupOrdersByDay([entry]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('2026-09-09');
    expect(groups[0]?.label).toBe(LABEL_FORMATTER.format(createdAt));
    expect(groups[0]?.orders).toEqual([entry]);
  });

  it('groups several entries from the same local day into a single group', () => {
    const morning = buildEntry({ id: 'a', createdAt: new Date(2026, 8, 9, 8, 0).toISOString() });
    const evening = buildEntry({ id: 'b', createdAt: new Date(2026, 8, 9, 20, 0).toISOString() });

    const groups = groupOrdersByDay([morning, evening]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.orders).toEqual([morning, evening]);
  });

  it('creates separate groups for entries on different local days', () => {
    const day1 = buildEntry({ id: 'a', createdAt: new Date(2026, 8, 9, 12, 0).toISOString() });
    const day2 = buildEntry({ id: 'b', createdAt: new Date(2026, 8, 10, 12, 0).toISOString() });

    const groups = groupOrdersByDay([day1, day2]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.key).toBe('2026-09-09');
    expect(groups[0]?.orders).toEqual([day1]);
    expect(groups[1]?.key).toBe('2026-09-10');
    expect(groups[1]?.orders).toEqual([day2]);
  });

  it('keeps a local-midnight entry in its own day, separate from the day before', () => {
    const lateNight = buildEntry({
      id: 'a',
      createdAt: new Date(2026, 8, 9, 23, 59, 59, 999).toISOString(),
    });
    const justAfterMidnight = buildEntry({
      id: 'b',
      createdAt: new Date(2026, 8, 10, 0, 0, 0, 0).toISOString(),
    });

    const groups = groupOrdersByDay([lateNight, justAfterMidnight]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.key).toBe('2026-09-09');
    expect(groups[1]?.key).toBe('2026-09-10');
  });

  it('preserves input order of groups (first-seen day, not sorted)', () => {
    const newer = buildEntry({ id: 'a', createdAt: new Date(2026, 8, 10, 9, 0).toISOString() });
    const older = buildEntry({ id: 'b', createdAt: new Date(2026, 8, 9, 9, 0).toISOString() });

    const groups = groupOrdersByDay([newer, older]);

    expect(groups.map((group) => group.key)).toEqual(['2026-09-10', '2026-09-09']);
  });

  it('preserves the order of orders within a group, even when interleaved with another day', () => {
    const dayAFirst = buildEntry({ id: 'a1', createdAt: new Date(2026, 8, 9, 9, 0).toISOString() });
    const dayBFirst = buildEntry({ id: 'b1', createdAt: new Date(2026, 8, 10, 9, 0).toISOString() });
    const dayASecond = buildEntry({
      id: 'a2',
      createdAt: new Date(2026, 8, 9, 15, 0).toISOString(),
    });

    const groups = groupOrdersByDay([dayAFirst, dayBFirst, dayASecond]);

    expect(groups.map((group) => group.key)).toEqual(['2026-09-09', '2026-09-10']);
    expect(groups[0]?.orders).toEqual([dayAFirst, dayASecond]);
    expect(groups[1]?.orders).toEqual([dayBFirst]);
  });
});
