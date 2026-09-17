import { shippingAddressSchema, type ShippingAddress } from '../schemas/admin-order.schema';

// `safeParse` y caída a `null` en vez de un cast: la columna es `jsonb` sin
// constraint y su forma la dicta Stripe, así que un cambio de la API de otro se
// convierte en «sin dirección registrada» y no en un TypeError dentro del detalle
// (D-12). `null` entra también por aquí: un pedido que nunca llegó a `paid` no tiene
// dirección y eso no es un error (AC11).
export function parseShippingAddress(value: unknown): ShippingAddress | null {
  const parsed = shippingAddressSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// Líneas listas para pintar, ya sin huecos: Stripe deja en `null` lo que el
// comprador no rellenó (`line2`, `state`), y una dirección con renglones vacíos se
// lee como si faltara un dato. Devuelve un array y no una cadena con saltos porque
// quien pinta decide el separador y la clave de cada `<span>`.
export function formatShippingAddress(address: ShippingAddress): string[] {
  const { name, address: parts } = address;

  const cityLine = [parts.city, parts.state, parts.postal_code].filter(Boolean).join(', ');

  return [name, parts.line1, parts.line2, cityLine, parts.country]
    .map((line) => line?.trim() ?? '')
    .filter((line) => line !== '');
}
