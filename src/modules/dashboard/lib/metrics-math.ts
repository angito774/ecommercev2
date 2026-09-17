// Variación frente al período anterior, con un decimal.
//
// `null` cuando la base es 0 —incluso si el valor actual también lo es—: `x/0` es
// `Infinity` y `0/0` es `NaN`, y ambos se serializan como `null` en JSON por
// accidente, así que más vale decidirlo. Devolver `100` sería mentir: pasar de 0 a
// 1 venta no es un crecimiento del 100 % (D-8, AC9).
export function percentChange(value: number, previousValue: number): number | null {
  if (previousValue === 0) return null;

  const change = ((value - previousValue) / previousValue) * 100;

  // Un decimal: la precisión del dato no da para más y `29.799999999999997` en la
  // respuesta invita a que la UI lo recorte por su cuenta.
  return Math.round(change * 10) / 10;
}

// Entero en céntimos, nunca decimal: la división por 100 solo ocurre al formatear
// (AC18). Sin pedidos no hay ticket que promediar y el resultado es 0, no `NaN`.
export function averageTicketCents(revenueCents: number, orderCount: number): number {
  if (orderCount === 0) return 0;

  return Math.round(revenueCents / orderCount);
}
