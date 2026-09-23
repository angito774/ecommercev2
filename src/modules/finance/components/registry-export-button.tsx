'use client';

import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { EXPORT_CSV_LABEL, REGISTRY_EXPORT_PENDING_LABEL } from '../constants';
import { useRegistryExport } from '../hooks/use-registry-export';
import type { RegistryKind } from '../lib/accounting-csv';
import type { FinanceRange } from '../types/finance.types';

type RegistryExportButtonProps = {
  registry: RegistryKind;
  /** El mismo rango aplicado en el filtro: el archivo trae lo que la tabla muestra (AC20). */
  range: FinanceRange;
  /** Para el texto accesible: «Exportar CSV» a secas no dice de cuál de las dos pestañas. */
  registryLabel: string;
};

// Presentacional: recibe qué registro y qué rango, y el hook pone la descarga y el toast
// del fallo. No conoce ni la URL ni el nombre del archivo (docs/SETUP.md §4, regla dura 2).
export function RegistryExportButton({
  registry,
  range,
  registryLabel,
}: RegistryExportButtonProps) {
  const exportMutation = useRegistryExport();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        // Deshabilitado mientras descarga: el rango entero puede tardar y un segundo clic
        // pediría el archivo dos veces.
        disabled={exportMutation.isPending}
        onClick={() => exportMutation.mutate({ registry, range })}
      >
        {exportMutation.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
        {EXPORT_CSV_LABEL}
        <span className="sr-only"> del {registryLabel}</span>
      </Button>

      {/* El estado se anuncia, no solo se pinta: quien no ve el spinner tiene que saber
          que la descarga está en marcha. Vacío cuando no hay nada que decir, para que el
          lector no repita el mensaje anterior. */}
      <p className="text-muted-foreground text-xs" role="status" aria-live="polite">
        {exportMutation.isPending ? REGISTRY_EXPORT_PENDING_LABEL : ''}
      </p>
    </div>
  );
}
