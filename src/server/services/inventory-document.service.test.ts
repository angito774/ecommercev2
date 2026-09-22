import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditInput } from '@/lib/audit';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { INSUFFICIENT_STOCK_PREFIX } from '@/modules/inventory/constants';
import type { CreateInventoryDocumentValues } from '@/modules/inventory/schemas/inventory-document.schema';
import type { InventoryDocumentDetail } from '@/modules/inventory/types/inventory-document.types';
import type { users } from '@/server/db/schema';

// `vi.mock` se iza al principio del archivo, así que los dobles se crean con `vi.hoisted`
// para que existan antes que las factorías.
//
// El `tx` es un centinela: ningún doble lo inspecciona, solo se comprueba que las
// lecturas y escrituras lo reciben, que es lo que garantiza que el efecto en stock, las
// dos inserciones y la bitácora viven en la misma transacción (AC4).
const { TX, auditEntries, auditTxs, productRepository, documentRepository } = vi.hoisted(() => ({
  TX: Symbol('tx'),
  auditEntries: [] as AuditInput[],
  auditTxs: [] as unknown[],
  productRepository: {
    findManyByIds: vi.fn(),
    applyStockChange: vi.fn(),
    applyPurchaseStockChange: vi.fn(),
  },
  documentRepository: { insertDocument: vi.fn(), insertMovements: vi.fn(), findById: vi.fn() },
}));

vi.mock('@/server/db', () => ({
  db: { transaction: (callback: (tx: unknown) => unknown) => callback(TX) },
}));

vi.mock('@/lib/audit', () => ({
  logAudit: (tx: unknown, input: AuditInput) => {
    auditTxs.push(tx);
    auditEntries.push(input);
    return Promise.resolve();
  },
}));

vi.mock('@/server/repositories/product.repository', () => productRepository);
vi.mock('@/server/repositories/inventory-document.repository', () => documentRepository);

import { createDocument } from './inventory-document.service';

type User = typeof users.$inferSelect;

const ACTOR = { id: 'actor-1' } as User;
const CONTEXT = { ipAddress: null, userAgent: null };

const DOCUMENT_ID = '99999999-9999-4999-8999-999999999999';

// Ids deliberadamente fuera de orden alfabético respecto al orden en que llegan del
// formulario: es lo que hace observable el criterio de D-18.
const PRODUCT_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const PRODUCT_B = 'bbbbbbbb-2222-4222-8222-222222222222';

const PRODUCTS = [
  { id: PRODUCT_A, name: 'Teclado Keychron K2', stock: 8 },
  { id: PRODUCT_B, name: 'Monitor LG UltraGear', stock: 3 },
];

const DETAIL = { id: DOCUMENT_ID } as InventoryDocumentDetail;

function input(overrides: Partial<CreateInventoryDocumentValues> = {}): CreateInventoryDocumentValues {
  return {
    transaccionId: 'ingreso_compra',
    docDate: '2026-09-16',
    items: [{ productId: PRODUCT_A, quantity: 5 }],
    ...overrides,
  } as CreateInventoryDocumentValues;
}

function run(values = input()) {
  return createDocument({ actor: ACTOR, context: CONTEXT, input: values });
}

beforeEach(() => {
  auditEntries.length = 0;
  auditTxs.length = 0;
  vi.resetAllMocks();

  productRepository.findManyByIds.mockResolvedValue(PRODUCTS);
  productRepository.applyStockChange.mockResolvedValue({ stock: 13 });
  productRepository.applyPurchaseStockChange.mockResolvedValue({
    stock: 13,
    averageCostCents: 11_000,
  });
  documentRepository.insertDocument.mockResolvedValue({ id: DOCUMENT_ID, docNumber: 7 });
  documentRepository.insertMovements.mockResolvedValue(undefined);
  documentRepository.findById.mockResolvedValue(DETAIL);
});

