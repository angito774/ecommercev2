import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COST_NOT_ALLOWED_MESSAGE,
  COST_REQUIRED_MESSAGE,
  createInventoryDocumentSchema,
  DUPLICATE_ITEM_MESSAGE,
  inventoryDocumentFormSchema,
  inventoryDocumentQuerySchema,
  MAX_DOCUMENT_ITEMS,
  UNIT_COST_INPUT_MESSAGE,
} from './inventory-document.schema';

const PRODUCT_A = '11111111-1111-4111-8111-111111111111';
const PRODUCT_B = '22222222-2222-4222-8222-222222222222';

// El costo de una línea de compra. Las líneas de los casos que no van sobre el costo lo
// llevan porque el tipo por defecto de `validBody` es `ingreso_compra` y el
// `superRefine` lo exige (spec 021, AC6).
const UNIT_COST = 10_000;

const line = (productId: string, quantity: number) => ({
  productId,
  quantity,
  unitCostCents: UNIT_COST,
});

// Mediodía de Lima: lejos de cualquier frontera de día, para que los casos que no
// prueban el huso no dependan de en qué lado del corte cae el instante.
const NOON_IN_LIMA = new Date('2026-09-16T17:00:00.000Z');

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    transaccionId: 'ingreso_compra',
    docDate: '2026-09-16',
    items: [line(PRODUCT_A, 5)],
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
        items: [line(PRODUCT_A, 2), line(PRODUCT_A, 3)],
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
        items: [line(PRODUCT_A, 2), line(PRODUCT_B, 3)],
      }),
    );

    expect(result.success).toBe(true);
  });

  it('rejects a quantity of zero', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({ items: [line(PRODUCT_A, 0)] }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects a negative quantity: the sign is the direction of the document (D-5)', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({ items: [line(PRODUCT_A, -1)] }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects a fractional quantity', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({ items: [line(PRODUCT_A, 1.5)] }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects a productId that is not a uuid, so it never reaches the FK (AC10)', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({ items: [line('LEN-IP3-15', 1)] }),
    );

    expect(result.success).toBe(false);
  });

  it(`rejects more than ${MAX_DOCUMENT_ITEMS} lines`, () => {
    const items = Array.from({ length: MAX_DOCUMENT_ITEMS + 1 }, (_, index) => ({
      productId: `1111111${String(index).padStart(2, '0')}-1111-4111-8111-111111111111`,
      quantity: 1,
      unitCostCents: UNIT_COST,
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

// El invariante cruzado del spec 021 (D-3): no puede ser un `CHECK` de la base porque el
// tipo de transacción vive en la cabecera, así que este schema es la primera —y la
// única— frontera antes del service.
describe('createInventoryDocumentSchema — the unit cost of a purchase (spec 021)', () => {
  it('accepts a purchase with a cost on every line', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({
        transaccionId: 'ingreso_compra',
        items: [line(PRODUCT_A, 2), line(PRODUCT_B, 3)],
      }),
    );

    expect(result.success).toBe(true);
  });

  it('rejects a purchase whose second line has no cost, so nothing is inserted (AC6)', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({
        transaccionId: 'ingreso_compra',
        items: [line(PRODUCT_A, 2), { productId: PRODUCT_B, quantity: 3 }],
      }),
    );

    expect(result.success).toBe(false);
  });

  it('hangs that error off the very line that is missing it, not off the document (AC6)', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({
        transaccionId: 'ingreso_compra',
        items: [line(PRODUCT_A, 2), { productId: PRODUCT_B, quantity: 3 }],
      }),
    );

    const issue = result.error?.issues.find((candidate) => candidate.message === COST_REQUIRED_MESSAGE);

    expect(issue?.path).toEqual(['items', 1, 'unitCostCents']);
  });

  it('rejects a purchase with no cost on any line', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({
        transaccionId: 'ingreso_compra',
        items: [{ productId: PRODUCT_A, quantity: 2 }],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(COST_REQUIRED_MESSAGE);
  });

  // Los tres tipos excluidos se nombran uno a uno y no por dirección: `ingreso` incluye
  // los tres ingresos y solo la compra lleva costo (D-2).
  it.each(['ingreso_devolucion', 'ingreso_cambio', 'salida_venta'] as const)(
    'rejects a cost on a %s line: a cost only exists in a purchase (AC7)',
    (transaccionId) => {
      const result = parseAt(
        NOON_IN_LIMA,
        validBody({ transaccionId, items: [line(PRODUCT_A, 2)] }),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.message)).toContain(
        COST_NOT_ALLOWED_MESSAGE,
      );
    },
  );

  it.each(['ingreso_devolucion', 'ingreso_cambio', 'salida_venta'] as const)(
    'accepts a %s line without any cost (AC11)',
    (transaccionId) => {
      const result = parseAt(
        NOON_IN_LIMA,
        validBody({ transaccionId, items: [{ productId: PRODUCT_A, quantity: 2 }] }),
      );

      expect(result.success).toBe(true);
    },
  );

  // AC13: el `CHECK` de la base es la segunda barrera, no la primera.
  it.each([0, -1, 10.5, 100_000_000])('rejects a unitCostCents of %s (AC13)', (unitCostCents) => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({
        transaccionId: 'ingreso_compra',
        items: [{ productId: PRODUCT_A, quantity: 2, unitCostCents }],
      }),
    );

    expect(result.success).toBe(false);
  });

  it('accepts a unitCostCents of exactly the maximum', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({
        transaccionId: 'ingreso_compra',
        items: [{ productId: PRODUCT_A, quantity: 2, unitCostCents: 99_999_999 }],
      }),
    );

    expect(result.success).toBe(true);
  });

  it('accepts a unitCostCents of 1: one cent is a legitimate cost', () => {
    const result = parseAt(
      NOON_IN_LIMA,
      validBody({
        transaccionId: 'ingreso_compra',
        items: [{ productId: PRODUCT_A, quantity: 2, unitCostCents: 1 }],
      }),
    );

    expect(result.success).toBe(true);
  });
});

