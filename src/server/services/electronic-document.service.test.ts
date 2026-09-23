import { describe, expect, it, vi } from 'vitest';

// El service alcanza, por la cadena de imports, la configuración del emisor —que lleva
// `server-only` y revienta fuera del bundler de Next— y el cliente de Stripe. Las funciones
// puras bajo prueba no tocan ninguno de los dos: `queueOriginalDocument` e `issueDocument`,
// que sí hablan con la base y con el proveedor, no se ejercitan aquí.
vi.mock('@/lib/invoicing-config', () => ({
  invoicingConfig: {
    company: { ruc: '20123456786', legalName: 'ECOMMERCE TECH SAC', address: 'Av. Ejemplo 123' },
    nubefact: { apiUrl: 'https://api.nubefact.test/ruta', apiToken: 'token-de-prueba' },
  },
  INVOICING_REQUEST_TIMEOUT_MS: 20_000,
}));

import { splitIgv } from '@/modules/finance/lib/igv';
import { SHIPPING_LINE_DESCRIPTION } from '@/modules/orders/constants';
import type { orders } from '@/server/db/schema';
import type { OrderFiscalSnapshot } from '@/server/repositories/order.repository';

import {
  buildDocumentLines,
  originalKindFor,
  resolveBuyerName,
  skipReason,
  toIssueDate,
  toProviderInput,
  toRelatedDocument,
  toVoidProviderInput,
} from './electronic-document.service';

type Order = typeof orders.$inferSelect;
type ClaimedDocument = Parameters<typeof toProviderInput>[0];

const ITEMS = [
  {
    id: 'line-1',
    nameSnapshot: 'Laptop Lenovo IdeaPad 3 15"',
    imageUrlSnapshot: null,
    priceCentsSnapshot: 219_900,
    quantity: 1,
  },
  {
    id: 'line-2',
    nameSnapshot: 'Teclado Keychron K2',
    imageUrlSnapshot: null,
    priceCentsSnapshot: 45_900,
    quantity: 2,
  },
];

function buildSnapshot(overrides: Partial<OrderFiscalSnapshot> = {}): OrderFiscalSnapshot {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    status: 'paid',
    amountTotalCents: 311_700,
    shippingCents: 0,
    buyerDocumentType: 'dni',
    buyerDocumentNumber: '41281230',
    buyerLegalName: null,
    customerName: 'Ada Lovelace',
    customerEmail: 'ada@example.com',
    items: ITEMS,
    ...overrides,
  };
}

function buildClaimed(overrides: Partial<ClaimedDocument> = {}): ClaimedDocument {
  const amountCents = overrides.amountCents ?? 311_700;
  const { baseCents, igvCents } = splitIgv(amountCents);

  return {
    id: '55555555-5555-4555-8555-555555555555',
    orderId: '44444444-4444-4444-8444-444444444444',
    relatedDocumentId: null,
    kind: 'boleta',
    reasonCode: null,
    series: 'B001',
    number: 12,
    amountCents,
    baseCents,
    igvCents,
    status: 'pending',
    issuedAt: null,
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
  };
}

describe('originalKindFor', () => {
  it('turns a RUC into a factura and a DNI into a boleta', () => {
    expect(originalKindFor('ruc')).toBe('factura');
    expect(originalKindFor('dni')).toBe('boleta');
  });
});

describe('skipReason', () => {
  it('lets a normal paid order through', () => {
    expect(
      skipReason({
        buyerDocumentType: 'dni',
        buyerDocumentNumber: '41281230',
        amountTotalCents: 11_800,
      } as Order),
    ).toBeNull();
  });

  it('skips an order created before the migration, instead of inventing a document (AC8)', () => {
    expect(
      skipReason({
        buyerDocumentType: null,
        buyerDocumentNumber: null,
        amountTotalCents: 11_800,
      } as Order),
    ).toBe('missing_buyer_document');
  });

  it('skips a zero-amount order: a comprobante for nothing does not exist', () => {
    // Sin este guard, `splitIgv()` lanzaría dentro de la transacción del webhook y Stripe
    // reintentaría el evento para siempre.
    expect(
      skipReason({
        buyerDocumentType: 'dni',
        buyerDocumentNumber: '41281230',
        amountTotalCents: 0,
      } as Order),
    ).toBe('non_positive_amount');
  });
});

