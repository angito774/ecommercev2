// Margen sobre ventas del período, con un decimal.
//
// `null` cuando no hubo ingresos —aunque el gasto también sea 0—: `x/0` es `Infinity`
// y `0/0` es `NaN`, ambos se serializan como `null` en JSON por accidente y revientan
// cualquier `toFixed`. Decidirlo explícitamente convierte el caso en un estado con
// copy propio en la UI (D-12, AC10). Misma regla que `percentChange()` del dashboard,
// así que el panel entero trata igual la división sin base.
export function marginPercent(revenueCents: number, netCents: number): number | null {
  if (revenueCents === 0) return null;

  const margin = (netCents / revenueCents) * 100;

  // Un decimal: la precisión del dato no da para más y `29.799999999999997` en la
  // respuesta invita a que la UI lo recorte por su cuenta.
  return Math.round(margin * 10) / 10;
}
