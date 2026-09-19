import axios, { AxiosError } from 'axios';

import { ApiError } from '@/lib/errors';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

type ApiErrorBody = { message?: string; error?: string };

// Los Route Handlers responden { message } | { error }. Se normaliza aquí para
// que hooks y componentes no tengan que inspeccionar la forma de cada error.
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    // El 401 se resuelve aquí porque es el único punto que todavía conoce el status:
    // el reject de abajo colapsa el error a Error(message) y la vista ya no puede
    // distinguir una sesión expirada de un error de negocio.
    if (typeof window !== 'undefined' && error.response?.status === 401) {
      const returnTo = `${window.location.pathname}${window.location.search}`;

      // La regla pide `redirect()` o `useRouter().push()`, y ninguno existe en un
      // interceptor a nivel de módulo. Además la navegación dura es lo que se
      // quiere: la sesión ya no vale, así que conviene tirar el caché de TanStack
      // Query y dejar que Clerk resuelva el estado desde cero.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
    }

    const message =
      error.response?.data?.message ?? error.response?.data?.error ?? error.message;

    // `ApiError` y no `Error`: el mensaje sigue siendo lo que lee el 99% de las vistas,
    // pero el status y el cuerpo quedan disponibles para los pocos casos que necesitan
    // el dato estructurado (el 409 de stock trae el `productId` de la línea culpable).
    return Promise.reject(
      new ApiError(message, { status: error.response?.status, data: error.response?.data }),
    );
  },
);
