'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { REGISTRY_EXPORT_ERROR_MESSAGE } from '../constants';
import type { RegistryKind } from '../lib/accounting-csv';
import { exportRegistry, type RegistryDownload } from '../services/accounting.service';
import type { FinanceRange } from '../types/finance.types';

// La descarga de un blob ya traído: se crea una URL de objeto, se pulsa un ancla temporal
// y se **revoca** la URL. Sin `revokeObjectURL` el blob queda retenido hasta que se
// descarga el documento, y son archivos con todo el registro del período dentro.
function saveBlob({ blob, filename }: RegistryDownload): void {
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * `useMutation` y no `useQuery`: exportar es un gesto que se dispara, no un dato que se
 * cachea. Un `useQuery` guardaría el archivo entero en la caché de TanStack Query y lo
 * volvería a servir al reabrir la pestaña, que es justo lo contrario del `no-store` con el
 * que viaja (AC21).
 *
 * La descarga solo ocurre en `onSuccess` (AC22): ante un 403 o un 500 el service lanza, no
 * se crea ningún ancla y el usuario se queda en la pantalla con un toast. Ese es el motivo
 * de pasar por `axios` y no por un `<a download>` (D-6).
 */
export function useRegistryExport() {
  return useMutation({
    mutationFn: ({ registry, range }: { registry: RegistryKind; range: FinanceRange }) =>
      exportRegistry(registry, range),
    onSuccess: saveBlob,
    // Copy propio y no `error.message`: con `responseType: 'blob'` el cuerpo del fallo
    // llega como `Blob` y el interceptor de axios no puede leer su `{ message }`, así que
    // el mensaje del servidor no está disponible aquí (D-6).
    onError: () => {
      toast.error(REGISTRY_EXPORT_ERROR_MESSAGE);
    },
  });
}
