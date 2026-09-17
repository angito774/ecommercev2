// Errores de dominio, deliberadamente sin transporte: los lanzan los servicios de
// `src/server/services/` y los traduce a status HTTP `src/lib/api-guard.ts`. El
// módulo se mantiene puro (sin `next/server`) para que un servicio no dependa de
// la capa HTTP solo por señalar un fallo de negocio.
//
// `UnauthorizedError` vive en `src/lib/auth.ts` y `ForbiddenError` en
// `src/lib/permissions.ts` porque ambos están acoplados a la resolución de la
// sesión y al catálogo de permisos respectivamente.

// Un invariante de negocio que el cuerpo no podía cumplir y que Zod no puede ver
// porque depende de otra fila —hoy, una fecha de pago anterior al ingreso del empleado
// (spec 018, D-16)—. Es un 400 y no un 409: el recurso no está en conflicto, los datos
// enviados son incorrectos. Sin `issues`: la comprobación no la hace un schema, así que
// no hay ninguno que reportar, y el contrato de `src/lib/axios.ts` solo necesita el
// `message`.
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

// Un tercero del que dependemos falló (hoy, la Backend API de Clerk). Se distingue
// del 500 propio para que la UI pueda decir "no fue culpa tuya, reintenta".
export class UpstreamError extends Error {
  constructor(message: string, options?: { cause: unknown }) {
    super(message, options);
    this.name = 'UpstreamError';
  }
}
