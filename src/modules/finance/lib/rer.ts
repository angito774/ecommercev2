// Renta del Régimen Especial. Módulo puro —sin Drizzle, sin React, sin Zod—, en céntimos
// enteros de punta a punta, igual que `igv.ts`: el cliente lo importa para rotular la tasa
// sin arrastrar nada de servidor (D-8).

/**
 * Régimen Especial de Renta: 1.5 % de los ingresos netos del mes, sin ajuste anual.
 *
 * **Valor normativo pendiente de confirmar** (§5.1.1): ninguna sesión ha tenido acceso a
 * fuente normativa, igual que le pasó al spec 024 con la tabla de crédito fiscal. Esta
 * constante y su test son el único sitio donde vive el valor, así que corregirlo es editar
 * un número y una prueba: ninguna otra pieza depende de cuánto vale, solo de que exista.
 */
export const RER_RATE_BASIS_POINTS = 150;

const BASIS_POINTS_DIVISOR = 10_000;

/**
 * Puntos básicos y no `× 0.015`: el módulo es entero en céntimos de punta a punta
 * (017, D-11; 022, `splitIgv`) y `0.015` no es representable en binario, así que
 * multiplicar por él introduce la misma desviación de un céntimo que `splitIgv()` evita
 * calculando el IGV como residuo (D-7). Con puntos básicos enteros la única aproximación
 * es el `round` final, que es la que la norma exige de todos modos.
 *
 * Base no positiva → `0`. Un rango cuyas notas de crédito superan lo emitido no genera un
 * crédito de Renta que este panel pueda afirmar, y devolver un impuesto negativo sería una
 * afirmación tributaria que este spec no hace (D-6, AC18). No se pierde información: la
 * base viaja con su signo real al lado del estimado.
 */
export function estimateRerIncomeTax(baseCents: number): number {
  if (baseCents <= 0) return 0;

  return Math.round((baseCents * RER_RATE_BASIS_POINTS) / BASIS_POINTS_DIVISOR);
}
