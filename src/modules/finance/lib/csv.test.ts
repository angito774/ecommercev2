import { describe, expect, it } from 'vitest';

import { CSV_BOM, formatCsvAmount, formatCsvAmountOrEmpty, toCsv } from './csv';

describe('formatCsvAmount', () => {
  it('prints zero with both decimals', () => {
    expect(formatCsvAmount(0)).toBe('0.00');
  });

  it('prints a whole sol with a trailing .00', () => {
    expect(formatCsvAmount(100)).toBe('1.00');
  });

  it('prints a lone cent with a leading zero', () => {
    expect(formatCsvAmount(5)).toBe('0.05');
  });

  it('prints ten cents without dropping the trailing zero', () => {
    expect(formatCsvAmount(50)).toBe('0.50');
  });

  // Aquí es donde un `trunc` mal puesto pierde el signo: `Math.trunc(-5 / 100)` es `-0`,
  // que se imprime `0`. El signo se separa antes de dividir.
  it('keeps the sign of a negative amount smaller than one sol', () => {
    expect(formatCsvAmount(-5)).toBe('-0.05');
    expect(formatCsvAmount(-99)).toBe('-0.99');
  });

  it('prints a negative amount without a currency symbol or thousands separator (AC17)', () => {
    expect(formatCsvAmount(-123456)).toBe('-1234.56');
  });

  it('prints a large amount without grouping', () => {
    expect(formatCsvAmount(123456789)).toBe('1234567.89');
  });

  // Aritmética entera, no `cents / 100`: el céntimo que la coma flotante perdería es el
  // que descuadra un registro contable.
  it('is exact for the amounts where floating point drifts', () => {
    expect(formatCsvAmount(114)).toBe('1.14');
    expect(formatCsvAmount(1_000_000_01)).toBe('1000000.01');
  });
});

describe('formatCsvAmountOrEmpty', () => {
  it('prints nothing for an absent amount: never 0.00, which would claim a zero', () => {
    expect(formatCsvAmountOrEmpty(null)).toBe('');
  });

  it('prints a real zero when the amount is zero', () => {
    expect(formatCsvAmountOrEmpty(0)).toBe('0.00');
  });

  it('delegates every present amount to formatCsvAmount', () => {
    expect(formatCsvAmountOrEmpty(-5)).toBe('-0.05');
  });
});

describe('toCsv', () => {
  it('starts with the UTF-8 BOM, so Excel on Windows reads the accents (AC14)', () => {
    expect(toCsv([['Fecha']]).startsWith(CSV_BOM)).toBe(true);
    expect(CSV_BOM).toBe('﻿');
  });

  it('separates fields with a comma and records with CRLF (AC14)', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe(`${CSV_BOM}a,b\r\nc,d\r\n`);
  });

  it('never uses a bare LF as a record separator', () => {
    expect(toCsv([['a'], ['b']]).replaceAll('\r\n', '')).not.toContain('\n');
  });

  // AC23: un rango sin documentos descarga la cabecera y nada más, no un error.
  it('writes only the BOM and the headers with no data rows (AC23)', () => {
    expect(toCsv([['Fecha', 'Total']])).toBe(`${CSV_BOM}Fecha,Total\r\n`);
  });

  it('writes only the BOM with no rows at all', () => {
    expect(toCsv([])).toBe(CSV_BOM);
  });

  it('leaves an empty field empty: an absent value is not a dash nor a zero', () => {
    expect(toCsv([['a', '', 'b']])).toBe(`${CSV_BOM}a,,b\r\n`);
  });

  it('quotes a field that contains the separator (AC15)', () => {
    expect(toCsv([['Distribuidora, S.A.']])).toBe(`${CSV_BOM}"Distribuidora, S.A."\r\n`);
  });

  it('quotes a field with a line break and keeps the break inside (AC15)', () => {
    expect(toCsv([['dos\nlíneas']])).toBe(`${CSV_BOM}"dos\nlíneas"\r\n`);
  });

  it('doubles the inner quotes of a quoted field (AC15)', () => {
    expect(toCsv([['Ferretería "El Clavo"']])).toBe(
      `${CSV_BOM}"Ferretería ""El Clavo"""\r\n`,
    );
  });

  // AC16, D-5: la razón social la teclea una persona y el archivo se abre en Excel.
  it('prefixes a field that starts with an equals sign', () => {
    expect(toCsv([['=CMD("calc")']])).toBe(`${CSV_BOM}"'=CMD(""calc"")"\r\n`);
  });

  it('prefixes the other formula triggers: +, @, TAB and CR', () => {
    expect(toCsv([['+1+1']])).toBe(`${CSV_BOM}'+1+1\r\n`);
    expect(toCsv([['@SUM(A1)']])).toBe(`${CSV_BOM}'@SUM(A1)\r\n`);
    expect(toCsv([['\tnombre']])).toBe(`${CSV_BOM}'\tnombre\r\n`);
    expect(toCsv([['\rnombre']])).toBe(`${CSV_BOM}"'\rnombre"\r\n`);
  });

  it('prefixes a text that starts with a hyphen, which is not a number', () => {
    expect(toCsv([['-Servicios SAC']])).toBe(`${CSV_BOM}'-Servicios SAC\r\n`);
  });

  // La excepción numérica: sin ella la columna de importes llegaría a Excel como texto y
  // no se podría sumar, que es justo para lo que el contador abre el archivo (D-5).
  it('never prefixes a negative amount (AC16)', () => {
    expect(toCsv([[formatCsvAmount(-123456)]])).toBe(`${CSV_BOM}-1234.56\r\n`);
    expect(toCsv([[formatCsvAmount(-5)]])).toBe(`${CSV_BOM}-0.05\r\n`);
  });

  it('never prefixes a positive amount either', () => {
    expect(toCsv([[formatCsvAmount(0)], [formatCsvAmount(199)]])).toBe(
      `${CSV_BOM}0.00\r\n1.99\r\n`,
    );
  });

  it('leaves an ordinary field untouched', () => {
    expect(toCsv([['Distribuidora SAC', '20100128056']])).toBe(
      `${CSV_BOM}Distribuidora SAC,20100128056\r\n`,
    );
  });

  // El apóstrofo va dentro de las comillas, no delante: `'"=A1,B1"` no lo lee ningún
  // parser RFC 4180.
  it('puts the guard inside the quotes when both apply', () => {
    expect(toCsv([['=A1,B1']])).toBe(`${CSV_BOM}"'=A1,B1"\r\n`);
  });
});