describe('buildDocumentLines', () => {
  it('emits one line per order item, with the frozen snapshot price', () => {
    const lines = buildDocumentLines(ITEMS, 0);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      description: 'Laptop Lenovo IdeaPad 3 15"',
      quantity: 1,
      unitPriceCents: 219_900,
      totalCents: 219_900,
    });
  });

  it('multiplies the unit price by the quantity for the line total', () => {
    expect(buildDocumentLines(ITEMS, 0)[1].totalCents).toBe(91_800);
  });

  it('adds a shipping line when shipping was charged (D-16)', () => {
    const lines = buildDocumentLines(ITEMS, 1_500);

    expect(lines).toHaveLength(3);
    expect(lines[2]).toEqual({
      description: SHIPPING_LINE_DESCRIPTION,
      quantity: 1,
      unitPriceCents: 1_500,
      totalCents: 1_500,
    });
  });

  it('adds no shipping line when shipping was free: that is a line that does not exist', () => {
    expect(buildDocumentLines(ITEMS, 0)).toHaveLength(2);
  });

  it('makes the lines add up to the order total, which is what SUNAT checks', () => {
    const lines = buildDocumentLines(ITEMS, 1_500);
    const sum = lines.reduce((total, line) => total + line.totalCents, 0);

    expect(sum).toBe(219_900 + 91_800 + 1_500);
  });

  it('survives an order with no items, leaving only the shipping line', () => {
    expect(buildDocumentLines([], 1_500)).toHaveLength(1);
  });
});

describe('toIssueDate', () => {
  it('formats the date as DD-MM-YYYY, which is what the provider expects', () => {
    expect(toIssueDate(new Date('2026-09-22T15:04:05.000Z'))).toBe('22-09-2026');
  });

  it('resolves the day in Lima, not in UTC: 20:00 in Lima is still the same day', () => {
    // 2026-09-23T01:30Z son las 20:30 del 22 en Lima. Con el huso del servidor la fecha de
    // emisión del comprobante saltaría al día siguiente.
    expect(toIssueDate(new Date('2026-09-23T01:30:00.000Z'))).toBe('22-09-2026');
  });

  it('pads single-digit days and months', () => {
    expect(toIssueDate(new Date('2026-01-05T18:00:00.000Z'))).toBe('05-01-2026');
  });
});

describe('resolveBuyerName', () => {
  it('uses the legal name the buyer typed when there is a RUC', () => {
    expect(
      resolveBuyerName({
        buyerLegalName: 'Empresa Ejemplo SAC',
        customerName: 'Ada Lovelace',
        customerEmail: 'ada@example.com',
      }),
    ).toBe('Empresa Ejemplo SAC');
  });

  it('falls back to the Clerk name on a boleta, where there is no legal name', () => {
    expect(
      resolveBuyerName({
        buyerLegalName: null,
        customerName: 'Ada Lovelace',
        customerEmail: 'ada@example.com',
      }),
    ).toBe('Ada Lovelace');
  });

  it('falls back to the email rather than inventing a "CLIENTE VARIOS"', () => {
    expect(
      resolveBuyerName({
        buyerLegalName: null,
        customerName: null,
        customerEmail: 'ada@example.com',
      }),
    ).toBe('ada@example.com');
  });
});