describe('inventoryDocumentFormSchema — the cost typed in soles (spec 021)', () => {
  const formLine = (unitCost: string) => ({ productId: PRODUCT_A, quantity: '2', unitCost });

  function parseForm(transaccionId: string, unitCost: string) {
    return inventoryDocumentFormSchema.safeParse({
      transaccionId,
      docDate: '2026-09-16',
      reference: '',
      items: [formLine(unitCost)],
    });
  }

  it('accepts a purchase with a well-formed amount in soles', () => {
    expect(parseForm('ingreso_compra', '899.90').success).toBe(true);
  });

  it.each(['', 'abc', '0', '0.00', '1.234', '-5'])(
    'rejects a purchase whose typed cost is "%s"',
    (unitCost) => {
      expect(parseForm('ingreso_compra', unitCost).success).toBe(false);
    },
  );

  it('marks that error on the line, which is where it gets corrected', () => {
    const result = parseForm('ingreso_compra', '');

    const issue = result.error?.issues.find(
      (candidate) => candidate.message === UNIT_COST_INPUT_MESSAGE,
    );

    expect(issue?.path).toEqual(['items', 0, 'unitCost']);
  });

  // AC28: con otro tipo el campo no se pinta, así que exigirlo dejaría el formulario
  // inválido por algo que no se ve.
  it.each(['ingreso_devolucion', 'ingreso_cambio', 'salida_venta'])(
    'accepts a %s with an empty cost: the field is not even rendered (AC28)',
    (transaccionId) => {
      expect(parseForm(transaccionId, '').success).toBe(true);
    },
  );

  it('ignores a cost left typed when the type is no longer a purchase (AC28)', () => {
    expect(parseForm('salida_venta', '899.90').success).toBe(true);
  });
});
