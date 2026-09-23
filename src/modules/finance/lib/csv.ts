// Serializador CSV. Módulo **puro** —sin Drizzle, sin React y sin nada de
// contabilidad—, para que lo importen igual el Route Handler que produce el archivo y
// cualquier test. No existía ningún patrón de exportación previo en el proyecto (§6.5):
// este lo fija, y por eso las decisiones de formato están documentadas aquí.
//
// Vive en `src/modules/finance/lib/` y no en `src/lib/`: hoy tiene un solo dominio
// consumidor y se mueve a la tercera repetición, no antes (CLAUDE.md §6).

/**
 * BOM de UTF-8. Sin él, Excel en Windows abre el archivo en la codificación del sistema y
 * rompe las tildes y la ñ (AC14).
 */
export const CSV_BOM = '﻿';

const FIELD_SEPARATOR = ',';

/** RFC 4180: el fin de línea es CRLF, que es lo que ningún lector interpreta mal. */
const RECORD_SEPARATOR = '\r\n';

// Los seis caracteres con los que Excel y Sheets empiezan a interpretar una celda como
// fórmula. El tabulador y el retorno de carro entran porque también arrancan la
// evaluación en algunas versiones.
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

// La excepción numérica (D-5): un importe negativo **no** se prefija, o la columna que el
// contador abre el archivo para sumar llegaría a Excel como texto. Cubre exactamente lo
// que produce `formatCsvAmount()` y nada más.
const NUMERIC = /^-?\d+(\.\d+)?$/;

function neutralizeFormula(value: string): string {
  if (value === '' || NUMERIC.test(value)) return value;

  return FORMULA_TRIGGERS.includes(value[0]) ? `'${value}` : value;
}

// Entrecomillado RFC 4180: solo cuando hace falta —coma, comilla o salto de línea—, y con
// las comillas internas duplicadas. El guard corre **antes** de entrecomillar, para que el
// apóstrofo quede dentro de las comillas y no delante de ellas.
function escapeField(value: string): string {
  const guarded = neutralizeFormula(value);

  return /["\r\n,]/.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
}

/**
 * Serializa a CSV RFC 4180, con el BOM delante: **el BOM es parte del contrato de esta
 * función**, no algo que cada llamador recuerde prefijar (AC14).
 *
 * Además neutraliza la inyección de fórmulas (AC16, D-5): la razón social la teclea una
 * persona y el archivo se abre en Excel, así que un campo que empieza por `=`, `+`, `-`,
 * `@`, TAB o CR se prefija con un apóstrofo salvo que sea un número.
 *
 * Cada registro termina en CRLF, incluido el último: un archivo cuyo último renglón no
 * lleva terminador es la causa clásica de que un lector se deje la fila final.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const body = rows
    .map((row) => row.map(escapeField).join(FIELD_SEPARATOR) + RECORD_SEPARATOR)
    .join('');

  return CSV_BOM + body;
}

/**
 * Céntimos → soles con dos decimales, sin símbolo de moneda y sin separador de miles:
 * `-1234.56` (AC17, D-15). `S/ 1,234.56` llegaría a Excel como texto y no se podría sumar,
 * que es lo primero que el contador hace con la columna.
 *
 * **Aritmética entera** y nunca `cents / 100` en coma flotante. El signo se separa antes
 * de dividir: con `Math.trunc(-5 / 100)` la parte entera sería `-0`, que se imprime `0` y
 * pierde el signo de los importes entre -1 y -99 céntimos.
 */
export function formatCsvAmount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);

  const units = Math.trunc(absolute / 100);
  const fraction = absolute % 100;

  return `${sign}${units}.${String(fraction).padStart(2, '0')}`;
}

/** `''` para el importe ausente: nunca `0.00`, que afirmaría un importe de cero. */
export function formatCsvAmountOrEmpty(cents: number | null): string {
  return cents === null ? '' : formatCsvAmount(cents);
}
