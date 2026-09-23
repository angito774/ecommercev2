// Validación **offline** del documento del comprador. Módulo puro: sin Zod, sin red y
// sin imports de servidor, para que lo consuman por igual el schema de `POST /api/checkout`
// y el formulario del navegador (spec 022, §6.2).
//
// Lo que estas funciones afirman y lo que no: comprueban que el número **no es un valor
// tecleado al azar**. No comprueban que exista: eso exigiría consultar RENIEC o el padrón
// de SUNAT, que este spec deja explícitamente fuera de alcance (§3).

import type { buyerDocumentType } from '@/server/db/schema/order';

/** `'dni' | 'ruc'`, inferido del enum de Postgres en vez de reescrito (CLAUDE.md regla 5). */
export type BuyerDocumentType = (typeof buyerDocumentType.enumValues)[number];

const DNI_LENGTH = 8;
const RUC_LENGTH = 11;

const ONLY_DIGITS = /^\d+$/;

/**
 * Los dos primeros dígitos son el tipo de contribuyente y solo cuatro están vigentes:
 * `10` persona natural con negocio, `15` régimen transitorio, `17` no domiciliado y `20`
 * persona jurídica. Un `11` o un `30` no es un RUC con un dígito mal: es un número que
 * nunca fue un RUC, y rechazarlo aquí evita un rechazo permanente de SUNAT después.
 */
const RUC_TYPE_PREFIXES = ['10', '15', '17', '20'];

/**
 * Pesos oficiales del módulo 11 sobre los diez primeros dígitos. Es aritmética pública y
 * verificable sin ninguna llamada externa.
 */
const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Dígito verificador del RUC por módulo 11. `11 - (suma % 11)` con los dos desbordes que
 * la norma fija: `10` se colapsa a `0` y `11` a `1`. Sin ellos, todos los RUC cuyo resto
 * sea 0 o 1 se rechazarían siendo válidos.
 */
export function isValidRuc(value: string): boolean {
  if (value.length !== RUC_LENGTH || !ONLY_DIGITS.test(value)) return false;
  if (!RUC_TYPE_PREFIXES.includes(value.slice(0, 2))) return false;

  const sum = RUC_WEIGHTS.reduce(
    (total, weight, index) => total + Number(value[index]) * weight,
    0,
  );

  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder;

  return checkDigit === Number(value[RUC_LENGTH - 1]);
}

/**
 * Exactamente 8 dígitos. RENIEC no publica un verificador comprobable offline, así que lo
 * único que cabe es la forma —más el `'00000000'`, que no es un DNI sino el hueco que deja
 * quien no quiere identificarse—.
 */
export function isValidDni(value: string): boolean {
  if (value.length !== DNI_LENGTH || !ONLY_DIGITS.test(value)) return false;
  return value !== '0'.repeat(DNI_LENGTH);
}

export function isValidPeruDocument(type: BuyerDocumentType, value: string): boolean {
  return type === 'ruc' ? isValidRuc(value) : isValidDni(value);
}

/**
 * Longitud esperada por tipo. La consumen los mensajes del formulario para distinguir
 * «te faltan dígitos» de «el número no es válido» (AC2) sin repetir los dos literales.
 */
export function documentLength(type: BuyerDocumentType): number {
  return type === 'ruc' ? RUC_LENGTH : DNI_LENGTH;
}
