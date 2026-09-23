// Único lugar donde el precio deja de ser decimal. Si esta conversión se repite en
// el formulario, en la columna y en el seed, la tercera copia es la que redondea
// distinto (spec 003 §8).

// Hasta 6 enteros y como mucho 2 decimales. El formulario valida con este mismo
// patrón, así que `toCents` nunca recibe algo que no encaje.
export const PRICE_INPUT_PATTERN = /^\d{1,6}(?:\.\d{1,2})?$/;

// Tope de cordura de cualquier importe unitario en céntimos: 999 999,99 PEN, que es el
// mayor valor que `PRICE_INPUT_PATTERN` admite teclear. Vive aquí y no en un schema
// porque ya lo usan cuatro: el precio y el precio anterior del producto, el costo
// unitario de una línea de compra y el costo inicial de precio unitario (spec 021, D-15).
export const MAX_PRICE_CENTS = 99_999_999;

// Aritmética de cadenas, no `parseFloat(value) * 100`: ese camino convierte
// "1299.90" en 129989.99999999999 y `Math.round` lo tapa hasta que un día no.
// Aquí no interviene la coma flotante en ningún paso.
export function toCents(value: string): number {
  const [whole, fraction = ''] = value.trim().split('.');
  return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
}

// Inversa exacta de `toCents`, para rellenar el formulario al editar.
export function fromCents(cents: number): string {
  const digits = String(Math.abs(cents)).padStart(3, '0');
  return `${cents < 0 ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

const formatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
});

// Aquí sí se divide: es el último paso, solo para pintar, y el valor ya no vuelve
// a la base.
export function formatPrice(cents: number): string {
  return formatter.format(cents / 100);
}