describe('toProviderInput', () => {
  const issuedOn = new Date('2026-09-22T15:04:05.000Z');

  it('takes the series and number from the row, never from a fresh assignment (AC13)', () => {
    const input = toProviderInput(buildClaimed(), buildSnapshot(), issuedOn);

    expect(input.series).toBe('B001');
    expect(input.number).toBe(12);
  });

  it('takes the amounts from the row too, so the sent and the stored document agree', () => {
    const claimed = buildClaimed();
    const input = toProviderInput(claimed, buildSnapshot(), issuedOn);

    expect(input.amountCents).toBe(claimed.amountCents);
    expect(input.baseCents).toBe(claimed.baseCents);
    expect(input.igvCents).toBe(claimed.igvCents);
    expect(input.baseCents + input.igvCents).toBe(input.amountCents);
  });

  it('carries the buyer document of the order, which is its only legitimate destination', () => {
    const input = toProviderInput(buildClaimed(), buildSnapshot(), issuedOn);

    expect(input.buyer).toEqual({
      documentType: 'dni',
      documentNumber: '41281230',
      legalName: 'Ada Lovelace',
    });
  });

  it('builds a factura input from an order with a RUC', () => {
    const input = toProviderInput(
      buildClaimed({ kind: 'factura', series: 'F001' }),
      buildSnapshot({
        buyerDocumentType: 'ruc',
        buyerDocumentNumber: '20131312955',
        buyerLegalName: 'Empresa Ejemplo SAC',
      }),
      issuedOn,
    );

    expect(input.kind).toBe('factura');
    expect(input.buyer.documentType).toBe('ruc');
    expect(input.buyer.legalName).toBe('Empresa Ejemplo SAC');
  });

  it('includes the shipping line when the order paid for shipping', () => {
    const input = toProviderInput(buildClaimed(), buildSnapshot({ shippingCents: 1_500 }), issuedOn);

    expect(input.lines).toHaveLength(3);
  });

  it('sends no related document for an original comprobante', () => {
    expect(toProviderInput(buildClaimed(), buildSnapshot(), issuedOn).related).toBeUndefined();
  });

  it('refuses a row with no series instead of sending an unnumbered comprobante', () => {
    expect(() =>
      toProviderInput(buildClaimed({ series: null, number: null }), buildSnapshot(), issuedOn),
    ).toThrow();
  });

  it('refuses an order that lost its buyer document instead of emitting to nobody', () => {
    expect(() =>
      toProviderInput(
        buildClaimed(),
        buildSnapshot({ buyerDocumentType: null, buyerDocumentNumber: null }),
        issuedOn,
      ),
    ).toThrow();
  });
});

describe('toRelatedDocument', () => {
  const PARENT = { kind: 'boleta', series: 'B001', number: 12 } as const;

  it('returns null for an original, which corrects nothing', () => {
    expect(toRelatedDocument({ relatedDocumentId: null, reasonCode: null }, null)).toBeNull();
  });

  it('builds the block from the parent row and the reason of the correction', () => {
    const related = toRelatedDocument(
      { relatedDocumentId: '55555555-5555-4555-8555-555555555555', reasonCode: '06' },
      PARENT,
    );

    expect(related).toEqual({ kind: 'boleta', series: 'B001', number: 12, reasonCode: '06' });
  });

  // Un documento que dice corregir algo y no puede decir a cuál lo rechaza SUNAT, y
  // mandarlo igualmente quemaría el correlativo que ya tiene asignado.
  it('refuses a correction whose parent could not be read', () => {
    expect(() =>
      toRelatedDocument(
        { relatedDocumentId: '55555555-5555-4555-8555-555555555555', reasonCode: '06' },
        null,
      ),
    ).toThrow();
  });

  it('refuses a correction whose parent has no series-number pair', () => {
    expect(() =>
      toRelatedDocument(
        { relatedDocumentId: '55555555-5555-4555-8555-555555555555', reasonCode: '06' },
        { kind: 'boleta', series: null, number: null },
      ),
    ).toThrow();
  });

  it('refuses a correction with no reason: the catalog code is not optional in a note', () => {
    expect(() =>
      toRelatedDocument(
        { relatedDocumentId: '55555555-5555-4555-8555-555555555555', reasonCode: null },
        PARENT,
      ),
    ).toThrow();
  });
});

