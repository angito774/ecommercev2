// Céntimos enteros, como todo precio del proyecto (CLAUDE.md §6). El diseño usaba
// 59 € porque era una maqueta en euros; aquí la moneda es PEN, fijada por el admin
// en el spec 003, y dos monedas en la misma app son un error de datos esperando
// ocurrir (spec 004, D-21).
export const FREE_SHIPPING_THRESHOLD_CENTS = 25_000;

export const SHIPPING_COST_CENTS = 1_500;

// Clave versionada: si mañana cambia la forma de la línea, `v2` deja el carrito
// viejo sin leer en lugar de estrellarse al deserializarlo
// (regla `client-localstorage-schema`).
export const CART_STORAGE_KEY = 'nx-cart:v1';

// Tope por línea. Sin stock reservado en el cliente, es solo un freno a que alguien
// deje el contador en 9999 y el subtotal deje de tener sentido.
export const MAX_LINE_QUANTITY = 99;
