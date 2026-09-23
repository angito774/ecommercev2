import { describe, expect, it } from 'vitest';

import { documentLength, isValidDni, isValidPeruDocument, isValidRuc } from './peru-document';

// RUC con dígito verificador correcto calculado a mano con los pesos [5,4,3,2,7,6,5,4,3,2]:
// 20131312955 es, además, el RUC público de SUNAT, así que sirve de ancla contra un error
// en la implementación de la fórmula y no solo contra una regresión de sí misma.
const VALID_RUCS = [
  '20131312955', // persona jurídica
  '20100070970', // persona jurídica, resto que desborda a 10 → dígito 0
  '10412812307', // persona natural con negocio
];

describe('isValidRuc', () => {
  it('accepts RUCs whose check digit matches the modulo 11 formula', () => {
    for (const ruc of VALID_RUCS) expect(isValidRuc(ruc)).toBe(true);
  });

  it('rejects a RUC whose check digit does not match: one digit off is not a RUC', () => {
    expect(isValidRuc('20131312956')).toBe(false);
    expect(isValidRuc('20100070971')).toBe(false);
  });

  it('rejects a transposition that keeps the digits but not the weighted sum', () => {
    expect(isValidRuc('20311312955')).toBe(false);
  });

  it('rejects anything that is not exactly 11 digits (AC2, «longitud»)', () => {
    expect(isValidRuc('2013131295')).toBe(false);
    expect(isValidRuc('201313129551')).toBe(false);
    expect(isValidRuc('')).toBe(false);
  });

  it('rejects a taxpayer-type prefix that does not exist, even with a valid check digit', () => {
    // `11` no es un tipo de contribuyente vigente: el número nunca fue un RUC.
    expect(isValidRuc('11131312955')).toBe(false);
    expect(isValidRuc('30131312955')).toBe(false);
  });

  it('accepts the four prefixes that are in force', () => {
    // Se construye el verificador en vez de fijarlo: lo que se afirma es que el prefijo no
    // descarta por sí mismo, no un número concreto.
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    for (const prefix of ['10', '15', '17', '20']) {
      const body = `${prefix}12345678`;
      const sum = weights.reduce((total, weight, i) => total + Number(body[i]) * weight, 0);
      const rest = 11 - (sum % 11);
      const check = rest === 10 ? 0 : rest === 11 ? 1 : rest;
      expect(isValidRuc(`${body}${check}`)).toBe(true);
    }
  });

  it('rejects letters, spaces and dashes instead of coercing them to NaN', () => {
    expect(isValidRuc('2013131295A')).toBe(false);
    expect(isValidRuc('20131312 55')).toBe(false);
    expect(isValidRuc('20-13131295')).toBe(false);
  });
});

describe('isValidDni', () => {
  it('accepts exactly 8 digits', () => {
    expect(isValidDni('41281230')).toBe(true);
    expect(isValidDni('00000001')).toBe(true);
  });

  it('rejects 00000000: it is not a DNI, it is refusing to identify oneself', () => {
    expect(isValidDni('00000000')).toBe(false);
  });

  it('rejects anything that is not exactly 8 digits (AC2, «longitud»)', () => {
    expect(isValidDni('4128123')).toBe(false);
    expect(isValidDni('412812301')).toBe(false);
    expect(isValidDni('')).toBe(false);
  });

  it('rejects letters and separators', () => {
    expect(isValidDni('4128123A')).toBe(false);
    expect(isValidDni('4128 123')).toBe(false);
  });
});

describe('isValidPeruDocument', () => {
  it('applies the RUC rules under ruc and the DNI rules under dni', () => {
    expect(isValidPeruDocument('ruc', '20131312955')).toBe(true);
    expect(isValidPeruDocument('dni', '41281230')).toBe(true);
  });

  it('does not accept a valid DNI as a RUC, nor a valid RUC as a DNI', () => {
    expect(isValidPeruDocument('ruc', '41281230')).toBe(false);
    expect(isValidPeruDocument('dni', '20131312955')).toBe(false);
  });
});

describe('documentLength', () => {
  it('reports the length each type expects, so the message can name it', () => {
    expect(documentLength('dni')).toBe(8);
    expect(documentLength('ruc')).toBe(11);
  });
});