describe('toProviderInput — corrections (spec 023)', () => {
  const issuedOn = new Date('2026-09-22T15:04:05.000Z');
  const PARENT = buildClaimed({ id: '66666666-6666-4666-8666-666666666666', series: 'B001', number: 12 });

  function buildNote(kind: 'nota_credito' | 'nota_debito', reasonCode: string) {
    return buildClaimed({
      kind,
      reasonCode,
      series: kind === 'nota_credito' ? 'BC01' : 'BD01',
      number: 3,
      relatedDocumentId: PARENT.id,
      amountCents: 50_000,
      baseCents: splitIgv(50_000).baseCents,
      igvCents: splitIgv(50_000).igvCents,
    });
  }

  it('attaches the related block to a credit note', () => {
    const input = toProviderInput(buildNote('nota_credito', '06'), buildSnapshot(), issuedOn, PARENT);

    expect(input.related).toEqual({
      kind: 'boleta',
      series: 'B001',
      number: 12,
      reasonCode: '06',
    });
  });

  it('takes the note series and number from its own row, not from the parent', () => {
    const input = toProviderInput(buildNote('nota_credito', '06'), buildSnapshot(), issuedOn, PARENT);

    expect(input.series).toBe('BC01');
    expect(input.number).toBe(3);
  });

  it('attaches the related block to a debit note too', () => {
    const input = toProviderInput(buildNote('nota_debito', '02'), buildSnapshot(), issuedOn, PARENT);

    expect(input.related?.reasonCode).toBe('02');
  });

  it('still sends no related block for an original, even if a parent is passed by mistake', () => {
    expect(toProviderInput(buildClaimed(), buildSnapshot(), issuedOn, PARENT).related).toBeUndefined();
  });
});

describe('toVoidProviderInput', () => {
  const issuedOn = new Date('2026-09-22T15:04:05.000Z');
  const PARENT = buildClaimed({ id: '66666666-6666-4666-8666-666666666666', series: 'B001', number: 12 });

  const VOID_DOCUMENT = buildClaimed({
    kind: 'comunicacion_baja',
    reasonCode: '01',
    relatedDocumentId: PARENT.id,
    // Los tres `null` que exigen los `CHECK` de la tabla: la baja no lleva serie propia ni
    // importe, porque no es un comprobante nuevo.
    series: null,
    number: null,
    amountCents: null,
    baseCents: null,
    igvCents: null,
  });

  it('builds a void input that carries only the document it voids', () => {
    const input = toVoidProviderInput(VOID_DOCUMENT, buildSnapshot(), issuedOn, PARENT);

    expect(input.kind).toBe('comunicacion_baja');
    expect(input.related).toEqual({
      kind: 'boleta',
      series: 'B001',
      number: 12,
      reasonCode: '01',
    });
  });

  it('carries no series, number or amount of its own: the type makes it impossible', () => {
    const input = toVoidProviderInput(VOID_DOCUMENT, buildSnapshot(), issuedOn, PARENT);

    expect(input).not.toHaveProperty('series');
    expect(input).not.toHaveProperty('amountCents');
    expect(input).not.toHaveProperty('lines');
  });

  it('refuses a void with no parent instead of voiding nothing', () => {
    expect(() => toVoidProviderInput(VOID_DOCUMENT, buildSnapshot(), issuedOn, null)).toThrow();
  });
});

// La baja no puede pasar por el constructor de comprobante: no tiene serie, ni número, ni
// importes. El tipo lo impide, y el guard lo confirma en tiempo de ejecución para el dato
// que llegue de una fila corrupta.
describe('toProviderInput refuses a comunicación de baja', () => {
  it('throws instead of sending a comprobante with no series', () => {
    const voidDocument = buildClaimed({
      kind: 'comunicacion_baja',
      reasonCode: '01',
      relatedDocumentId: '66666666-6666-4666-8666-666666666666',
      series: null,
      number: null,
      amountCents: null,
      baseCents: null,
      igvCents: null,
    });

    expect(() =>
      toProviderInput(
        voidDocument,
        buildSnapshot(),
        new Date('2026-09-22T15:04:05.000Z'),
        buildClaimed({ id: '66666666-6666-4666-8666-666666666666' }),
      ),
    ).toThrow();
  });
});
