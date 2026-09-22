'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatPrice, toCents } from '@/modules/products/lib/price';

import { INITIAL_COST_IRREVERSIBLE_NOTE } from '../constants';
import { useSetInitialCost } from '../hooks/use-initial-cost-mutation';
import { initialCostFormSchema } from '../schemas/pricing.schema';
import type { PricingRow } from '../types/pricing.types';

type InitialCostDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` mientras no hay fila elegida: el formulario no se monta. */
  product: PricingRow | null;
};

function InitialCostForm({
  product,
  onDone,
  onCancel,
}: {
  product: PricingRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const mutation = useSetInitialCost();

  const { formState, handleSubmit, register, setError } = useForm({
    resolver: zodResolver(initialCostFormSchema),
    // Vacío y no el precio de venta: proponer un importe sería inventar el dato que este
    // módulo promete, y aquí no hay forma de corregirlo después (§10).
    defaultValues: { unitCost: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync({
        id: product.id,
        // La conversión a céntimos ocurre aquí, en el borde del formulario: la API solo
        // conoce enteros (AC27).
        input: { unitCostCents: toCents(values.unitCost) },
      });
      onDone();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo registrar el costo inicial';
      // El diálogo no se cierra: el mensaje del servidor —incluido el 409 de «ya tiene
      // costo»— se pinta bajo el formulario.
      setError('root', { type: 'server', message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="bg-muted/50 rounded-md border p-3 text-sm">
          <p className="font-medium">{product.name}</p>
          <p className="text-muted-foreground font-mono text-xs">{product.sku}</p>
          {/* El stock actual a la vista: es exactamente lo que se está valorizando al
              importe que se teclee, y sin verlo «180.00» no se puede interpretar. */}
          <p className="text-muted-foreground mt-2 tabular-nums">
            Stock actual: {product.stock} · Precio de venta: {formatPrice(product.priceCents)}
          </p>
        </div>

        <Field data-invalid={Boolean(formState.errors.unitCost)}>
          <FieldLabel htmlFor="initial-cost-amount">Costo unitario (S/)</FieldLabel>
          <Input
            id="initial-cost-amount"
            inputMode="decimal"
            placeholder="180.00"
            autoComplete="off"
            aria-invalid={Boolean(formState.errors.unitCost)}
            disabled={mutation.isPending}
            {...register('unitCost')}
          />
          <FieldDescription>
            Lo que costó una unidad, tal y como se pagó. Hasta dos decimales y mayor que
            cero.
          </FieldDescription>
          <FieldError errors={[formState.errors.unitCost]} />
        </Field>

        <p className="text-destructive flex gap-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{INITIAL_COST_IRREVERSIBLE_NOTE}</span>
        </p>

        {formState.errors.root ? <FieldError errors={[formState.errors.root]} /> : null}
      </FieldGroup>

      <DialogFooter className="mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Registrando…' : 'Registrar costo inicial'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// El formulario vive en un componente aparte y con `key`: al abrir el diálogo o cambiar de
// producto se monta de cero, así los valores se inicializan en el montaje en vez de
// sincronizarse con un efecto. Mismo patrón que `ExpenseFormDialog`.
export function InitialCostDialog({ open, onOpenChange, product }: InitialCostDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Costo inicial</DialogTitle>
          <DialogDescription>
            Para el stock que ya existía antes de empezar a registrar compras. A partir de
            aquí, cada nota de ingreso por compra recalcula el promedio.
          </DialogDescription>
        </DialogHeader>

        {product ? (
          <InitialCostForm
            key={product.id}
            product={product}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
