import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createInventoryDocumentSchema,
  DUPLICATE_ITEM_MESSAGE,
  inventoryDocumentQuerySchema,
  MAX_DOCUMENT_ITEMS,
} from './inventory-document.schema';

const PRODUCT_A = '11111111-1111-4111-8111-111111111111';
const PRODUCT_B = '22222222-2222-4222-8222-222222222222';

// Mediodía de Lima: lejos de cualquier frontera de día, para que los casos que no
// prueban el huso no dependan de en qué lado del corte cae el instante.
const NOON_IN_LIMA = new Date('2026-09-16T17:00:00.000Z');

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    transaccionId: 'ingreso_compra',
    docDate: '2026-09-16',
    items: [{ productId: PRODUCT_A, quantity: 5 }],
    ...overrides,
  };
}

function parseAt(instant: Date, body: unknown) {
  vi.useFakeTimers();
  vi.setSystemTime(instant);
  try {
    return createInventoryDocumentSchema.safeParse(body);
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createInventoryDocumentSchema', () => {
  it('accepts a well-formed single-line document', () => {
    expect(parseAt(NOON_IN_LIMA, validBody()).success).toBe(true);
  });

  it('rejects a transaction type outside the catalogue, so it never reaches the FK (AC7)', () => {
    const result = parseAt(NOON_IN_LIMA, validBody({ transaccionId: 'ajuste_por_merma' }));

    expect(result.success).toBe(false);
  });

  it('rejects an empty items array: a document without lines moves nothing (AC8)', () => {
    const result = parseAt(NOON_IN_LIMA, validBody({ items: [] }));

    expect(result.success).toBe(false);
  });

  it('rejects the same product repeated in two lines, with its own message (AC8)', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({
        items: [
          { productId: PRODUCT_A, quantity: 2 },
          { productId: PRODUCT_A, quantity: 3 },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      DUPLICATE_ITEM_MESSAGE,
    );
  });

  it('accepts two different products in the same document (D-15)', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({
        items: [
          { productId: PRODUCT_A, quantity: 2 },
          { productId: PRODUCT_B, quantity: 3 },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });

  it('rejects a quantity of zero', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({ items: [{ productId: PRODUCT_A, quantity: 0 }] }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects a negative quantity: the sign is the direction of the document (D-5)', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({ items: [{ productId: PRODUCT_A, quantity: -1 }] }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects a fractional quantity', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({ items: [{ productId: PRODUCT_A, quantity: 1.5 }] }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects a productId that is not a uuid, so it never reaches the FK (AC10)', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({ items: [{ productId: 'LEN-IP3-15', quantity: 1 }] }),
    );

    expect(result.success).toBe(false);
  });

  it(`rejects more than ${MAX_DOCUMENT_ITEMS} lines`, () => {
    const items = Array.from({ length: MAX_DOCUMENT_ITEMS + 1 }, (_, index) => ({
      productId: `1111111${String(index).padStart(2, '0')}-1111-4111-8111-111111111111`,
      quantity: 1,
    }));

    expect(parseAt(NOON_IN_LIMA, validBody({ items })).success).toBe(false);
  });

  it('rejects a document dated tomorrow in Lima (AC9)', () => {
    const result = parseAt(NOON_IN_LIMA, validBody({ docDate: '2026-09-17' }));

    expect(result.success).toBe(false);
  });

  it('accepts a document dated today at 23:00 in Lima, when UTC already reads tomorrow (AC9)', () => {
    // 2026-09-16 23:00 en Lima es 2026-09-17T04:00Z: en UTC ya es el 17.
    const result = parseAt(new Date('2026-09-17T04:00:00.000Z'), validBody({ docDate: '2026-09-16' }));

    expect(result.success).toBe(true);
  });

  it('rejects a docDate that is not AAAA-MM-DD', () => {
    expect(parseAt(NOON_IN_LIMA, validBody({ docDate: '16/09/2026' })).success).toBe(false);
  });

  it('treats the reference as optional: not every movement has paper behind it (D-8)', () => {
    const result = parseAt(NOON_IN_LIMA, validBody());

    expect(result.success).toBe(true);
    expect(result.data?.reference).toBeUndefined();
  });

  it('trims the reference', () => {
    const result = parseAt(NOON_IN_LIMA, validBody({ reference: '  F001-123  ' }));

    expect(result.data?.reference).toBe('F001-123');
  });

  it('rejects a reference longer than the column', () => {
    const result = parseAt(NOON_IN_LIMA, validBody({ reference: 'x'.repeat(121) }));

    expect(result.success).toBe(false);
  });
});

describe('inventoryDocumentQuerySchema', () => {
  it('defaults an empty query to the whole first page, with no direction filter', () => {
    const result = inventoryDocumentQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ direction: 'all', page: 1, pageSize: 20 });
  });

  it('accepts each direction of the catalogue', () => {
    expect(inventoryDocumentQuerySchema.safeParse({ direction: 'ingreso' }).success).toBe(true);
    expect(inventoryDocumentQuerySchema.safeParse({ direction: 'salida' }).success).toBe(true);
  });

  it('rejects a direction outside the enum and the sentinel', () => {
    expect(inventoryDocumentQuerySchema.safeParse({ direction: 'devolucion' }).success).toBe(
      false,
    );
  });

  it('coerces page and pageSize from the query string', () => {
    const result = inventoryDocumentQuerySchema.safeParse({ page: '3', pageSize: '50' });

    expect(result.data).toMatchObject({ page: 3, pageSize: 50 });
  });

  it('rejects a non-numeric page with 400, which is the caller’s error', () => {
    expect(inventoryDocumentQuerySchema.safeParse({ page: 'abc' }).success).toBe(false);
  });

  it('caps pageSize so a single request cannot pull the whole table', () => {
    expect(inventoryDocumentQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('rejects an inverted range and marks the error on `from` (AC14)', () => {
    const result = inventoryDocumentQuerySchema.safeParse({
      from: '2026-09-30',
      to: '2026-09-01',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['from']);
  });

  it('accepts a range with both ends on the same day: it is inclusive (AC12)', () => {
    const result = inventoryDocumentQuerySchema.safeParse({
      from: '2026-09-16',
      to: '2026-09-16',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a single open end', () => {
    expect(inventoryDocumentQuerySchema.safeParse({ from: '2026-09-01' }).success).toBe(true);
    expect(inventoryDocumentQuerySchema.safeParse({ to: '2026-09-30' }).success).toBe(true);
  });

  it('keeps the search as written: escaping LIKE wildcards is the repository’s job (AC13)', () => {
    const result = inventoryDocumentQuerySchema.safeParse({ search: '50%_off' });

    expect(result.data?.search).toBe('50%_off');
  });
});
