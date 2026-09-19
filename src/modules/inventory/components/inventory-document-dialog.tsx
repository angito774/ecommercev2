'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  transactionTypesByDirection,
  type TransactionDirection,
} from '@/lib/inventory-transactions';

import { DIRECTION_NOTE_LABELS, stockConflictProductId } from '../constants';
import { useCreateInventoryDocument } from '../hooks/use-inventory-document-mutations';
import {
  inventoryDocumentFormSchema,
  type InventoryDocumentFormValues,
} from '../schemas/inventory-document.schema';

import { DocumentLinesField, type LineProduct } from './document-lines-field';

type InventoryDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Decide qué tipos ofrece el Select. El servidor no la recibe: la deriva del catálogo (AC15). */
  direction: TransactionDirection;
};

const pad = (value: number): string => String(value).padStart(2, '0');

// Hoy en la fecha **local** del navegador, que en Perú es Lima. El servidor no deriva la
// fecha: la recibe en el cuerpo y solo comprueba que no sea futura en Lima (AC9).
function today(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const DIRECTION_HINTS: Record<TransactionDirection, string> = {
  ingreso: 'Suma unidades al stock de cada producto listado.',
  salida: 'Descuenta unidades del stock. Si no alcanza, la nota entera se rechaza.',
};

function InventoryDocumentForm({
  direction,
  onDone,
  onCancel,
}: {
  direction: TransactionDirection;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createMutation = useCreateInventoryDocument();
  const types = transactionTypesByDirection(direction);

  // Nombre, SKU y stock de cada producto añadido. Son datos de presentación y viven aquí
  // y no en el formulario, que transporta exactamente lo que el cuerpo necesita.
  const [products, setProducts] = useState<ReadonlyMap<string, LineProduct>>(new Map());

  const { control, formState, getValues, handleSubmit, register, setError } = useForm({
    resolver: zodResolver(inventoryDocumentFormSchema),
    defaultValues: {
      transaccionId: types[0].id,
      docDate: today(new Date()),
      reference: '',
      items: [],
    } satisfies InventoryDocumentFormValues,
  });

  // El 409 de stock trae el id del producto que no alcanzó: se marca sobre su línea, que
  // es lo que hay que corregir, en vez de dejarlo como un error suelto arriba (AC5).
  function markStockConflict(error: unknown, message: string): boolean {
    const productId = stockConflictProductId(error);
    if (!productId) return false;

    const index = getValues('items').findIndex((item) => item.productId === productId);
    if (index === -1) return false;

    setError(`items.${index}.quantity`, { type: 'server', message });
    return true;
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createMutation.mutateAsync({
        transaccionId: values.transaccionId,
        docDate: values.docDate,
        // Cadena vacía es «sin documento de respaldo», no una referencia vacía (D-8).
        reference: values.reference === '' ? undefined : values.reference,
        // La conversión a entero ocurre aquí, en el borde del formulario: la API solo
        // conoce números.
        items: values.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
        })),
      });
      onDone();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo registrar el documento';

      if (markStockConflict(error, message)) return;
      setError('root', { type: 'server', message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(formState.errors.transaccionId)}>
            <FieldLabel htmlFor="document-type">Tipo de transacción</FieldLabel>
            {/* `Controller` y no `register`: el Select de Radix no es un input nativo. */}
            <Controller
              control={control}
              name="transaccionId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="document-type" className="w-full">
                    {/* Texto explícito: SelectValue depende de que el item esté montado y
                        el contenido solo se monta al abrir el desplegable. */}
                    <SelectValue>
                      {types.find((type) => type.id === field.value)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Solo los tres tipos de esta dirección (AC15). */}
                    {types.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[formState.errors.transaccionId]} />
          </Field>

          <Field data-invalid={Boolean(formState.errors.docDate)}>
            <FieldLabel htmlFor="document-date">Fecha del documento</FieldLabel>
            <Input
              id="document-date"
              type="date"
              aria-invalid={Boolean(formState.errors.docDate)}
              {...register('docDate')}
            />
            <FieldDescription>No puede ser posterior a hoy.</FieldDescription>
            <FieldError errors={[formState.errors.docDate]} />
          </Field>
        </div>

        <Field data-invalid={Boolean(formState.errors.reference)}>
          <FieldLabel htmlFor="document-reference">Documento de referencia</FieldLabel>
          <Input
            id="document-reference"
            autoComplete="off"
            placeholder="F001-000123, guía 0045, OC-2026-07…"
            aria-invalid={Boolean(formState.errors.reference)}
            {...register('reference')}
          />
          <FieldDescription>Opcional: factura, guía, orden de compra o ticket.</FieldDescription>
          <FieldError errors={[formState.errors.reference]} />
        </Field>

        <DocumentLinesField
          control={control}
          register={register}
          errors={formState.errors}
          products={products}
          onSelect={(product) =>
            setProducts((current) => new Map(current).set(product.id, product))
          }
          disabled={createMutation.isPending}
        />

        {formState.errors.root ? <FieldError errors={[formState.errors.root]} /> : null}
      </FieldGroup>

      <DialogFooter className="mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={createMutation.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Registrando…' : 'Registrar documento'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function InventoryDocumentDialog({
  open,
  onOpenChange,
  direction,
}: InventoryDocumentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{DIRECTION_NOTE_LABELS[direction]}</DialogTitle>
          <DialogDescription>
            {DIRECTION_HINTS[direction]} El documento no se puede editar ni anular después:
            la corrección es una nota en sentido contrario.
          </DialogDescription>
        </DialogHeader>

        {/* Con `key`: el formulario se monta de cero al cambiar de dirección, así el tipo
            propuesto y las líneas nunca se arrastran de una nota a la otra. */}
        {open ? (
          <InventoryDocumentForm
            key={direction}
            direction={direction}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
