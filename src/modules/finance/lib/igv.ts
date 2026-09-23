// Desglose de IGV. Módulo puro, en céntimos enteros de punta a punta: la división por
// 100 solo ocurre al formatear la vista o al construir el payload del proveedor (AC27).

export const IGV_RATE = 0.18;

const IGV_DIVISOR = 1 + IGV_RATE;

export type IgvBreakdown = {
  /** Valor de venta, sin IGV. */
  baseCents: number;
  /** El **residuo**, nunca un cálculo independiente. */
  igvCents: number;
};

/**
 * Los precios del catálogo son **IGV incluido**, que es como se muestran al público en
 * Perú. Se calcula la base y el IGV es el residuo, nunca al revés:
 *
 *     base = round(total / 1.18)
 *     igv  = total − base
 *
 * Calcular `igv = round(total × 0.18 / 1.18)` por separado deja, en algunos importes,
 * `base + igv ≠ total` por un céntimo, y un comprobante que no cuadra consigo mismo lo
 * rechaza SUNAT. Con el residuo, `base + igv === total` es cierto **por construcción** y
 * no por suerte del redondeo, que es exactamente lo que afirma AC26 y lo que el `CHECK
 * electronic_documents_amount_breakdown` comprueba en la base.
 *
 * Asunción declarada (§6.4): **todo el catálogo tributa al 18% general**, sin productos
 * exonerados ni inafectos. A diferencia de `expenses.igv_cents`, aquí no es una
 * aproximación: es exactamente el desglose que se envía a Nubefact. El día que la tienda
 * venda un producto exonerado, esto es una revisión de este cálculo y no un defecto
 * oculto.
 *
 * Lanza con un importe que no sea un entero positivo. El `CHECK` de la tabla exige
 * `amount_cents > 0` y `base_cents > 0`, así que devolver `{0, 0}` solo trasladaría el
 * fallo a una violación de constraint dentro de la transacción del webhook, donde el
 * mensaje ya no diría de dónde vino.
 */
export function splitIgv(amountCents: number): IgvBreakdown {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new RangeError(
      `El importe a desglosar debe ser un entero positivo de céntimos, y llegó ${amountCents}.`,
    );
  }

  const baseCents = Math.round(amountCents / IGV_DIVISOR);

  return { baseCents, igvCents: amountCents - baseCents };
}
