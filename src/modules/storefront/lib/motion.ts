export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;

// Se consulta en el manejador y nunca durante el render: `matchMedia` no existe en
// el servidor, así que ramificar el árbol con su valor rompe la hidratación.
export const scrollBehavior = (): ScrollBehavior =>
  prefersReducedMotion() ? 'auto' : 'smooth';
