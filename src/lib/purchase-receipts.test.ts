import { describe, expect, it } from 'vitest';

import {
  carriesIgv,
  grantsTaxCredit,
  PURCHASE_RECEIPT_RULES,
  PURCHASE_RECEIPT_TYPE_LABELS,
  PURCHASE_RECEIPT_TYPES,
  TAX_CREDIT_RECEIPT_TYPES,
} from './purchase-receipts';

describe('PURCHASE_RECEIPT_TYPES', () => {
  it('declares the four types of the spec, in order', () => {
    expect(PURCHASE_RECEIPT_TYPES).toEqual(['factura', 'boleta', 'recibo_honorarios', 'otro']);
  });

  it('has no duplicates: the tuple feeds the pgEnum', () => {
    expect(new Set(PURCHASE_RECEIPT_TYPES).size).toBe(PURCHASE_RECEIPT_TYPES.length);
  });
});

describe('PURCHASE_RECEIPT_RULES', () => {
  it('covers the four types with no gaps: a missing key would be an undefined lookup', () => {
    expect(Object.keys(PURCHASE_RECEIPT_RULES).sort()).toEqual([...PURCHASE_RECEIPT_TYPES].sort());
  });

  it('declares both flags as booleans for every type', () => {
    for (const type of PURCHASE_RECEIPT_TYPES) {
      expect(typeof PURCHASE_RECEIPT_RULES[type].carriesIgv).toBe('boolean');
      expect(typeof PURCHASE_RECEIPT_RULES[type].grantsTaxCredit).toBe('boolean');
    }
  });

  // El invariante de la tabla, no de sus valores actuales: sigue siendo cierto aunque
  // T1 se reabra y mueva una celda.
  it('never grants tax credit on a type that carries no IGV: that would be credit on a tax that does not exist', () => {
    for (const type of PURCHASE_RECEIPT_TYPES) {
      const { carriesIgv: carries, grantsTaxCredit: grants } = PURCHASE_RECEIPT_RULES[type];

      if (grants) expect(carries).toBe(true);
    }
  });

  // Los valores conservadores que fija §5.1 y que T1 no pudo contrastar. Este es el
  // test que hay que editar el día que la norma se confirme.
  it('keeps the conservative values of the unverified table (spec 024, §5.1.1)', () => {
    expect(PURCHASE_RECEIPT_RULES).toEqual({
      factura: { carriesIgv: true, grantsTaxCredit: true },
      boleta: { carriesIgv: true, grantsTaxCredit: false },
      recibo_honorarios: { carriesIgv: false, grantsTaxCredit: false },
      otro: { carriesIgv: false, grantsTaxCredit: false },
    });
  });
});

describe('carriesIgv', () => {
  it('reads the table instead of hardcoding the answer', () => {
    for (const type of PURCHASE_RECEIPT_TYPES) {
      expect(carriesIgv(type)).toBe(PURCHASE_RECEIPT_RULES[type].carriesIgv);
    }
  });

  it('does not split IGV out of a recibo por honorarios (D-5)', () => {
    expect(carriesIgv('recibo_honorarios')).toBe(false);
  });
});

describe('grantsTaxCredit', () => {
  it('reads the table instead of hardcoding the answer', () => {
    for (const type of PURCHASE_RECEIPT_TYPES) {
      expect(grantsTaxCredit(type)).toBe(PURCHASE_RECEIPT_RULES[type].grantsTaxCredit);
    }
  });
});

describe('TAX_CREDIT_RECEIPT_TYPES', () => {
  it('contains exactly the types flagged as grantsTaxCredit (AC16)', () => {
    expect([...TAX_CREDIT_RECEIPT_TYPES].sort()).toEqual(
      PURCHASE_RECEIPT_TYPES.filter((type) => PURCHASE_RECEIPT_RULES[type].grantsTaxCredit).sort(),
    );
  });

  // Que esté **derivada** y no escrita a mano es la propiedad que sostiene AC16: mover
  // una bandera de la tabla tiene que mover esta lista sin que nadie la toque. Se
  // comprueba recalculándola con el mismo predicado público, orden incluido.
  it('is derived from the table with the public predicate, order included', () => {
    expect(TAX_CREDIT_RECEIPT_TYPES).toEqual(PURCHASE_RECEIPT_TYPES.filter(grantsTaxCredit));
  });

  // La derivación es una función de la tabla: sobre una tabla con otra celda, el mismo
  // filtro da otra lista. Es lo que hace que corregir T1 no exija tocar esta constante.
  it('would follow a flipped flag: the list is a function of the table, not a literal', () => {
    const flipped: typeof PURCHASE_RECEIPT_RULES = {
      ...PURCHASE_RECEIPT_RULES,
      boleta: { carriesIgv: true, grantsTaxCredit: true },
    };

    expect(PURCHASE_RECEIPT_TYPES.filter((type) => flipped[type].grantsTaxCredit)).toContain(
      'boleta',
    );
    expect(TAX_CREDIT_RECEIPT_TYPES).not.toContain('boleta');
  });

  it('is never empty: with no eligible type the aggregate would have nothing to sum', () => {
    expect(TAX_CREDIT_RECEIPT_TYPES.length).toBeGreaterThan(0);
  });

  it('only holds values of the enum, so the inArray parameters are valid for Postgres', () => {
    for (const type of TAX_CREDIT_RECEIPT_TYPES) {
      expect(PURCHASE_RECEIPT_TYPES).toContain(type);
    }
  });
});

describe('PURCHASE_RECEIPT_TYPE_LABELS', () => {
  it('labels the four types with no gaps', () => {
    expect(Object.keys(PURCHASE_RECEIPT_TYPE_LABELS).sort()).toEqual(
      [...PURCHASE_RECEIPT_TYPES].sort(),
    );
  });

  it('never falls back to the raw code: every label is human text', () => {
    for (const type of PURCHASE_RECEIPT_TYPES) {
      const label = PURCHASE_RECEIPT_TYPE_LABELS[type];

      expect(label.trim().length).toBeGreaterThan(0);
      expect(label).not.toBe(type);
    }
  });
});
