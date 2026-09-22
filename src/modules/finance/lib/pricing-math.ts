import { marginPercent } from './finance-math';

/** Lo que el servidor deriva de `priceCents` y `averageCostCents`. */
export type UnitMargin = {
  /** `priceCents − averageCostCents`. `null` sin costo; negativo si se vende bajo costo. */
  marginCents: number | null;
  /** `(margen / precio) × 100`, un decimal. `null` sin costo o con precio 0. */
  marginPercent: number | null;
};

const NO_COST: UnitMargin = { marginCents: null, marginPercent: null };

// Margen **sobre precio de venta**, no markup sobre costo: es la misma base que el
// `marginPercent` del resumen financiero, así que las dos pantallas del módulo dicen
// «margen» con el mismo significado.
//
// Compone en vez de calcular: `marginPercent(base, parte)` de `finance-math.ts` ya trae
// la guarda `base === 0 → null` y el redondeo a un decimal, y aquí la base es el precio
// (spec 021, D-7). Un segundo cálculo de porcentaje sería la copia que redondea distinto,
// y esa guarda es justo la que salva el caso real de `price_cents = 0`, que
// `createProductSchema` admite (`.min(0)`).
//
// Sin costo registrado los **dos** campos son `null`, nunca `0`: «no sé cuánto me cuesta»
// y «me deja cero de margen» son afirmaciones distintas y la pantalla las pinta distinto
// (AC5).
export function unitMargin(
  priceCents: number,
  averageCostCents: number | null,
): UnitMargin {
  if (averageCostCents === null) return NO_COST;

  const marginCents = priceCents - averageCostCents;

  return { marginCents, marginPercent: marginPercent(priceCents, marginCents) };
}
