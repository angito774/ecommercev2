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

// Postgres señala la violación de un constraint unique con el código 23505. Se
// distingue de cualquier otro fallo de escritura para no mapear todo error a 409.
// Drizzle envuelve el error del driver en un DrizzleQueryError, así que el código
// llega en `cause` y hay que recorrer la cadena.
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return false;
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
