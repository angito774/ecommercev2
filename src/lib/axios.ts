import axios, { AxiosError } from 'axios';

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
    const message =
      error.response?.data?.message ?? error.response?.data?.error ?? error.message;
    return Promise.reject(new Error(message));
  },
);