describe('createDocument — existence of the products', () => {
  it('throws NotFoundError when a product does not exist, so the API answers 404 (AC10)', async () => {
    productRepository.findManyByIds.mockResolvedValue([]);

    await expect(run()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('writes nothing at all when a product is missing', async () => {
    productRepository.findManyByIds.mockResolvedValue([]);

    await expect(run()).rejects.toThrow();
    expect(productRepository.applyStockChange).not.toHaveBeenCalled();
    expect(documentRepository.insertDocument).not.toHaveBeenCalled();
    expect(auditEntries).toHaveLength(0);
  });

  it('reads the products with the transaction handle, not the global db', async () => {
    await run();

    expect(productRepository.findManyByIds).toHaveBeenCalledWith([PRODUCT_A], TX);
  });
});

describe('createDocument — the sign of the movement', () => {
  it('applies a positive delta for an inbound document (AC4)', async () => {
    await run(input({ transaccionId: 'ingreso_compra' }));

    expect(productRepository.applyStockChange).toHaveBeenCalledWith(TX, {
      productId: PRODUCT_A,
      delta: 5,
    });
  });

  it('applies a negative delta for an outbound document (D-5)', async () => {
    await run(input({ transaccionId: 'salida_prestamo' }));

    expect(productRepository.applyStockChange).toHaveBeenCalledWith(TX, {
      productId: PRODUCT_A,
      delta: -5,
    });
  });

  it('derives the direction from the catalogue: the client never sends it (AC15)', async () => {
    await run(input({ transaccionId: 'ingreso_devolucion' }));

    expect(auditEntries[0]?.metadata).toEqual({ direction: 'ingreso' });
  });
});

describe('createDocument — insufficient stock', () => {
  const twoLines = input({
    transaccionId: 'salida_venta',
    items: [
      { productId: PRODUCT_A, quantity: 1 },
      { productId: PRODUCT_B, quantity: 5 },
    ],
  });

  function failOnSecondLine() {
    productRepository.applyStockChange
      .mockResolvedValueOnce({ stock: 7 })
      .mockResolvedValueOnce(null);
  }

  it('throws ConflictError so the API answers 409 and not 500 (AC5)', async () => {
    failOnSecondLine();

    await expect(run(twoLines)).rejects.toBeInstanceOf(ConflictError);
  });

  it('names the product, its stock and what was asked for (AC5)', async () => {
    failOnSecondLine();

    await expect(run(twoLines)).rejects.toThrow(
      `${INSUFFICIENT_STOCK_PREFIX} de "Monitor LG UltraGear": quedan 3 unidades y la nota pide 5.`,
    );
  });

  it('carries the id of the line that did not fit, so the form marks it without guessing', async () => {
    failOnSecondLine();

    await expect(run(twoLines)).rejects.toMatchObject({
      details: { productId: PRODUCT_B },
    });
  });

  it('inserts neither the document nor its movements: the whole thing reverts (AC6)', async () => {
    failOnSecondLine();

    await expect(run(twoLines)).rejects.toThrow();
    expect(documentRepository.insertDocument).not.toHaveBeenCalled();
    expect(documentRepository.insertMovements).not.toHaveBeenCalled();
  });

  it('leaves no entry in the audit log either (AC5)', async () => {
    failOnSecondLine();

    await expect(run(twoLines)).rejects.toThrow();
    expect(auditEntries).toHaveLength(0);
  });
});

describe('createDocument — order in which the lines are applied', () => {
  it('applies them sorted by productId, whatever order the form sent (D-18)', async () => {
    await run(
      input({
        items: [
          { productId: PRODUCT_B, quantity: 1 },
          { productId: PRODUCT_A, quantity: 2 },
        ],
      }),
    );

    const appliedIds = productRepository.applyStockChange.mock.calls.map(
      (call) => (call[1] as { productId: string }).productId,
    );

    expect(appliedIds).toEqual([PRODUCT_A, PRODUCT_B]);
  });

  it('does not mutate the input array while sorting it', async () => {
    const values = input({
      items: [
        { productId: PRODUCT_B, quantity: 1 },
        { productId: PRODUCT_A, quantity: 2 },
      ],
    });

    await run(values);

    expect(values.items.map((item) => item.productId)).toEqual([PRODUCT_B, PRODUCT_A]);
  });
});

describe('createDocument — what gets written', () => {
  it('stores the stock returned by the UPDATE as stock_after, without recomputing it (D-11, AC4)', async () => {
    productRepository.applyStockChange.mockResolvedValue({ stock: 13 });

    await run();

    expect(documentRepository.insertMovements).toHaveBeenCalledWith(TX, [
      {
        documentId: DOCUMENT_ID,
        productId: PRODUCT_A,
        quantity: 5,
        stockAfter: 13,
        // Sin costo en el cuerpo, la línea se guarda con `null` (spec 021, §5.2).
        unitCostCents: null,
      },
    ]);
  });

  it('stores a null reference when the body did not bring one (D-8)', async () => {
    await run();

    expect(documentRepository.insertDocument).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ reference: null, createdById: ACTOR.id }),
    );
  });

  it('keeps the reference when the body brought one', async () => {
    await run(input({ reference: 'F001-123' }));

    expect(documentRepository.insertDocument).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ reference: 'F001-123' }),
    );
  });

  it('returns the detail re-read inside the transaction', async () => {
    await expect(run()).resolves.toBe(DETAIL);
    expect(documentRepository.findById).toHaveBeenCalledWith(DOCUMENT_ID, TX);
  });
});

