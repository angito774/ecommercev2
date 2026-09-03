import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// NFD + descarte de diacríticos antes de filtrar: sin este paso "Periféricos"
// quedaría como "perif-ricos" en vez de "perifericos".
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const UNIQUE_VIOLATION = '23505';

const MAX_CAUSE_DEPTH = 5;

type PgError = { code?: unknown; constraint?: unknown; cause?: unknown };

// Drizzle envuelve el error del driver en un DrizzleQueryError, así que el código
// de Postgres llega en `cause` y hay que recorrer la cadena hasta encontrarlo.
function findUniqueViolation(error: unknown): PgError | null {
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return null;
    const candidate = current as PgError;
    if (candidate.code === UNIQUE_VIOLATION) return candidate;
    current = candidate.cause;
  }

  return null;
}

// Postgres señala la violación de un constraint unique con el código 23505. Se
// distingue de cualquier otro fallo de escritura para no mapear todo error a 409.
export function isUniqueViolation(error: unknown): boolean {
  return findUniqueViolation(error) !== null;
}

// Nombre del constraint que saltó, p. ej. `products_sku_unique`. Hace falta cuando
// una tabla tiene más de un unique: `products` tiene `sku` y `slug`, y el booleano
// de arriba no distingue cuál de los dos chocó, así que el formulario marcaría el
// campo equivocado (spec 003, AC9). Devuelve null si el driver no lo expone: quien
// llama debe seguir tratándolo como conflicto, no como error de servidor.
export function uniqueViolationTarget(error: unknown): string | null {
  const violation = findUniqueViolation(error);
  if (!violation || typeof violation.constraint !== 'string') return null;
  return violation.constraint;
}
