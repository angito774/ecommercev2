// Fuente única del rail lateral y de los `id` de cada sección: el ancla del enlace
// y el destino no pueden desalinearse porque salen de la misma fila (spec 006, T3).
export const ACCOUNT_SECTIONS = [
  { id: 'perfil', label: 'Mi perfil' },
  { id: 'favoritos', label: 'Mis favoritos' },
  { id: 'compras', label: 'Mis compras' },
] as const;

export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number]['id'];
