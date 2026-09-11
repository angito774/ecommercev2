import { CARD_BRAND_LABELS } from '../constants';

// El rótulo se resuelve aquí y no en la base: persistir el texto ya formateado
// congelaría el idioma en Postgres (D-11). Lo que no esté en el mapa se muestra
// capitalizado con los guiones bajos convertidos en espacios, que es mejor que un
// hueco cuando Stripe añada una marca nueva.
export function cardBrandLabel(brand: string): string {
  const known = CARD_BRAND_LABELS[brand];
  if (known) return known;

  return brand
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// `MM/AAAA` con el mes siempre a dos dígitos: es la forma impresa en la propia
// tarjeta, así que el cliente la reconoce sin leerla.
export function formatCardExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

// Una tarjeta caduca al **final** de su mes de caducidad, no al principio: comparar
// contra el primer día del mes siguiente es lo que evita marcar como vencida una
// tarjeta que todavía sirve durante todo el mes en curso (AC14).
//
// Se calcula en el navegador con su propio reloj: `now` es un parámetro para que la
// función sea pura y comprobable, no para que la UI pase otra cosa.
export function isCardExpired(month: number, year: number, now: Date = new Date()): boolean {
  const expiresAfter = new Date(year, month, 1);
  return now >= expiresAfter;
}
