import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditInput } from '@/lib/audit';
import type { orders } from '@/server/db/schema';

// Archivo aparte del de las funciones puras **porque estas pruebas sí necesitan dobles**:
// `voidParentAndReissue` cruza dos repositorios y escribe en la bitácora, y mezclar los
// `vi.mock` con las pruebas puras dejaría a aquellas sin poder afirmar que no mockean nada.
//
// El `tx` es un centinela: ningún doble lo inspecciona, solo se comprueba que la anulación
// del padre y el reencolado lo reciben, que es lo que garantiza que ocurren en la misma
// transacción que el `markIssued` (AC14, AC15).
const { TX, auditEntries, electronicDocumentRepository, orderRepository, documentSeriesRepository } =
  vi.hoisted(() => ({
    TX: Symbol('tx'),
    auditEntries: [] as AuditInput[],
    electronicDocumentRepository: { markVoided: vi.fn(), create: vi.fn() },
    orderRepository: { findById: vi.fn(), findByIdWithItems: vi.fn() },
    documentSeriesRepository: { nextNumber: vi.fn() },
  }));

vi.mock('@/lib/invoicing-config', () => ({
  invoicingConfig: {
    company: { ruc: '20123456786', legalName: 'ECOMMERCE TECH SAC', address: 'Av. Ejemplo 123' },
    nubefact: { apiUrl: 'https://api.nubefact.test/ruta', apiToken: 'token-de-prueba' },
  },
  INVOICING_REQUEST_TIMEOUT_MS: 20_000,
}));

vi.mock('@/lib/audit', () => ({
  logAudit: (_tx: unknown, input: AuditInput) => {
    auditEntries.push(input);
    return Promise.resolve();
  },
}));

vi.mock('@/server/repositories/electronic-document.repository', () => electronicDocumentRepository);
vi.mock('@/server/repositories/order.repository', () => orderRepository);
vi.mock('@/server/repositories/document-series.repository', () => documentSeriesRepository);

import { voidParentAndReissue } from './electronic-document.service';

type Order = typeof orders.$inferSelect;
type ClaimedDocument = Parameters<typeof voidParentAndReissue>[1];
type Tx = Parameters<typeof voidParentAndReissue>[0];

const ORDER_ID = '44444444-4444-4444-8444-444444444444';
const PARENT_ID = '66666666-6666-4666-8666-666666666666';

function buildIssued(overrides: Partial<ClaimedDocument> = {}): ClaimedDocument {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    orderId: ORDER_ID,
    relatedDocumentId: PARENT_ID,
    // Nota de crédito con motivo 02 —anulación por error en el RUC—, que es la que emite la
    // corrección de comprador: anula el original y obliga a reemitir (AC15).
    kind: 'nota_credito',
    reasonCode: '02',
    series: 'BC01',
    number: 3,
    amountCents: 311_700,
    baseCents: 264_153,
    igvCents: 47_547,
    status: 'issued',
    issuedAt: new Date('2026-09-22T15:00:00.000Z'),
    pdfUrl: null,
    xmlUrl: null,
    cdrUrl: null,
    providerResponse: null,
    lastError: null,
    stripeRefundId: null,
    attemptCount: 1,
    lastAttemptAt: new Date('2026-09-22T15:00:00.000Z'),
    createdById: null,
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    updatedAt: new Date('2026-09-22T15:00:00.000Z'),
    ...overrides,
  } as ClaimedDocument;
}

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: ORDER_ID,
    status: 'paid',
    amountTotalCents: 311_700,
    refundedAmountCents: 0,
    shippingCents: 0,
    buyerDocumentType: 'ruc',
    buyerDocumentNumber: '20131312955',
    buyerLegalName: 'Empresa Ejemplo SAC',
    ...overrides,
  } as Order;
}

const PARENT = { id: PARENT_ID, status: 'voided' };

function run(issued = buildIssued()) {
  return voidParentAndReissue(TX as unknown as Tx, issued);
}

beforeEach(() => {
  auditEntries.length = 0;
  vi.resetAllMocks();

  electronicDocumentRepository.markVoided.mockResolvedValue(PARENT);
  electronicDocumentRepository.create.mockResolvedValue({ id: '77777777-7777-4777-8777-777777777777' });
  orderRepository.findById.mockResolvedValue(buildOrder());
  orderRepository.findByIdWithItems.mockResolvedValue({ items: [] });
  documentSeriesRepository.nextNumber.mockResolvedValue({ series: 'F001', number: 8 });
});

describe('voidParentAndReissue — first correction', () => {
  it('voids the parent and queues the reissued comprobante, both on the same transaction', async () => {
    await run();

    expect(electronicDocumentRepository.markVoided).toHaveBeenCalledWith(TX, PARENT_ID);
    expect(electronicDocumentRepository.create).toHaveBeenCalledTimes(1);
    expect(electronicDocumentRepository.create.mock.calls[0][0]).toBe(TX);
  });

  it('queues nothing when the order was refunded in full: there is no sale left to document (AC17)', async () => {
    orderRepository.findById.mockResolvedValue(
      buildOrder({ refundedAmountCents: 311_700 }),
    );

    await run();

    expect(electronicDocumentRepository.markVoided).toHaveBeenCalledOnce();
    expect(electronicDocumentRepository.create).not.toHaveBeenCalled();
  });

  it('touches nothing at all for a debit note, which voids no document', async () => {
    await run(buildIssued({ kind: 'nota_debito', reasonCode: '02' }));

    expect(electronicDocumentRepository.markVoided).not.toHaveBeenCalled();
    expect(electronicDocumentRepository.create).not.toHaveBeenCalled();
  });
});

// El caso que el reviewer encontró: la segunda corrección sobre un original **ya anulado**.
// `markVoided` devuelve `null` porque su `WHERE status = 'issued'` ya no encuentra la fila, y
// eso significa «ya está hecho». Seguir de largo encolaría un segundo comprobante original
// sobre un pedido que ya tiene el reemitido vigente, violando el índice único parcial con un
// 500 genérico **después** de que el proveedor emitió el documento: quedaría `pending` para
// siempre repitiendo el mismo error en cada reintento.
describe('voidParentAndReissue — second correction over an already voided original', () => {
  it('stops without queueing anything when the parent was already voided', async () => {
    electronicDocumentRepository.markVoided.mockResolvedValue(null);

    await run();

    expect(electronicDocumentRepository.create).not.toHaveBeenCalled();
    expect(documentSeriesRepository.nextNumber).not.toHaveBeenCalled();
  });

  it('does not even read the order again, so nothing can decide to reissue', async () => {
    electronicDocumentRepository.markVoided.mockResolvedValue(null);

    await run();

    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.findByIdWithItems).not.toHaveBeenCalled();
  });

  it('resolves instead of throwing: an already voided parent is done, not a failure', async () => {
    electronicDocumentRepository.markVoided.mockResolvedValue(null);

    await expect(run()).resolves.toBeUndefined();
  });

  it('survives two corrections in a row, queueing exactly one reissue', async () => {
    // La primera anula el original y reencola; la segunda encuentra el padre ya `voided`.
    electronicDocumentRepository.markVoided
      .mockResolvedValueOnce(PARENT)
      .mockResolvedValueOnce(null);

    await run();
    await run();

    expect(electronicDocumentRepository.markVoided).toHaveBeenCalledTimes(2);
    expect(electronicDocumentRepository.create).toHaveBeenCalledTimes(1);
  });
});
