// Errores de dominio, deliberadamente sin transporte: los lanzan los servicios de
// `src/server/services/` y los traduce a status HTTP `src/lib/api-guard.ts`. El
// módulo se mantiene puro (sin `next/server`) para que un servicio no dependa de
// la capa HTTP solo por señalar un fallo de negocio. Esa pureza es también lo que
// permite que `ApiError` —el fallo ya del lado del cliente— viva aquí sin arrastrar
// la instancia de axios a quien solo quiere reconocerlo.
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
  // Datos del conflicto que el cliente necesita para señalar su causa exacta —hoy, el
  // `productId` de la línea sin stock—. Viajan en el cuerpo del 409 junto al `message`,
  // igual que `issues` en el 400: el texto es para leerlo, el identificador para
  // localizar el campo sin adivinar por el nombre.
  readonly details?: Record<string, string>;

  constructor(message: string, details?: Record<string, string>) {
    super(message);
    this.name = 'ConflictError';
    this.details = details;
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

// La contraparte de cliente: el error con el que el interceptor de `src/lib/axios.ts`
// rechaza toda respuesta fallida. Conserva el status y el cuerpo, que antes se perdían
// al colapsar el fallo a `new Error(message)`; un 409 puede traer el id del recurso en
// conflicto y un formulario necesita ese id para marcar el campo exacto sin buscarlo
// dentro del texto del mensaje. Extiende `Error`, así que quien solo lee `message`
// —que es casi todo el panel— no cambia.
export class ApiError extends Error {
  readonly status?: number;
  readonly data: unknown;

  constructor(message: string, options: { status?: number; data: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.data = options.data;
  }
}