describe('createDocument — the audit entry', () => {
  it('writes it with the same transaction handle as the mutation (AC4)', async () => {
    await run();

    expect(auditTxs).toEqual([TX]);
  });

  it('registers the document under its own action and entity', async () => {
    await run();

    expect(auditEntries[0]).toMatchObject({
      actorId: ACTOR.id,
      action: 'inventory_document.created',
      entityType: 'inventory_document',
      entityId: DOCUMENT_ID,
      severity: 'info',
    });
  });

  it('registers the document, not the quantities per product (D-19)', async () => {
    await run(
      input({
        items: [
          { productId: PRODUCT_A, quantity: 5 },
          { productId: PRODUCT_B, quantity: 9 },
        ],
      }),
    );

    const after = auditEntries[0]?.changes?.after;

    expect(after).toEqual({
      docNumber: 7,
      transaccionId: 'ingreso_compra',
      docDate: '2026-09-16',
      itemCount: 2,
    });
    // La igualdad estricta de arriba ya prueba que ninguna cantidad por producto entró;
    // esto deja escrito el invariante que importa por si el objeto crece.
    expect(JSON.stringify(after)).not.toContain(PRODUCT_A);
    expect(JSON.stringify(after)).not.toContain(PRODUCT_B);
  });

  it('carries no product id in the metadata either', async () => {
    await run();

    expect(JSON.stringify(auditEntries[0]?.metadata)).not.toContain(PRODUCT_A);
  });
});

// La rama por línea del spec 021 (§7.3): el service elige mutador por la presencia del
// costo y no por el tipo de transacción, porque Zod ya garantizó que solo una compra lo
// trae (§6.1). Así el camino de la venta no carga con la aritmética del promedio.
describe('createDocument — the unit cost of a purchase (spec 021)', () => {
  const purchase = input({
    transaccionId: 'ingreso_compra',
    items: [{ productId: PRODUCT_A, quantity: 10, unitCostCents: 12_000 }],
  } as Partial<CreateInventoryDocumentValues>);

  it('recomputes the weighted average in the very UPDATE that moves the stock', async () => {
    await run(purchase);

    expect(productRepository.applyPurchaseStockChange).toHaveBeenCalledWith(TX, {
      productId: PRODUCT_A,
      quantity: 10,
      unitCostCents: 12_000,
    });
  });

  it('does not also call the plain stock mutator: one UPDATE per line, not two', async () => {
    await run(purchase);

    expect(productRepository.applyStockChange).not.toHaveBeenCalled();
  });

  it('stores the cost on the movement, which is where it lives permanently', async () => {
    await run(purchase);

    expect(documentRepository.insertMovements).toHaveBeenCalledWith(TX, [
      {
        documentId: DOCUMENT_ID,
        productId: PRODUCT_A,
        quantity: 10,
        stockAfter: 13,
        unitCostCents: 12_000,
      },
    ]);
  });

  it('never touches the average on any other kind of note (AC11)', async () => {
    await run(input({ transaccionId: 'ingreso_devolucion' }));

    expect(productRepository.applyPurchaseStockChange).not.toHaveBeenCalled();
    expect(productRepository.applyStockChange).toHaveBeenCalledWith(TX, {
      productId: PRODUCT_A,
      delta: 5,
    });
  });

  it('stores a null cost on those lines: no invented amount (AC11)', async () => {
    await run(input({ transaccionId: 'salida_venta' }));

    expect(documentRepository.insertMovements).toHaveBeenCalledWith(TX, [
      expect.objectContaining({ unitCostCents: null }),
    ]);
  });

  it('applies the average inside the same transaction as the document and the audit log', async () => {
    await run(purchase);

    expect(productRepository.applyPurchaseStockChange.mock.calls[0]?.[0]).toBe(TX);
    expect(auditTxs).toEqual([TX]);
  });

  // D-10 y D-19: `audit` lee la bitácora con `audit_logs.read` y no tiene `finance.read`.
  // El costo vive en `stock_movements`, que es permanente; el log se purga a los 180 días.
  it('keeps the cost out of the audit entry, both in changes and in metadata (D-10)', async () => {
    await run(purchase);

    expect(auditEntries[0]?.changes?.after).toEqual({
      docNumber: 7,
      transaccionId: 'ingreso_compra',
      docDate: '2026-09-16',
      itemCount: 1,
    });
    expect(JSON.stringify(auditEntries[0])).not.toContain('12000');
    expect(JSON.stringify(auditEntries[0]?.metadata)).not.toContain('unitCost');
  });

  it('rolls the whole purchase back when a later line runs short of stock', async () => {
    productRepository.applyPurchaseStockChange.mockResolvedValueOnce(null);

    await expect(run(purchase)).rejects.toThrow();
    expect(documentRepository.insertDocument).not.toHaveBeenCalled();
    expect(auditEntries).toHaveLength(0);
  });
});
